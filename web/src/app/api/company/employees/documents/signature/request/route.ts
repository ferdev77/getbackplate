import { NextResponse } from "next/server";

import { createPdfSubmission } from "@/infrastructure/docuseal/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyManagerModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const actorId = moduleAccess.userId;
  const payload = (await request.json().catch(() => null)) as {
    employeeId?: string;
    documentId?: string;
  } | null;

  const employeeId = String(payload?.employeeId ?? "").trim();
  const documentId = String(payload?.documentId ?? "").trim();
  if (!employeeId || !documentId) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("employee_documents")
    .select("status, expires_at, has_no_expiration, signature_status, linked_document:documents(id, title, file_path, owner_user_id, mime_type)")
    .eq("organization_id", tenant.organizationId)
    .eq("employee_id", employeeId)
    .eq("document_id", documentId)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  if (link.status !== "approved") {
    return NextResponse.json({ error: "Solo puedes solicitar firma en documentos aprobados" }, { status: 400 });
  }

  if (!link.expires_at && link.has_no_expiration !== true) {
    return NextResponse.json({ error: "Primero define vencimiento o sin vencimiento" }, { status: 400 });
  }

  if (link.signature_status === "requested") {
    return NextResponse.json({ error: "La firma ya fue solicitada" }, { status: 400 });
  }

  const linkedDocument = Array.isArray(link.linked_document) ? link.linked_document[0] : link.linked_document;
  if (!linkedDocument?.file_path) {
    return NextResponse.json({ error: "No se encontro archivo del documento" }, { status: 404 });
  }

  const mimeType = String(linkedDocument.mime_type ?? "").toLowerCase();
  const isPdfPath = linkedDocument.file_path.toLowerCase().endsWith(".pdf");
  if (!mimeType.includes("pdf") && !isPdfPath) {
    return NextResponse.json({ error: "La firma embebida requiere que el documento sea PDF" }, { status: 400 });
  }

  const { data: employee } = await admin
    .from("employees")
    .select("id, user_id, first_name, last_name, email, personal_email")
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee?.id) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const { data: employeeProfile } = employee.user_id
    ? await admin
        .from("organization_user_profiles")
        .select("first_name, last_name, email")
        .eq("organization_id", tenant.organizationId)
        .eq("user_id", employee.user_id)
        .maybeSingle()
    : { data: null };

  const employeeEmail = employeeProfile?.email || employee.email || employee.personal_email || null;
  if (!employeeEmail) {
    return NextResponse.json({ error: "El empleado no tiene email para firma" }, { status: 400 });
  }

  const employeeName = `${employeeProfile?.first_name ?? employee.first_name ?? ""} ${employeeProfile?.last_name ?? employee.last_name ?? ""}`.trim() || "Empleado";

  const { data: signedBlob, error: storageError } = await admin.storage
    .from("tenant-documents")
    .download(linkedDocument.file_path);

  if (storageError || !signedBlob) {
    return NextResponse.json({ error: `No se pudo abrir documento: ${storageError?.message ?? "error"}` }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await signedBlob.arrayBuffer());
  const fileBase64 = fileBuffer.toString("base64");

  try {
    const submission = await createPdfSubmission({
      name: `Firma ${linkedDocument.title}`,
      documentName: linkedDocument.title,
      documentFileBase64: fileBase64,
      submitterName: employeeName,
      submitterEmail: employeeEmail,
      externalId: `${tenant.organizationId}:${employee.id}:${documentId}`,
    });

    const signatureRequestedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("employee_documents")
      .update({
        signature_status: "requested",
        signature_provider: "docuseal",
        signature_submission_id: submission.submissionId,
        signature_submitter_slug: submission.submitterSlug,
        signature_embed_src: submission.embedSrc,
        signature_requested_by: actorId,
        signature_requested_at: signatureRequestedAt,
        signature_completed_at: null,
        signature_error: null,
      })
      .eq("organization_id", tenant.organizationId)
      .eq("employee_id", employeeId)
      .eq("document_id", documentId);

    if (updateError) {
      return NextResponse.json({ error: `No se pudo registrar solicitud de firma: ${updateError.message}` }, { status: 400 });
    }

    await logAuditEvent({
      action: "employee_document.signature.request",
      entityType: "employee_document",
      entityId: documentId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "low",
      metadata: {
        actor_user_id: actorId,
        employee_id: employeeId,
        document_id: documentId,
        signature_submission_id: submission.submissionId,
        source: "company.employees.modal",
      },
    });

    return NextResponse.json({
      ok: true,
      signatureStatus: "requested",
      signatureEmbedSrc: submission.embedSrc,
      signatureRequestedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al solicitar firma";
    await admin
      .from("employee_documents")
      .update({
        signature_status: "failed",
        signature_error: message,
      })
      .eq("organization_id", tenant.organizationId)
      .eq("employee_id", employeeId)
      .eq("document_id", documentId);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

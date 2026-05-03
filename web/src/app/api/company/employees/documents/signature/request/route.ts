import { NextResponse } from "next/server";

import {
  createPdfSubmission,
  deleteSubmission,
  DOCUSEAL_MAX_PDF_BYTES,
} from "@/infrastructure/docuseal/client";
import { isActiveSignatureStatus } from "@/infrastructure/docuseal/status-mapper";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const actorId = moduleAccess.userId;
  const payload = (await request.json().catch(() => null)) as {
    employeeId?: string;
    documentId?: string;
    force?: boolean;
  } | null;

  const employeeId = String(payload?.employeeId ?? "").trim();
  const documentId = String(payload?.documentId ?? "").trim();
  const force = Boolean(payload?.force ?? false); // Permite re-crear una submission fallida
  if (!employeeId || !documentId) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("employee_documents")
    .select("status, expires_at, has_no_expiration, signature_status, signature_submission_id, linked_document:documents(id, title, file_path, owner_user_id, mime_type)")
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

  if (isActiveSignatureStatus(link.signature_status) && !force) {
    return NextResponse.json({ error: "Ya existe una firma activa para este documento" }, { status: 400 });
  }

  if (isActiveSignatureStatus(link.signature_status) && force && link.signature_submission_id) {
    try {
      await deleteSubmission(link.signature_submission_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cancelar la firma activa";
      return NextResponse.json({ error: `No se pudo re-solicitar: ${message}` }, { status: 400 });
    }
  }

  const linkedDocument = Array.isArray(link.linked_document) ? link.linked_document[0] : link.linked_document;
  if (!linkedDocument?.file_path) {
    return NextResponse.json({ error: "No se encontró archivo del documento" }, { status: 404 });
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

  let fileBuffer = Buffer.from(await signedBlob.arrayBuffer());
  // Validar que el buffer no esté vacío
  if (fileBuffer.length < 4) {
    return NextResponse.json({ error: "El archivo descargado está vacío o corrupto" }, { status: 400 });
  }

  // Detectar Magic Bytes
  const isPdf = fileBuffer.toString("utf8", 0, 4) === "%PDF";
  const isPng = fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x4e && fileBuffer[3] === 0x47;
  const isJpg = fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff;

  if (!isPdf && !isPng && !isJpg) {
    return NextResponse.json({ error: "Solo se soportan archivos PDF, PNG o JPG para firma" }, { status: 400 });
  }

  const sanitizedTitle = String(linkedDocument.title ?? "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  let finalDocName = "";
  let documentFileUrlOrBase64 = "";

  if (isPdf) {
    // Para PDFs nativos, evitamos pasarlos por pdf-lib ya que puede corromper/quitar streams necesarios
    // para que la previsualización de DocuSeal (especialmente en Sandbox) genere la miniatura.
    // También evitamos usar URL directamente (signed URLs) porque DocuSeal a veces ignora 
    // la propiedad 'fields' cuando procesa archivos desde una URL externa.
    // La solución es pasar el archivo ORIGINAL intacto como Base64.
    const baseName = sanitizedTitle.replace(/\.[a-z0-9]{2,5}$/i, "").trim() || "documento";
    finalDocName = `${baseName}.pdf`;
    documentFileUrlOrBase64 = fileBuffer.toString("base64");
  } else {
    // Si es imagen, obligatoriamente debemos convertirla a PDF primero
    try {
      const { PDFDocument, PageSizes } = await import("pdf-lib");

      const pdfDoc = await PDFDocument.create();

      const image = isPng
        ? await pdfDoc.embedPng(fileBuffer)
        : await pdfDoc.embedJpg(fileBuffer);

      const page = pdfDoc.addPage(PageSizes.A4);
      const { width, height } = page.getSize();
      const imgDims = image.scaleToFit(width - 40, height - 40);

      page.drawImage(image, {
        x: width / 2 - imgDims.width / 2,
        y: height / 2 - imgDims.height / 2,
        width: imgDims.width,
        height: imgDims.height,
      });

      const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
      fileBuffer = Buffer.from(pdfBytes);
      
      const baseName = sanitizedTitle.replace(/\.[a-z0-9]{2,5}$/i, "").trim() || "documento_imagen";
      finalDocName = `${baseName}.pdf`;
      documentFileUrlOrBase64 = fileBuffer.toString("base64");
    } catch {
      return NextResponse.json(
        { error: "No se pudo normalizar el documento de imagen para firma." },
        { status: 400 },
      );
    }
  }

  // Si fue base64 de una imagen convertida a PDF, validamos su tamaño. Si fue firmado URL de Supabase original, no aplicamos max_bytes aquí.
  if (documentFileUrlOrBase64.length > DOCUSEAL_MAX_PDF_BYTES && !documentFileUrlOrBase64.startsWith("http")) {
    return NextResponse.json(
      { error: `El archivo convertido para firma supera el máximo permitido (${Math.floor(DOCUSEAL_MAX_PDF_BYTES / (1024 * 1024))}MB)` },
      { status: 400 },
    );
  }

  try {
    const submission = await createPdfSubmission({
      name: `Firma ${linkedDocument.title}`,
      documentName: finalDocName,
      documentFile: documentFileUrlOrBase64,
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
        signature_last_webhook_event_id: null,
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
      actorId,
      metadata: {
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
        signature_last_webhook_event_id: null,
      })
      .eq("organization_id", tenant.organizationId)
      .eq("employee_id", employeeId)
      .eq("document_id", documentId);

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

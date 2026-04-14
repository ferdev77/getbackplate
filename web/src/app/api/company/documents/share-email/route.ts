import { NextResponse } from "next/server";

import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { isEmployeeLinkedDocument } from "@/shared/lib/document-domain";

const BUCKET_NAME = "tenant-documents";

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("documents");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const body = (await request.json().catch(() => null)) as
    | {
        documentId?: string;
        email?: string;
        message?: string;
      }
    | null;

  const documentId = String(body?.documentId ?? "").trim();
  const recipientEmail = String(body?.email ?? "").trim().toLowerCase();
  const message = String(body?.message ?? "").trim();

  if (!documentId || !recipientEmail) {
    return NextResponse.json({ error: "Documento y email son obligatorios" }, { status: 400 });
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail);
  if (!emailOk) {
    return NextResponse.json({ error: "Email invalido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: document, error: documentError } = await admin
    .from("documents")
    .select("id, title, file_path, organization_id")
.is('deleted_at', null)
    .eq("id", documentId)
    .eq("organization_id", tenant.organizationId)
    .maybeSingle();

  if (documentError || !document) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const employeeLinked = await isEmployeeLinkedDocument(admin, tenant.organizationId, documentId);
  if (employeeLinked) {
    return NextResponse.json({ error: "Documento de empleado: no se comparte desde Documentos de empresa" }, { status: 403 });
  }

  if (!isSafeTenantStoragePath(document.file_path, tenant.organizationId, { allowLegacySeedPrefix: true })) {
    return NextResponse.json({ error: "Ruta de documento invalida" }, { status: 400 });
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(document.file_path, 60 * 60 * 24);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "No se pudo generar enlace de descarga" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  const html = `
    <h2 style="margin:0 0 10px 0;">Documento compartido</h2>
    <p style="margin:0 0 10px 0;color:#444;">Te compartieron el documento <strong>${document.title}</strong>.</p>
    ${message ? `<p style="margin:0 0 10px 0;color:#444;">Mensaje: ${message}</p>` : ""}
    <p style="margin:14px 0;"><a href="${signed.signedUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Descargar documento</a></p>
    <p style="margin:0;color:#666;font-size:12px;">Este enlace expira en 24 horas.</p>
    ${appUrl ? `<p style="margin:10px 0 0 0;color:#666;font-size:12px;">Plataforma: ${appUrl}</p>` : ""}
  `;

  const emailResult = await sendTransactionalEmail({
    to: recipientEmail,
    subject: `Documento compartido: ${document.title}`,
    html,
    text: `Te compartieron el documento ${document.title}. Enlace: ${signed.signedUrl}. Expira en 24 horas.`,
  });

  if (!emailResult.ok) {
    await logAuditEvent({
      action: "documents.share.email",
      entityType: "document",
      entityId: document.id,
      organizationId: tenant.organizationId,
      eventDomain: "documents",
      outcome: "error",
      severity: "medium",
      metadata: {
        recipient_email: recipientEmail,
        error: emailResult.error,
      },
    });
    return NextResponse.json({ error: `No se pudo enviar email: ${emailResult.error}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "documents.share.email",
    entityType: "document",
    entityId: document.id,
    organizationId: tenant.organizationId,
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
    metadata: {
      recipient_email: recipientEmail,
      has_custom_message: Boolean(message),
    },
  });

  return NextResponse.json({ ok: true, message: "Documento compartido por email" });
}

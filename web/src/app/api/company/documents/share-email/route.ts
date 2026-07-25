import { NextResponse } from "next/server";

import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { resolveTenantAppUrlByOrganizationId } from "@/shared/lib/custom-domains";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { isEmployeeLinkedDocument } from "@/shared/lib/document-domain";
import { buildBrandedEmailSubject, getTenantEmailBranding, resolveEmailSenderName } from "@/shared/lib/email-branding";

const BUCKET_NAME = "tenant-documents";

/** Escapes HTML special characters to prevent layout breakage and content injection via user-controlled values. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
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
    return NextResponse.json({ error: "Ruta de documento inválida" }, { status: 400 });
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(document.file_path, 60 * 60 * 24);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "No se pudo generar enlace de descarga" }, { status: 500 });
  }

  const appUrl = await resolveTenantAppUrlByOrganizationId({
    organizationId: tenant.organizationId,
    fallbackAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://getbackplate.com",
  });
  const branding = await getTenantEmailBranding(tenant.organizationId);
  const safeTitle = escapeHtml(document.title);
  const safeMessage = escapeHtml(message);
  const html = `
    <h2 style="margin:0 0 10px 0;">Shared document</h2>
    <p style="margin:0 0 10px 0;color:#444;">The document <strong>${safeTitle}</strong> has been shared with you.</p>
    ${safeMessage ? `<p style="margin:0 0 10px 0;color:#444;">Message: ${safeMessage}</p>` : ""}
    <p style="margin:14px 0;"><a href="${signed.signedUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Download document</a></p>
    <p style="margin:0;color:#666;font-size:12px;">This link expires in 24 hours.</p>
    ${appUrl ? `<p style="margin:10px 0 0 0;color:#666;font-size:12px;">Platform: ${appUrl}</p>` : ""}
  `;

  const emailResult = await sendTransactionalEmail({
    to: recipientEmail,
    subject: buildBrandedEmailSubject(`Shared document: ${document.title}`, branding),
    html,
    text: `The document ${document.title} has been shared with you. Link: ${signed.signedUrl}. It expires in 24 hours.`,
    senderName: resolveEmailSenderName(branding),
    notification: {
      source: "document_share",
      sourceId: document.id,
      organizationId: tenant.organizationId,
      actionUrl: signed.signedUrl,
      title: `Shared document: ${document.title}`,
    },
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

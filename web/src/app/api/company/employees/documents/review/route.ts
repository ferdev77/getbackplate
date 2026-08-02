import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { createNotificationsTranslator } from "@/shared/lib/notifications.i18n";
import { resolveUserLocale } from "@/shared/lib/locale";

const ALLOWED_DECISIONS = new Set(["approved", "rejected"]);

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const actorId = moduleAccess.userId;
  const supabase = await createSupabaseServerClient();

  const payload = await request.json().catch(() => null) as {
    employeeId?: string;
    documentId?: string;
    decision?: string;
    comment?: string | null;
  } | null;

  const employeeId = String(payload?.employeeId ?? "").trim();
  const documentId = String(payload?.documentId ?? "").trim();
  const decision = String(payload?.decision ?? "").trim().toLowerCase();
  const reviewComment = String(payload?.comment ?? "").trim() || null;

  if (!employeeId || !documentId || !ALLOWED_DECISIONS.has(decision)) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const [{ data: employee }, { data: document }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, user_id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", employeeId)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("id, title, owner_user_id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", documentId)
      .maybeSingle(),
  ]);

  if (!employee?.id || !document?.id) {
    return NextResponse.json({ error: "Empleado o documento no encontrado" }, { status: 404 });
  }

  if (employee.user_id && document.owner_user_id && document.owner_user_id !== employee.user_id) {
    return NextResponse.json({ error: "Solo se pueden revisar documentos cargados por el empleado" }, { status: 400 });
  }

  const reviewedAt = new Date().toISOString();
  let commentPersisted = true;
  let updateError = (
    await supabase
      .from("employee_documents")
      .update({
        status: decision,
        requested_without_file: false,
        pending_since_at: null,
        pending_reminder_stage: 0,
        pending_reminder_last_sent_at: null,
        reviewed_by: actorId,
        reviewed_at: reviewedAt,
        review_comment: reviewComment,
        expires_at: decision === "rejected" ? null : undefined,
        reminder_days: decision === "rejected" ? null : undefined,
        reminder_last_sent_at: decision === "rejected" ? null : undefined,
        reminder_sent_for_date: decision === "rejected" ? null : undefined,
        has_no_expiration: decision === "rejected" ? false : undefined,
        signature_status: decision === "rejected" ? null : undefined,
        signature_provider: decision === "rejected" ? null : undefined,
        signature_submission_id: decision === "rejected" ? null : undefined,
        signature_submitter_slug: decision === "rejected" ? null : undefined,
        signature_embed_src: decision === "rejected" ? null : undefined,
        signature_requested_by: decision === "rejected" ? null : undefined,
        signature_requested_at: decision === "rejected" ? null : undefined,
        signature_completed_at: decision === "rejected" ? null : undefined,
        signature_error: decision === "rejected" ? null : undefined,
        signature_last_webhook_event_id: decision === "rejected" ? null : undefined,
      })
      .eq("organization_id", tenant.organizationId)
      .eq("employee_id", employeeId)
      .eq("document_id", documentId)
  ).error;

  if (updateError && String(updateError.message).includes("review_comment")) {
    commentPersisted = false;
    updateError = (
      await supabase
        .from("employee_documents")
        .update({
          status: decision,
          requested_without_file: false,
          pending_since_at: null,
          pending_reminder_stage: 0,
          pending_reminder_last_sent_at: null,
          reviewed_by: actorId,
          reviewed_at: reviewedAt,
          expires_at: decision === "rejected" ? null : undefined,
          reminder_days: decision === "rejected" ? null : undefined,
          reminder_last_sent_at: decision === "rejected" ? null : undefined,
          reminder_sent_for_date: decision === "rejected" ? null : undefined,
          has_no_expiration: decision === "rejected" ? false : undefined,
          signature_status: decision === "rejected" ? null : undefined,
          signature_provider: decision === "rejected" ? null : undefined,
          signature_submission_id: decision === "rejected" ? null : undefined,
          signature_submitter_slug: decision === "rejected" ? null : undefined,
          signature_embed_src: decision === "rejected" ? null : undefined,
          signature_requested_by: decision === "rejected" ? null : undefined,
          signature_requested_at: decision === "rejected" ? null : undefined,
          signature_completed_at: decision === "rejected" ? null : undefined,
          signature_error: decision === "rejected" ? null : undefined,
          signature_last_webhook_event_id: decision === "rejected" ? null : undefined,
        })
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", employeeId)
        .eq("document_id", documentId)
    ).error;
  }

  if (updateError) {
    return NextResponse.json({ error: `No se pudo actualizar revision: ${updateError.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: decision === "approved" ? "employee_document.approve" : "employee_document.reject",
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
      comment: reviewComment,
      source: "company.employees.modal",
    },
  });

  if (employee.user_id) {
    // El aviso se escribe en español y el diccionario lo pasa a inglés cuando
    // la empresa lo lee así. Ver shared/lib/notifications.i18n.ts.
    const t = createNotificationsTranslator(
      await resolveUserLocale({ organizationId: tenant.organizationId, userId: null }),
    );
    const documento = document.title ?? "Documento";
    const approved = decision === "approved";
    void sendPushToUsers(
      [employee.user_id],
      {
        title: approved ? t("Documento aprobado") : t("Documento rechazado"),
        body: reviewComment
          ? t('"{documento}": {comentario}', { documento, comentario: reviewComment })
          : approved
            ? t('Se aprobó "{documento}".', { documento })
            : t('Se rechazó "{documento}".', { documento }),
        url: "/portal/documents",
      },
      { source: "employee_document_reviewed", sourceId: `${employeeId}:${documentId}`, organizationId: tenant.organizationId },
    );
  }

  return NextResponse.json({
    ok: true,
    status: decision,
    reviewComment: commentPersisted ? reviewComment : null,
    commentPersisted,
  });
}

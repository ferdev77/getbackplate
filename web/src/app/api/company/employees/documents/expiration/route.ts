import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const ALLOWED_REMINDER_DAYS = new Set([15, 30, 45]);

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const actorId = moduleAccess.userId;
  const supabase = await createSupabaseServerClient();

  const payload = (await request.json().catch(() => null)) as {
    employeeId?: string;
    documentId?: string;
    expiresAt?: string | null;
    reminderDays?: number | null;
    noExpiration?: boolean;
  } | null;

  const employeeId = String(payload?.employeeId ?? "").trim();
  const documentId = String(payload?.documentId ?? "").trim();
  const expiresAtRaw = String(payload?.expiresAt ?? "").trim();
  const expiresAt = expiresAtRaw || null;
  const reminderDaysRaw = payload?.reminderDays;
  const reminderDays = typeof reminderDaysRaw === "number" && Number.isFinite(reminderDaysRaw)
    ? Math.trunc(reminderDaysRaw)
    : null;
  const noExpiration = payload?.noExpiration === true;

  if (!employeeId || !documentId) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    return NextResponse.json({ error: "Fecha de vencimiento invalida" }, { status: 400 });
  }

  if (!noExpiration && !expiresAt && reminderDays) {
    return NextResponse.json({ error: "No puedes definir recordatorio sin fecha de vencimiento" }, { status: 400 });
  }

  if (!noExpiration && !expiresAt) {
    return NextResponse.json({ error: "Define una fecha de vencimiento o marca sin vencimiento" }, { status: 400 });
  }

  if (reminderDays !== null && !ALLOWED_REMINDER_DAYS.has(reminderDays)) {
    return NextResponse.json({ error: "Recordatorio invalido" }, { status: 400 });
  }

  const { data: existingLink } = await supabase
    .from("employee_documents")
    .select("status")
    .eq("organization_id", tenant.organizationId)
    .eq("employee_id", employeeId)
    .eq("document_id", documentId)
    .maybeSingle();

  if (!existingLink) {
    return NextResponse.json({ error: "Documento no encontrado para este empleado" }, { status: 404 });
  }

  if (existingLink.status !== "approved") {
    return NextResponse.json({ error: "Solo puedes configurar vencimiento en documentos aprobados" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("employee_documents")
    .update({
      expires_at: noExpiration ? null : expiresAt,
      reminder_days: noExpiration ? null : reminderDays,
      has_no_expiration: noExpiration,
      reminder_last_sent_at: null,
      reminder_sent_for_date: null,
    })
    .eq("organization_id", tenant.organizationId)
    .eq("employee_id", employeeId)
    .eq("document_id", documentId);

  if (updateError) {
    return NextResponse.json({ error: `No se pudo actualizar vencimiento: ${updateError.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee_document.expiration.update",
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
      expires_at: noExpiration ? null : expiresAt,
      reminder_days: noExpiration ? null : reminderDays,
      has_no_expiration: noExpiration,
      source: "company.employees.modal",
    },
  });

  return NextResponse.json({ ok: true, expiresAt: noExpiration ? null : expiresAt, reminderDays: noExpiration ? null : reminderDays, noExpiration });
}

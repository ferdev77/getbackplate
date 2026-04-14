import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

function parseUtcDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysUntil(targetDateOnly: string, now: Date): number {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = parseUtcDateOnly(targetDateOnly).getTime();
  const diffMs = target - todayUtc;
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export async function processEmployeeDocumentExpirationReminders() {
  const admin = createSupabaseAdminClient();
  const now = new Date();

  const { data: links, error: linksError } = await admin
    .from("employee_documents")
    .select("organization_id, employee_id, document_id, reviewed_by, status, expires_at, reminder_days, reminder_sent_for_date")
    .eq("status", "approved")
    .not("expires_at", "is", null)
    .not("reminder_days", "is", null)
    .limit(5000);

  if (linksError) {
    return { ok: false as const, processed: 0, sent: 0, failed: 0, skipped: 0, error: linksError.message };
  }

  const dueLinks = (links ?? []).filter((row) => {
    if (!row.expires_at || typeof row.reminder_days !== "number") return false;
    const daysLeft = daysUntil(row.expires_at, now);
    if (daysLeft !== row.reminder_days) return false;
    if (row.reminder_sent_for_date && row.reminder_sent_for_date === row.expires_at) return false;
    return true;
  });

  if (dueLinks.length === 0) {
    return { ok: true as const, processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const employeeIds = Array.from(new Set(dueLinks.map((row) => row.employee_id)));
  const documentIds = Array.from(new Set(dueLinks.map((row) => row.document_id)));
  const organizationIds = Array.from(new Set(dueLinks.map((row) => row.organization_id)));
  const reviewerUserIds = Array.from(new Set(dueLinks.map((row) => row.reviewed_by).filter((value): value is string => typeof value === "string" && value.length > 0)));

  const [{ data: employees }, { data: documents }, { data: organizations }] = await Promise.all([
    admin
      .from("employees")
      .select("id, organization_id, user_id, first_name, last_name, email, personal_email")
      .in("id", employeeIds),
    admin
      .from("documents")
      .select("id, title")
      .in("id", documentIds),
    admin
      .from("organizations")
      .select("id, name")
      .in("id", organizationIds),
  ]);

  const employeeUserIds = Array.from(new Set((employees ?? []).map((row) => row.user_id).filter((value): value is string => typeof value === "string" && value.length > 0)));
  const profileUserIds = Array.from(new Set([...reviewerUserIds, ...employeeUserIds]));

  const { data: profiles } = profileUserIds.length > 0
    ? await admin
        .from("organization_user_profiles")
        .select("organization_id, user_id, first_name, last_name, email")
        .in("organization_id", organizationIds)
        .in("user_id", profileUserIds)
    : { data: [] as Array<{ organization_id: string; user_id: string; first_name: string | null; last_name: string | null; email: string | null }> };

  const employeeById = new Map((employees ?? []).map((row) => [row.id, row]));
  const documentById = new Map((documents ?? []).map((row) => [row.id, row]));
  const organizationById = new Map((organizations ?? []).map((row) => [row.id, row]));
  const profileByOrgAndUser = new Map((profiles ?? []).map((row) => [`${row.organization_id}:${row.user_id}`, row]));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const link of dueLinks) {
    const employee = employeeById.get(link.employee_id);
    const doc = documentById.get(link.document_id);
    const org = organizationById.get(link.organization_id);

    if (!employee || !doc || !link.expires_at || typeof link.reminder_days !== "number") {
      skipped += 1;
      continue;
    }

    const employeeProfile = employee.user_id ? profileByOrgAndUser.get(`${link.organization_id}:${employee.user_id}`) : null;
    const reviewerProfile = link.reviewed_by ? profileByOrgAndUser.get(`${link.organization_id}:${link.reviewed_by}`) : null;

    const employeeName = `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || "Empleado";
    const reviewerName = `${reviewerProfile?.first_name ?? ""} ${reviewerProfile?.last_name ?? ""}`.trim() || "Administrador";
    const employeeEmail = employeeProfile?.email || employee.email || employee.personal_email || null;
    const reviewerEmail = reviewerProfile?.email || null;

    const recipients = Array.from(new Set([employeeEmail, reviewerEmail].filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
    if (recipients.length === 0) {
      skipped += 1;
      continue;
    }

    const dueDateLabel = new Date(`${link.expires_at}T00:00:00.000Z`).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });

    const subject = `Recordatorio: documento por vencer (${link.reminder_days} dias)`;
    const html = [
      `<p>Hola,</p>`,
      `<p>Este es un recordatorio automatico para el documento <strong>${doc.title}</strong>.</p>`,
      `<p>`,
      `Empleado: <strong>${employeeName}</strong><br/>`,
      `Empresa: <strong>${org?.name ?? "Empresa"}</strong><br/>`,
      `Fecha de vencimiento: <strong>${dueDateLabel}</strong><br/>`,
      `Recordatorio configurado: <strong>${link.reminder_days} dias antes</strong><br/>`,
      `Aprobado por: <strong>${reviewerName}</strong>`,
      `</p>`,
      `<p>Por favor revisa y actualiza la documentacion en el panel de empleados.</p>`,
    ].join("\n");

    let deliveryFailed = false;
    for (const email of recipients) {
      const result = await sendTransactionalEmail({
        to: email,
        subject,
        html,
      });
      if (!result.ok) {
        deliveryFailed = true;
        failed += 1;
      } else {
        sent += 1;
      }
    }

    if (deliveryFailed) {
      continue;
    }

    await admin
      .from("employee_documents")
      .update({
        reminder_last_sent_at: now.toISOString(),
        reminder_sent_for_date: link.expires_at,
      })
      .eq("organization_id", link.organization_id)
      .eq("employee_id", link.employee_id)
      .eq("document_id", link.document_id);
  }

  return {
    ok: true as const,
    processed: dueLinks.length,
    sent,
    failed,
    skipped,
  };
}

function daysSince(timestamp: string, now: Date) {
  const created = new Date(timestamp).getTime();
  const today = now.getTime();
  const diff = Math.max(0, today - created);
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function resolvePendingReminderStage(ageDays: number) {
  if (ageDays >= 5) return 2;
  if (ageDays >= 2) return 1;
  return 0;
}

export async function processEmployeeDocumentPendingReminders() {
  const admin = createSupabaseAdminClient();
  const now = new Date();

  const { data: links, error: linksError } = await admin
    .from("employee_documents")
    .select("organization_id, employee_id, document_id, status, requested_without_file, pending_since_at, pending_reminder_stage")
    .eq("status", "pending")
    .not("pending_since_at", "is", null)
    .limit(5000);

  if (linksError) {
    return { ok: false as const, processed: 0, sent: 0, failed: 0, skipped: 0, error: linksError.message };
  }

  const dueLinks = (links ?? []).filter((row) => {
    if (!row.pending_since_at) return false;
    const ageDays = daysSince(row.pending_since_at, now);
    const targetStage = resolvePendingReminderStage(ageDays);
    return targetStage > (row.pending_reminder_stage ?? 0);
  });

  if (dueLinks.length === 0) {
    return { ok: true as const, processed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const employeeIds = Array.from(new Set(dueLinks.map((row) => row.employee_id)));
  const documentIds = Array.from(new Set(dueLinks.map((row) => row.document_id)));
  const organizationIds = Array.from(new Set(dueLinks.map((row) => row.organization_id)));

  const [{ data: employees }, { data: documents }, { data: organizations }, { data: managerMemberships }] = await Promise.all([
    admin
      .from("employees")
      .select("id, organization_id, user_id, first_name, last_name, email, personal_email")
      .in("id", employeeIds),
    admin
      .from("documents")
      .select("id, title")
      .in("id", documentIds),
    admin
      .from("organizations")
      .select("id, name")
      .in("id", organizationIds),
    admin
      .from("memberships")
      .select("organization_id, user_id, role:roles!inner(code)")
      .eq("status", "active")
      .in("organization_id", organizationIds)
      .in("role.code", ["company_admin"]),
  ]);

  const allProfileUserIds = Array.from(
    new Set([
      ...(employees ?? []).map((row) => row.user_id).filter((value): value is string => typeof value === "string" && value.length > 0),
      ...(managerMemberships ?? []).map((row) => row.user_id).filter((value): value is string => typeof value === "string" && value.length > 0),
    ]),
  );

  const { data: profiles } = allProfileUserIds.length > 0
    ? await admin
        .from("organization_user_profiles")
        .select("organization_id, user_id, first_name, last_name, email")
        .in("organization_id", organizationIds)
        .in("user_id", allProfileUserIds)
    : { data: [] as Array<{ organization_id: string; user_id: string; first_name: string | null; last_name: string | null; email: string | null }> };

  const employeeById = new Map((employees ?? []).map((row) => [row.id, row]));
  const documentById = new Map((documents ?? []).map((row) => [row.id, row]));
  const organizationById = new Map((organizations ?? []).map((row) => [row.id, row]));
  const profileByOrgAndUser = new Map((profiles ?? []).map((row) => [`${row.organization_id}:${row.user_id}`, row]));

  const managerEmailsByOrg = new Map<string, string[]>();
  for (const membership of managerMemberships ?? []) {
    const profile = profileByOrgAndUser.get(`${membership.organization_id}:${membership.user_id}`);
    const email = profile?.email?.trim();
    if (!email) continue;
    const list = managerEmailsByOrg.get(membership.organization_id) ?? [];
    if (!list.includes(email)) list.push(email);
    managerEmailsByOrg.set(membership.organization_id, list);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const link of dueLinks) {
    const employee = employeeById.get(link.employee_id);
    const doc = documentById.get(link.document_id);
    const org = organizationById.get(link.organization_id);
    if (!employee || !doc || !link.pending_since_at) {
      skipped += 1;
      continue;
    }

    const ageDays = daysSince(link.pending_since_at, now);
    const targetStage = resolvePendingReminderStage(ageDays);
    if (targetStage <= (link.pending_reminder_stage ?? 0)) {
      skipped += 1;
      continue;
    }

    const employeeProfile = employee.user_id ? profileByOrgAndUser.get(`${link.organization_id}:${employee.user_id}`) : null;
    const employeeName = `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || "Empleado";
    const employeeEmail = employeeProfile?.email || employee.email || employee.personal_email || null;

    const recipients = link.requested_without_file
      ? [employeeEmail].filter((value): value is string => Boolean(value))
      : (managerEmailsByOrg.get(link.organization_id) ?? []);

    if (recipients.length === 0) {
      skipped += 1;
      continue;
    }

    const subject = link.requested_without_file
      ? "Recordatorio: documento pendiente de carga"
      : "Recordatorio: documento pendiente de revision";

    const html = [
      `<p>Hola,</p>`,
      `<p>Este es un recordatorio automatico sobre el documento <strong>${doc.title}</strong>.</p>`,
      `<p>`,
      `Empleado: <strong>${employeeName}</strong><br/>`,
      `Empresa: <strong>${org?.name ?? "Empresa"}</strong><br/>`,
      `Estado actual: <strong>${link.requested_without_file ? "Pendiente de carga" : "Pendiente de revision"}</strong><br/>`,
      `Tiempo en estado pendiente: <strong>${ageDays} dias</strong>`,
      `</p>`,
      `<p>${link.requested_without_file ? "Ingresa al portal y sube el archivo solicitado." : "Revisa el documento desde el panel de empleados para aprobar o rechazar."}</p>`,
    ].join("\n");

    let delivered = 0;
    for (const email of recipients) {
      const result = await sendTransactionalEmail({
        to: email,
        subject,
        html,
      });
      if (!result.ok) {
        failed += 1;
      } else {
        sent += 1;
        delivered += 1;
      }
    }

    if (delivered === 0) {
      continue;
    }

    await admin
      .from("employee_documents")
      .update({
        pending_reminder_stage: targetStage,
        pending_reminder_last_sent_at: now.toISOString(),
      })
      .eq("organization_id", link.organization_id)
      .eq("employee_id", link.employee_id)
      .eq("document_id", link.document_id);
  }

  return {
    ok: true as const,
    processed: dueLinks.length,
    sent,
    failed,
    skipped,
  };
}

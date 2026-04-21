import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendTwilioMessage } from "@/infrastructure/twilio/client";
import { getAuthEmailByUserId } from "@/shared/lib/auth-users";
import { resolveTenantAppUrlByOrganizationId } from "@/shared/lib/custom-domains";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChecklistAudienceInput = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  organizationId: string;
  targetScope: {
    locations?: string[];
    department_ids?: string[];
    position_ids?: string[];
    users?: string[];
  } | null;
  templateBranchId?: string | null;
  templateDepartmentId?: string | null;
};

// ---------------------------------------------------------------------------
// Audience Resolution
// ---------------------------------------------------------------------------

export async function resolveChecklistAudienceContacts(input: ChecklistAudienceInput) {
  const scope = input.targetScope ?? {};
  const locationIds = Array.isArray(scope.locations) ? scope.locations.filter(Boolean) : [];
  const departmentIds = Array.isArray(scope.department_ids) ? scope.department_ids.filter(Boolean) : [];
  const positionIds = Array.isArray(scope.position_ids) ? scope.position_ids.filter(Boolean) : [];
  const scopedUserIds = Array.isArray(scope.users) ? scope.users.filter(Boolean) : [];

  const [{ data: employees }, { data: positionRows }, { data: memberships }, { data: profiles }] = await Promise.all([
    input.supabase
      .from("employees")
      .select("user_id, branch_id, department_id, position, status, phone_country_code, phone")
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .not("user_id", "is", null),
    input.supabase
      .from("department_positions")
      .select("id, name")
      .eq("organization_id", input.organizationId)
      .eq("is_active", true),
    input.supabase
      .from("memberships")
      .select("user_id")
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .not("user_id", "is", null),
    input.supabase
      .from("organization_user_profiles")
      .select("user_id, branch_id, department_id, position_id, phone, status")
      .eq("organization_id", input.organizationId)
      .eq("status", "active"),
  ]);

  const positionIdsByName = new Map<string, string[]>();
  for (const row of positionRows ?? []) {
    const key = row.name.trim().toLowerCase();
    if (!key) continue;
    const list = positionIdsByName.get(key) ?? [];
    list.push(row.id);
    positionIdsByName.set(key, list);
  }

  const recipientUserIds = new Set<string>();
  const membershipUserIds = new Set((memberships ?? []).map((row) => row.user_id).filter(Boolean));

  for (const employee of employees ?? []) {
    if (!employee.user_id) continue;
    const byTemplateBranch = Boolean(input.templateBranchId) && employee.branch_id === input.templateBranchId;
    const byTemplateDepartment =
      Boolean(input.templateDepartmentId) && employee.department_id === input.templateDepartmentId;
    const byLocationScope = locationIds.length > 0 && Boolean(employee.branch_id) && locationIds.includes(employee.branch_id);
    const byDepartmentScope =
      departmentIds.length > 0 && Boolean(employee.department_id) && departmentIds.includes(employee.department_id);
    const employeePositionIds = employee.position
      ? positionIdsByName.get(employee.position.trim().toLowerCase()) ?? []
      : [];
    const byPositionScope =
      positionIds.length > 0 && employeePositionIds.some((positionId) => positionIds.includes(positionId));
    const byUserScope = scopedUserIds.length > 0 && scopedUserIds.includes(employee.user_id);

    const hasAnyScope =
      locationIds.length > 0 || departmentIds.length > 0 || positionIds.length > 0 || scopedUserIds.length > 0;

    const isInAudience = hasAnyScope
      ? byLocationScope || byDepartmentScope || byPositionScope || byUserScope
      : byTemplateBranch || byTemplateDepartment || (!input.templateBranchId && !input.templateDepartmentId);

    if (isInAudience) {
      recipientUserIds.add(employee.user_id);
    }
  }

  const hasAnyScope =
    locationIds.length > 0 || departmentIds.length > 0 || positionIds.length > 0 || scopedUserIds.length > 0;

  for (const profile of profiles ?? []) {
    if (!profile.user_id) continue;

    const byTemplateBranch = Boolean(input.templateBranchId) && profile.branch_id === input.templateBranchId;
    const byTemplateDepartment =
      Boolean(input.templateDepartmentId) && profile.department_id === input.templateDepartmentId;
    const byLocationScope =
      locationIds.length > 0 && Boolean(profile.branch_id) && locationIds.includes(profile.branch_id);
    const byDepartmentScope =
      departmentIds.length > 0 && Boolean(profile.department_id) && departmentIds.includes(profile.department_id);
    const byPositionScope =
      positionIds.length > 0 && Boolean(profile.position_id) && positionIds.includes(profile.position_id);
    const byUserScope = scopedUserIds.length > 0 && scopedUserIds.includes(profile.user_id);

    const isInAudience = hasAnyScope
      ? byLocationScope || byDepartmentScope || byPositionScope || byUserScope
      : byTemplateBranch || byTemplateDepartment || (!input.templateBranchId && !input.templateDepartmentId);

    if (isInAudience) {
      recipientUserIds.add(profile.user_id);
    }
  }

  if (!hasAnyScope && !input.templateBranchId && !input.templateDepartmentId) {
    for (const userId of membershipUserIds) {
      recipientUserIds.add(userId);
    }
  }

  for (const scopedUserId of scopedUserIds) {
    recipientUserIds.add(scopedUserId);
  }

  const emailByUserId = await getAuthEmailByUserId([...recipientUserIds]);
  const recipients = [...new Set([...emailByUserId.values()].filter(Boolean))];

  const recipientPhones = new Set<string>();
  for (const employee of employees ?? []) {
    if (!employee.user_id || !recipientUserIds.has(employee.user_id) || !employee.phone) {
      continue;
    }

    const code = (employee.phone_country_code || "").replace(/[^0-9+]/g, "");
    const number = employee.phone.replace(/[^0-9]/g, "");
    if (!number) continue;

    let fullNumber = number;
    if (code && !number.startsWith(code) && !number.startsWith(code.replace("+", ""))) {
      fullNumber = `${code}${number}`;
    } else if (number.startsWith("+")) {
      fullNumber = number;
    } else {
      fullNumber = `+${number}`;
    }

    recipientPhones.add(fullNumber);
  }

  for (const profile of profiles ?? []) {
    if (!profile.user_id || !recipientUserIds.has(profile.user_id) || !profile.phone) {
      continue;
    }

    const number = profile.phone.replace(/[^0-9+]/g, "");
    if (!number) continue;
    recipientPhones.add(number.startsWith("+") ? number : `+${number}`);
  }

  return {
    emails: recipients,
    phones: [...recipientPhones],
  };
}

// ---------------------------------------------------------------------------
// Email Delivery
// ---------------------------------------------------------------------------

export async function sendChecklistAudienceEmail(input: ChecklistAudienceInput & {
  templateName: string;
  event: "created" | "submitted";
  itemsCount: number;
  flaggedCount?: number;
  actorEmail?: string;
}) {
  const contacts = await resolveChecklistAudienceContacts(input);
  if (!contacts.emails.length) return 0;

  const appUrl = await resolveTenantAppUrlByOrganizationId({
    organizationId: input.organizationId,
    fallbackAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://getbackplate.com",
  });
  const reportsUrl = appUrl ? `${appUrl}/app/reports` : "/app/reports";
  const subject =
    input.event === "created"
      ? `Nuevo checklist creado: ${input.templateName}`
      : `Checklist enviado: ${input.templateName}`;
  const html =
    input.event === "created"
      ? `
    <h2 style="margin:0 0 10px 0;">Nuevo checklist creado</h2>
    <p style="margin:0 0 8px 0;color:#444;">Plantilla: <strong>${input.templateName}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Items: <strong>${input.itemsCount}</strong></p>
    <p style="margin:0 0 14px 0;color:#444;">Creado por: <strong>${input.actorEmail ?? "Usuario interno"}</strong></p>
    <p style="margin:14px 0 0 0;"><a href="${reportsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Ver checklists</a></p>
  `
      : `
    <h2 style="margin:0 0 10px 0;">Checklist enviado</h2>
    <p style="margin:0 0 8px 0;color:#444;">Plantilla: <strong>${input.templateName}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Items: <strong>${input.itemsCount}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Incidencias: <strong>${input.flaggedCount ?? 0}</strong></p>
    <p style="margin:0 0 14px 0;color:#444;">Enviado por: <strong>${input.actorEmail ?? "Usuario interno"}</strong></p>
    <p style="margin:14px 0 0 0;"><a href="${reportsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Ver en reportes</a></p>
  `;
  const text =
    input.event === "created"
      ? `Nuevo checklist creado\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nCreado por: ${input.actorEmail ?? "Usuario interno"}\nVer checklists: ${reportsUrl}`
      : `Checklist enviado\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nIncidencias: ${input.flaggedCount ?? 0}\nEnviado por: ${input.actorEmail ?? "Usuario interno"}\nVer en reportes: ${reportsUrl}`;

  await Promise.allSettled(contacts.emails.map((to) => sendTransactionalEmail({ to, subject, html, text })));
  return contacts.emails.length;
}

// ---------------------------------------------------------------------------
// SMS / WhatsApp Delivery
// ---------------------------------------------------------------------------

export async function sendChecklistAudienceTwilio(input: ChecklistAudienceInput & {
  channel: "sms" | "whatsapp";
  templateName: string;
  itemsCount: number;
  actorEmail?: string;
}) {
  const contacts = await resolveChecklistAudienceContacts(input);
  if (!contacts.phones.length) return 0;

  const body =
    input.channel === "whatsapp"
      ? `*Nuevo checklist creado*\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nCreado por: ${input.actorEmail ?? "Usuario interno"}`
      : `Nuevo checklist creado\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nCreado por: ${input.actorEmail ?? "Usuario interno"}`;

  const results = await Promise.allSettled(
    contacts.phones.map((phone) => sendTwilioMessage(phone, body, input.channel)),
  );

  return results.filter((result) => result.status === "fulfilled" && result.value.success).length;
}

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { resolveEmployeeAllowedLocationIds } from "@/shared/lib/employee-api-scope";
import type { MaintenancePriority, MaintenanceStatus } from "@/modules/maintenance/types";

type AnySupabase = ReturnType<typeof createSupabaseAdminClient> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  draft: "Borrador",
  submitted: "Enviada",
  visit_scheduled: "Visita programada",
  in_progress: "En progreso",
  needs_parts: "Requiere repuesto",
  needs_followup: "Requiere otra visita",
  resolved: "Resuelta",
  cancelled: "Cancelada",
};

const PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

async function resolveMaintenanceResponderAudience(params: {
  organizationId: string;
  branchId: string;
  excludeUserId?: string | null;
}): Promise<{ adminUserIds: string[]; employeeUserIds: string[] }> {
  const admin = createSupabaseAdminClient() as AnySupabase;

  const { data: roleRows } = await admin
    .from("roles")
    .select("id, code")
    .in("code", ["company_admin", "employee"]);

  const companyAdminRoleId = (roleRows ?? []).find((row: { code: string }) => row.code === "company_admin")?.id;
  const employeeRoleId = (roleRows ?? []).find((row: { code: string }) => row.code === "employee")?.id;

  const { data: memberships } = await admin
    .from("memberships")
    .select("id, user_id, role_id")
    .eq("organization_id", params.organizationId)
    .eq("status", "active");

  const adminUserIds = new Set<string>();
  const employeeMemberships: Array<{ id: string; user_id: string }> = [];

  for (const membership of memberships ?? []) {
    if (!membership.user_id) continue;
    if (companyAdminRoleId && membership.role_id === companyAdminRoleId) {
      adminUserIds.add(membership.user_id);
    } else if (employeeRoleId && membership.role_id === employeeRoleId) {
      employeeMemberships.push({ id: membership.id, user_id: membership.user_id });
    }
  }

  const employeeUserIds = new Set<string>();

  if (employeeMemberships.length) {
    const { data: permissionRows } = await admin
      .from("employee_module_permissions")
      .select("membership_id")
      .eq("organization_id", params.organizationId)
      .eq("module_code", "maintenance")
      .eq("can_edit", true)
      .in("membership_id", employeeMemberships.map((membership) => membership.id));

    const membershipIdsWithEdit = new Set((permissionRows ?? []).map((row: { membership_id: string }) => row.membership_id));
    const candidateUserIds = employeeMemberships
      .filter((membership) => membershipIdsWithEdit.has(membership.id))
      .map((membership) => membership.user_id);

    const scopedResults = await Promise.all(
      candidateUserIds.map(async (userId) => {
        const allowedLocationIds = await resolveEmployeeAllowedLocationIds(params.organizationId, userId);
        return allowedLocationIds.includes(params.branchId) ? userId : null;
      }),
    );

    for (const userId of scopedResults) {
      if (userId) employeeUserIds.add(userId);
    }
  }

  if (params.excludeUserId) {
    adminUserIds.delete(params.excludeUserId);
    employeeUserIds.delete(params.excludeUserId);
  }

  return { adminUserIds: [...adminUserIds], employeeUserIds: [...employeeUserIds] };
}

async function dispatchMaintenancePush(params: {
  organizationId: string;
  requestId: string;
  title: string;
  body: string;
  adminUserIds: string[];
  employeeUserIds: string[];
}) {
  try {
    if (params.adminUserIds.length) {
      await sendPushToUsers(
        params.adminUserIds,
        { title: params.title, body: params.body, url: "/app/maintenance" },
        { source: "maintenance", sourceId: params.requestId, organizationId: params.organizationId },
      );
    }
    if (params.employeeUserIds.length) {
      await sendPushToUsers(
        params.employeeUserIds,
        { title: params.title, body: params.body, url: "/portal/maintenance" },
        { source: "maintenance", sourceId: params.requestId, organizationId: params.organizationId },
      );
    }
  } catch (error) {
    console.error("[maintenance] Error enviando notificaciones push:", error instanceof Error ? error.message : error);
  }
}

export async function notifyMaintenanceRequestCreated(params: {
  organizationId: string;
  requestId: string;
  createdByUserId: string;
  branchId: string;
  title: string;
  priority: MaintenancePriority;
}) {
  try {
    const { adminUserIds, employeeUserIds } = await resolveMaintenanceResponderAudience({
      organizationId: params.organizationId,
      branchId: params.branchId,
      excludeUserId: params.createdByUserId,
    });

    if (!adminUserIds.length && !employeeUserIds.length) return;

    await dispatchMaintenancePush({
      organizationId: params.organizationId,
      requestId: params.requestId,
      title: "Nueva solicitud de mantenimiento",
      body: `${params.title} · Prioridad: ${PRIORITY_LABELS[params.priority]}`,
      adminUserIds,
      employeeUserIds,
    });
  } catch (error) {
    console.error("[maintenance] Error resolviendo audiencia de notificacion (created):", error instanceof Error ? error.message : error);
  }
}

export async function notifyMaintenanceRequestUpdated(params: {
  organizationId: string;
  requestId: string;
  actorUserId: string;
  createdByUserId: string;
  branchId: string;
  title: string;
  toStatus: MaintenanceStatus;
}) {
  try {
    const { adminUserIds, employeeUserIds } = await resolveMaintenanceResponderAudience({
      organizationId: params.organizationId,
      branchId: params.branchId,
      excludeUserId: params.actorUserId,
    });

    const recipientAdminIds = new Set(adminUserIds);
    const recipientEmployeeIds = new Set(employeeUserIds);

    if (params.createdByUserId !== params.actorUserId && !recipientAdminIds.has(params.createdByUserId)) {
      recipientEmployeeIds.add(params.createdByUserId);
    }

    if (!recipientAdminIds.size && !recipientEmployeeIds.size) return;

    await dispatchMaintenancePush({
      organizationId: params.organizationId,
      requestId: params.requestId,
      title: "Actualización de solicitud de mantenimiento",
      body: `${params.title} · Estado: ${STATUS_LABELS[params.toStatus]}`,
      adminUserIds: [...recipientAdminIds],
      employeeUserIds: [...recipientEmployeeIds],
    });
  } catch (error) {
    console.error("[maintenance] Error resolviendo audiencia de notificacion (updated):", error instanceof Error ? error.message : error);
  }
}

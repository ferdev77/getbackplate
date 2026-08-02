import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { companyAdminUserIds, destinatarios, employeesWhoCanOperate } from "@/shared/lib/notification-recipients";

const MODULO = "vendors";

/**
 * Avisa a quienes gestionan proveedores: los company_admins y los empleados
 * con permiso delegado de editar el modulo (excluye a quien hizo la accion).
 *
 * Se manda por separado a cada audiencia porque cada una tiene su propia
 * pantalla (`/app/vendors` vs `/portal/vendors`), no un unico link valido
 * para los dos.
 */
export async function notifyVendorEvent(params: {
  supabase: SupabaseClient;
  organizationId: string;
  actorId: string | null;
  title: string;
  body: string;
  source: string;
}): Promise<void> {
  const [admins, operativos] = await Promise.all([
    companyAdminUserIds(params.supabase, params.organizationId),
    employeesWhoCanOperate(params.supabase, params.organizationId, MODULO),
  ]);

  const adminIds = destinatarios(admins, params.actorId);
  const employeeIds = destinatarios(
    operativos.filter((id) => !admins.includes(id)),
    params.actorId,
  );

  const payload = { title: params.title, body: params.body };
  const options = { source: params.source, organizationId: params.organizationId };

  await Promise.all([
    adminIds.length ? sendPushToUsers(adminIds, { ...payload, url: "/app/vendors" }, options) : null,
    employeeIds.length ? sendPushToUsers(employeeIds, { ...payload, url: "/portal/vendors" }, options) : null,
  ]);
}

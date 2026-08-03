import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPushToUsers, type PushNotificationOptions } from "@/infrastructure/push/send-to-org";
import { companyAdminUserIds } from "@/shared/lib/notification-recipients";

/**
 * Una notificacion, dos destinos.
 *
 * El panel de empresa (`/app/...`) y el portal del empleado (`/portal/...`) son
 * dos aplicaciones distintas: no hay una URL que sirva para los dos. Cuando una
 * notificacion sale hacia una audiencia mixta hay que partirla, o la mitad de la
 * gente toca la campanita y cae en una pantalla que no le corresponde.
 *
 * Paso de verdad: los avisos de checklist se mandaban a `/app/reports` para todo
 * el mundo, pero la audiencia de un checklist se resuelve por sucursal,
 * departamento y puesto -- es decir, empleados. Tocaban la notificacion y
 * llegaban al panel de administracion.
 *
 * El patron original es el de `modules/vendors/notifications.ts`, que ya
 * mandaba dos pushes separados. Esto lo generaliza para los modulos que
 * resuelven una sola lista de destinatarios y no saben de que rol es cada uno.
 *
 * Nota sobre la campanita: `sendPushToUsers` escribe la fila `in_app` de cada
 * destinatario, asi que partir el envio tambien parte la campanita, y cada uno
 * queda con el link correcto guardado en su historial.
 */
export async function sendPushPorRol(params: {
  supabase: SupabaseClient;
  organizationId: string;
  /** La audiencia ya resuelta, sin distinguir rol. */
  userIds: string[];
  payload: { title: string; body: string };
  /** Adonde va un company_admin. */
  adminUrl: string;
  /** Adonde va todo el resto (empleados con portal). */
  employeeUrl: string;
  options: PushNotificationOptions;
}): Promise<number> {
  const destinatarios = [...new Set(params.userIds.filter(Boolean))];
  if (destinatarios.length === 0) return 0;

  const admins = new Set(await companyAdminUserIds(params.supabase, params.organizationId));

  const paraAdmin = destinatarios.filter((id) => admins.has(id));
  const paraEmpleado = destinatarios.filter((id) => !admins.has(id));

  const resultados = await Promise.all([
    paraAdmin.length
      ? sendPushToUsers(paraAdmin, { ...params.payload, url: params.adminUrl }, params.options)
      : null,
    paraEmpleado.length
      ? sendPushToUsers(paraEmpleado, { ...params.payload, url: params.employeeUrl }, params.options)
      : null,
  ]);

  return resultados.reduce((total, resultado) => total + (resultado?.sent ?? 0), 0);
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { createNotificationsTranslator } from "@/shared/lib/notifications.i18n";
import { resolveUserLocale } from "@/shared/lib/locale";
import {
  companyAdminUserIds,
  destinatarios,
  employeesWhoCanOperateWithScope,
} from "@/shared/lib/notification-recipients";

const MODULO = "vendors";

/**
 * Las sucursales de un proveedor, tal como las guarda vendor_locations.
 *
 * Una fila con branch_id null significa "global": el proveedor vale para toda
 * la empresa. Se devuelve [] en ese caso, que es como se representa aca.
 */
export async function sucursalesDelProveedor(
  supabase: SupabaseClient,
  organizationId: string,
  vendorId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("vendor_locations")
    .select("branch_id")
    .eq("organization_id", organizationId)
    .eq("vendor_id", vendorId);

  return (data ?? []).map((fila) => fila.branch_id).filter((id): id is string => Boolean(id));
}

/**
 * Avisa a quienes gestionan proveedores: los company_admins y los empleados
 * con permiso delegado de editar el modulo (excluye a quien hizo la accion).
 *
 * Se manda por separado a cada audiencia porque cada una tiene su propia
 * pantalla (`/app/vendors` vs `/portal/vendors`), no un unico link valido
 * para los dos.
 *
 * Los empleados se filtran por la sucursal del proveedor. Sin ese filtro le
 * llegaba el aviso de un proveedor de otro local a gente que ni siquiera puede
 * verlo en la app (resolveEmployeeVendorScope solo muestra los de sus
 * locaciones): tocaban la notificacion y no encontraban nada. Los admins
 * entran siempre, que alcanzan toda la empresa.
 */
export async function notifyVendorEvent(params: {
  supabase: SupabaseClient;
  organizationId: string;
  actorId: string | null;
  /** En español: el diccionario lo pasa a inglés si la empresa lo lee así. */
  title: string;
  /** El nombre del proveedor: es un dato, no se traduce. */
  body: string;
  source: string;
  /**
   * Sucursales del proveedor. Vacio significa global (vale para toda la
   * empresa), asi que en ese caso no se filtra a nadie.
   */
  branchIds: string[];
}): Promise<void> {
  const [admins, operativos, locale] = await Promise.all([
    companyAdminUserIds(params.supabase, params.organizationId),
    employeesWhoCanOperateWithScope(params.supabase, params.organizationId, MODULO),
    resolveUserLocale({ organizationId: params.organizationId, userId: null }),
  ]);
  const t = createNotificationsTranslator(locale);

  const esGlobal = params.branchIds.length === 0;
  const delProveedor = new Set(params.branchIds);

  const operativosEnAlcance = operativos
    .filter(
      (persona) =>
        esGlobal ||
        persona.alcanzaTodas ||
        persona.locationIds.some((locationId) => delProveedor.has(locationId)),
    )
    .map((persona) => persona.userId);

  const adminIds = destinatarios(admins, params.actorId);
  const employeeIds = destinatarios(
    operativosEnAlcance.filter((id) => !admins.includes(id)),
    params.actorId,
  );

  const payload = { title: t(params.title), body: params.body };
  const options = { source: params.source, organizationId: params.organizationId };

  await Promise.all([
    adminIds.length ? sendPushToUsers(adminIds, { ...payload, url: "/app/vendors" }, options) : null,
    employeeIds.length ? sendPushToUsers(employeeIds, { ...payload, url: "/portal/vendors" }, options) : null,
  ]);
}

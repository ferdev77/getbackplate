import type { SupabaseClient } from "@supabase/supabase-js";

import { combinarLocaciones } from "@/modules/employees/lib/location-sources";

/**
 * A quien se le avisa de algo, resuelto en un solo lugar.
 *
 * Antes cada servicio armaba su propia consulta de destinatarios. Este archivo
 * existe para que "los admins" y "los que pueden operar el modulo" signifiquen
 * lo mismo en todos lados.
 */

/** Company admins de la organizacion. Ven y operan todo. */
export async function companyAdminUserIds(supabase: SupabaseClient, organizationId: string) {
  const { data: rol } = await supabase
    .from("roles")
    .select("id")
    .eq("code", "company_admin")
    .maybeSingle();

  if (!rol?.id) return [];

  const { data: filas } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role_id", rol.id)
    .eq("status", "active");

  return (filas ?? []).map((fila) => fila.user_id).filter((id): id is string => Boolean(id));
}

/**
 * Empleados con permiso delegado para *operar* un modulo, es decir para actuar
 * sobre lo que ya existe: cambiar un estado, dejar un avance, resolver.
 *
 * Es `can_edit` y no `can_create`: quien solo puede crear reporta, pero no
 * atiende. Los permisos se guardan por membresia, asi que hay que traducirlos a
 * usuario.
 */
export async function employeesWhoCanOperate(
  supabase: SupabaseClient,
  organizationId: string,
  moduleCode: string,
) {
  const { data: permisos } = await supabase
    .from("employee_module_permissions")
    .select("membership_id")
    .eq("organization_id", organizationId)
    .eq("module_code", moduleCode)
    .eq("can_edit", true);

  const membresias = (permisos ?? [])
    .map((fila) => fila.membership_id)
    .filter((id): id is string => Boolean(id));

  if (membresias.length === 0) return [];

  const { data: filas } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("id", membresias);

  return (filas ?? []).map((fila) => fila.user_id).filter((id): id is string => Boolean(id));
}

/**
 * Deja la lista final: sin repetidos, sin vacios y sin quien acaba de hacer la
 * accion, que no necesita que le avisen de lo suyo.
 */
export function destinatarios(candidatos: Array<string | null | undefined>, excluir: string | null) {
  return [...new Set(candidatos.filter((id): id is string => Boolean(id) && id !== excluir))];
}

/**
 * Igual que employeesWhoCanOperate, pero ademas dice que locaciones alcanza
 * cada uno.
 *
 * Hace falta para no avisarle a alguien de un local donde no trabaja. Paso de
 * verdad: una encargada de un solo local recibia los avisos de los siete, y
 * ninguna de las solicitudes que le llegaron era de su local.
 *
 * Devuelve el alcance sin resolver a proposito -- quien llama decide si filtra
 * por una locacion puntual y si el aviso necesita aclarar de cual se trata.
 */
export async function employeesWhoCanOperateWithScope(
  supabase: SupabaseClient,
  organizationId: string,
  moduleCode: string,
): Promise<Array<{ userId: string; locationIds: string[]; alcanzaTodas: boolean }>> {
  const { data: permisos } = await supabase
    .from("employee_module_permissions")
    .select("membership_id")
    .eq("organization_id", organizationId)
    .eq("module_code", moduleCode)
    .eq("can_edit", true);

  const membresias = (permisos ?? [])
    .map((fila) => fila.membership_id)
    .filter((id): id is string => Boolean(id));

  if (membresias.length === 0) return [];

  const [{ data: filas }, { data: sucursales }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, branch_id, all_locations, location_scope_ids")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("id", membresias),
    supabase
      .from("branches")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);

  const userIds = (filas ?? []).map((f) => f.user_id).filter((id): id is string => Boolean(id));
  if (userIds.length === 0) return [];

  // El legajo tambien guarda alcance: se suma, igual que en el resto del sistema.
  const { data: legajos } = await supabase
    .from("employees")
    .select("user_id, branch_id, all_locations, location_scope_ids")
    .eq("organization_id", organizationId)
    .in("user_id", userIds);

  const todasLasLocaciones = (sucursales ?? []).map((f) => f.id).filter(Boolean);
  const legajoPorUsuario = new Map((legajos ?? []).map((f) => [f.user_id, f]));

  return (filas ?? [])
    .filter((f): f is typeof f & { user_id: string } => Boolean(f.user_id))
    .map((f) => {
      const { locationIds, alcanzaTodas } = combinarLocaciones({
        fuentes: [f, legajoPorUsuario.get(f.user_id) ?? null],
        todasLasLocaciones,
      });
      return { userId: f.user_id, locationIds, alcanzaTodas };
    });
}

/**
 * Si sigue siendo miembro activo de la organizacion. Hace falta para no confiar
 * ciegamente en un user_id guardado hace tiempo (ej: "quien reporto esto") --
 * puede ya no tener membresia real ahi, como un superadmin que lo creo
 * impersonando para probar el modulo.
 */
export async function isActiveMember(supabase: SupabaseClient, organizationId: string, userId: string) {
  const { data } = await supabase
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Cuando el mismo evento se manda por push Y por email a gente que se
 * superpone, el email no debe repetir la fila que el push ya garantiza en la
 * campanita (ver `_sendToSubscriptions` en send-to-org.ts y el companion de
 * `sendTransactionalEmail` en infrastructure/email/client.ts).
 *
 * Devuelve el valor a pasar como `notification.userId` de un email: `null` si
 * ese destinatario ya esta en el grupo de push de este mismo aviso (evita
 * duplicar), o el mismo userId (o `undefined` si no se sabe) si no esta, para
 * que el email le arme su propia fila -- es la unica via en que se entera.
 */
export function userIdParaEmailSinDuplicarCampanita(
  candidateUserId: string | null | undefined,
  pushUserIds: Iterable<string>,
): string | null | undefined {
  if (!candidateUserId) return candidateUserId;
  const yaEnPush = pushUserIds instanceof Set ? pushUserIds : new Set(pushUserIds);
  return yaEnPush.has(candidateUserId) ? null : candidateUserId;
}

import type { SupabaseClient } from "@supabase/supabase-js";

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

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEnabledModules } from "@/modules/organizations/queries";

/**
 * Como se llama una sucursal para mostrarsela a alguien.
 *
 * Misma regla que usa el resto del sistema: con custom_branding activo manda la
 * ciudad, si no el nombre. Importa que coincida -- si el aviso dijera un nombre
 * y la pantalla otro, parecerian dos lugares distintos.
 *
 * Devuelve null cuando no hay sucursal: quien llama decide si omite el dato.
 */
export async function nombreDeLaLocacion(
  supabase: SupabaseClient,
  organizationId: string,
  branchId: string | null | undefined,
): Promise<string | null> {
  if (!branchId) return null;

  const [{ data: branch }, modulos] = await Promise.all([
    supabase
      .from("branches")
      .select("name, city")
      .eq("organization_id", organizationId)
      .eq("id", branchId)
      .maybeSingle(),
    getEnabledModules(organizationId),
  ]);

  if (!branch) return null;
  return (modulos.has("custom_branding") && branch.city ? branch.city : branch.name) || null;
}

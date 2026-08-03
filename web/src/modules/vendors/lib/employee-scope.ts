import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveEmployeeAllowedLocationIds } from "@/modules/employees/lib/api-scope";

/**
 * Que proveedores puede ver y tocar un empleado.
 *
 * Un company admin no pasa por aca: alcanza toda la organizacion. Un empleado
 * solo ve los proveedores de sus locaciones, y solo puede crearlos o editarlos
 * dentro de ellas.
 *
 * Las locaciones salen de resolveEmployeeAllowedLocationIds, el mismo resolvedor
 * que usa el resto: contempla la sucursal propia, las asignadas y el permiso de
 * todas las locaciones. Armar la lista a mano fue justamente lo que dejo a un
 * empleado sin poder revisar reportes de sus otras locaciones.
 */

export type EmployeeVendorScope = {
  allowedLocationIds: string[];
  /** Proveedores que el empleado puede ver. */
  visibleVendorIds: Set<string>;
};

export async function resolveEmployeeVendorScope(
  admin: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<EmployeeVendorScope> {
  const allowedLocationIds = await resolveEmployeeAllowedLocationIds(organizationId, userId);

  const { data: asignaciones, error } = await admin
    .from("vendor_locations")
    .select("vendor_id, branch_id")
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(`No se pudo resolver el alcance de proveedores: ${error.message}`);
  }

  const permitidas = new Set(allowedLocationIds);
  const visibleVendorIds = new Set<string>();

  for (const fila of asignaciones ?? []) {
    if (!fila.vendor_id) continue;
    // Un proveedor sin locacion asignada es de toda la empresa: si no lo viera
    // nadie, quedaria invisible para todos los empleados.
    if (!fila.branch_id || permitidas.has(fila.branch_id)) {
      visibleVendorIds.add(fila.vendor_id);
    }
  }

  return { allowedLocationIds, visibleVendorIds };
}

/** Las locaciones elegidas tienen que estar dentro de las habilitadas. */
export function locacionesFueraDeAlcance(branchIds: string[], allowedLocationIds: string[]) {
  const permitidas = new Set(allowedLocationIds);
  return branchIds.filter((id) => id && !permitidas.has(id));
}

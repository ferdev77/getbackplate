import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertPlanLimitForBranches, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type ServiceResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export async function createBranch(params: {
  supabase: SupabaseClient;
  organizationId: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  phone: string | null;
}): Promise<ServiceResult> {
  const { supabase, organizationId, name, city, state, country, address, phone } = params;

  if (!name) {
    return { ok: false, message: "Location name is required" };
  }

  const code = toCode(name);

  try {
    await assertPlanLimitForBranches(organizationId, 1);
  } catch (error) {
    return {
      ok: false,
      message: getPlanLimitErrorMessage(error, "Location limit reached. Upgrade your plan to continue."),
    };
  }

  const { data: existing } = await supabase
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .maybeSingle();

  if (existing) {
    return { ok: false, message: "A location with that name already exists" };
  }

  const { data: maxOrderData } = await supabase
    .from("branches")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxOrderData?.sort_order ?? -1) + 1;

  const { data: created, error } = await supabase
    .from("branches")
    .insert({
      organization_id: organizationId,
      code,
      name,
      city,
      state,
      country,
      address,
      phone,
      is_active: true,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, message: `Could not create location: ${error.message}` };
  }

  return { ok: true, id: created?.id };
}

export async function updateBranch(params: {
  supabase: SupabaseClient;
  organizationId: string;
  branchId: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  phone: string | null;
}): Promise<ServiceResult> {
  const { supabase, organizationId, branchId, name, city, state, country, address, phone } = params;

  if (!branchId || !name) {
    return { ok: false, message: "Invalid location" };
  }

  const code = toCode(name);

  const { data: duplicate } = await supabase
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .neq("id", branchId)
    .maybeSingle();

  if (duplicate) {
    return { ok: false, message: "Another location with that name already exists" };
  }

  const { error } = await supabase
    .from("branches")
    .update({ name, code, city, state, country, address, phone })
    .eq("organization_id", organizationId)
    .eq("id", branchId);

  if (error) {
    return { ok: false, message: `Could not update location: ${error.message}` };
  }

  return { ok: true, id: branchId };
}

export async function toggleBranchStatus(params: {
  supabase: SupabaseClient;
  organizationId: string;
  branchId: string;
  nextStatus: boolean;
}): Promise<ServiceResult> {
  const { supabase, organizationId, branchId, nextStatus } = params;

  if (!branchId) {
    return { ok: false, message: "Invalid location" };
  }

  const { error } = await supabase
    .from("branches")
    .update({ is_active: nextStatus })
    .eq("organization_id", organizationId)
    .eq("id", branchId);

  if (error) {
    return { ok: false, message: `Could not update location: ${error.message}` };
  }

  return { ok: true, id: branchId };
}

export async function deleteBranch(params: {
  supabase: SupabaseClient;
  organizationId: string;
  branchId: string;
}): Promise<ServiceResult> {
  const { supabase, organizationId, branchId } = params;

  if (!branchId) {
    return { ok: false, message: "Invalid location" };
  }

  // Check if in use by memberships
  const { count, error: countError } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId);

  if (countError) {
    return { ok: false, message: `Could not verify location usage: ${countError.message}` };
  }

  if (count && count > 0) {
    return { ok: false, message: "This location cannot be deleted because employees are assigned to it. Deactivate it instead." };
  }

  const { error } = await supabase
    .from("branches")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", branchId);

  if (error) {
    return { ok: false, message: `Could not delete location: ${error.message}` };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function createDepartment(params: {
  supabase: SupabaseClient;
  organizationId: string;
  createdBy: string | null;
  name: string;
  description: string | null;
}): Promise<ServiceResult> {
  const { supabase, organizationId, createdBy, name, description } = params;

  if (!name) {
    return { ok: false, message: "Department name is required" };
  }

  const code = toCode(name);

  const { data: maxOrderData } = await supabase
    .from("organization_departments")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxOrderData?.sort_order ?? -1) + 1;

  const { data: created, error } = await supabase
    .from("organization_departments")
    .insert({
      organization_id: organizationId,
      code: code || null,
      name,
      description,
      created_by: createdBy,
      is_active: true,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, message: `Could not create department: ${error.message}` };
  }

  return { ok: true, id: created?.id };
}

export async function updateDepartment(params: {
  supabase: SupabaseClient;
  organizationId: string;
  departmentId: string;
  name: string;
  description: string | null;
}): Promise<ServiceResult> {
  const { supabase, organizationId, departmentId, name, description } = params;

  if (!departmentId || !name) {
    return { ok: false, message: "Invalid department" };
  }

  const code = toCode(name);

  const { data: duplicate } = await supabase
    .from("organization_departments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", name)
    .neq("id", departmentId)
    .maybeSingle();

  if (duplicate) {
    return { ok: false, message: "Another department with that name already exists" };
  }

  const { error } = await supabase
    .from("organization_departments")
    .update({ name, code: code || null, description })
    .eq("organization_id", organizationId)
    .eq("id", departmentId);

  if (error) {
    return { ok: false, message: `Could not update department: ${error.message}` };
  }

  // employees.department y checklist_templates.department guardan una COPIA del
  // nombre ademas del department_id. El alcance se resuelve por el ID, asi que
  // renombrar no rompe el acceso — a diferencia del puesto, que solo se guarda
  // como texto (ver updateDepartmentPosition). Pero la copia si queda vieja y se
  // sigue mostrando en las listas de empleados y en la etiqueta de alcance de
  // los checklists, hasta que alguien edite ese registro.
  //
  // Como ambas tablas tienen department_id, la sincronizacion es directa por ID.
  await Promise.all([
    supabase
      .from("employees")
      .update({ department: name })
      .eq("organization_id", organizationId)
      .eq("department_id", departmentId),
    supabase
      .from("checklist_templates")
      .update({ department: name })
      .eq("organization_id", organizationId)
      .eq("department_id", departmentId),
  ]);

  return { ok: true, id: departmentId };
}

export async function toggleDepartmentStatus(params: {
  supabase: SupabaseClient;
  organizationId: string;
  departmentId: string;
  nextStatus: boolean;
}): Promise<ServiceResult> {
  const { supabase, organizationId, departmentId, nextStatus } = params;

  if (!departmentId) {
    return { ok: false, message: "Invalid department" };
  }

  const { error } = await supabase
    .from("organization_departments")
    .update({ is_active: nextStatus })
    .eq("organization_id", organizationId)
    .eq("id", departmentId);

  if (error) {
    return { ok: false, message: `Could not update department: ${error.message}` };
  }

  return { ok: true, id: departmentId };
}

export async function deleteDepartment(params: {
  supabase: SupabaseClient;
  organizationId: string;
  departmentId: string;
}): Promise<ServiceResult> {
  const { supabase, organizationId, departmentId } = params;

  if (!departmentId) {
    return { ok: false, message: "Invalid department" };
  }

  // Check if it has positions
  const { count: posCount, error: posError } = await supabase
    .from("department_positions")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("department_id", departmentId);

  if (posError) {
    return { ok: false, message: `Could not verify department positions: ${posError.message}` };
  }

  if (posCount && posCount > 0) {
    return { ok: false, message: "This department cannot be deleted because it has associated positions. Delete the positions first." };
  }

  // Check if in use by memberships (just in case some memberships are linked to department but no position)
  const { count: memCount, error: memError } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("department_id", departmentId);

  if (memError) {
    return { ok: false, message: `Could not verify department usage: ${memError.message}` };
  }

  if (memCount && memCount > 0) {
    return { ok: false, message: "This department cannot be deleted because employees are assigned to it. Deactivate it instead." };
  }

  const { error } = await supabase
    .from("organization_departments")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", departmentId);

  if (error) {
    return { ok: false, message: `Could not delete department: ${error.message}` };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Department Positions
// ---------------------------------------------------------------------------

export async function createDepartmentPosition(params: {
  supabase: SupabaseClient;
  organizationId: string;
  createdBy: string | null;
  departmentId: string;
  name: string;
  description: string | null;
}): Promise<ServiceResult> {
  const { supabase, organizationId, createdBy, departmentId, name, description } = params;

  if (!departmentId || !name) {
    return { ok: false, message: "Department and position are required" };
  }

  const { data: department } = await supabase
    .from("organization_departments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", departmentId)
    .maybeSingle();

  if (!department) {
    return { ok: false, message: "Invalid department" };
  }

  const code = toCode(name);

  const { data: duplicate } = await supabase
    .from("department_positions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("department_id", departmentId)
    .eq("code", code)
    .maybeSingle();

  if (duplicate) {
    return { ok: false, message: "That position already exists in this department" };
  }

  const { data: maxOrderData } = await supabase
    .from("department_positions")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .eq("department_id", departmentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxOrderData?.sort_order ?? -1) + 1;

  const { data: created, error } = await supabase
    .from("department_positions")
    .insert({
      organization_id: organizationId,
      department_id: departmentId,
      code: code || null,
      name,
      description,
      created_by: createdBy,
      is_active: true,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, message: `Could not create position: ${error.message}` };
  }

  return { ok: true, id: created?.id };
}

export async function toggleDepartmentPositionStatus(params: {
  supabase: SupabaseClient;
  organizationId: string;
  positionId: string;
  nextStatus: boolean;
}): Promise<ServiceResult> {
  const { supabase, organizationId, positionId, nextStatus } = params;

  if (!positionId) {
    return { ok: false, message: "Invalid position" };
  }

  const { error } = await supabase
    .from("department_positions")
    .update({ is_active: nextStatus })
    .eq("organization_id", organizationId)
    .eq("id", positionId);

  if (error) {
    return { ok: false, message: `Could not update position: ${error.message}` };
  }

  return { ok: true, id: positionId };
}

export async function updateDepartmentPosition(params: {
  supabase: SupabaseClient;
  organizationId: string;
  positionId: string;
  name: string;
  description: string | null;
}): Promise<ServiceResult> {
  const { supabase, organizationId, positionId, name, description } = params;

  if (!positionId || !name) {
    return { ok: false, message: "Invalid position" };
  }

  const code = toCode(name);

  // `employees.position` guarda una COPIA del nombre del puesto en texto, no una
  // referencia. El alcance por puesto resuelve esa copia contra
  // department_positions comparando por nombre:
  //   lower(trim(dp.name)) = lower(trim(e.position))
  // Si se renombra el puesto sin actualizar la copia, esos empleados dejan de
  // resolver a ningun puesto y quedan silenciosamente fuera de todo alcance
  // filtrado por puesto — sin error y sin aviso.
  //
  // Paso real: en Juans Restaurants un puesto quedo como "Server" el 2026-07-14
  // y un empleado creado en abril conservo "Servers", con lo que dejo de recibir
  // avisos, checklists y documentos dirigidos a ese puesto.
  const { data: previous } = await supabase
    .from("department_positions")
    .select("name, department_id")
    .eq("organization_id", organizationId)
    .eq("id", positionId)
    .maybeSingle();

  const { error } = await supabase
    .from("department_positions")
    .update({ name, code: code || null, description })
    .eq("organization_id", organizationId)
    .eq("id", positionId);

  if (error) {
    return { ok: false, message: `Could not update position: ${error.message}` };
  }

  const previousName = previous?.name?.trim() ?? "";
  if (previousName && previousName.toLowerCase() !== name.trim().toLowerCase()) {
    const { data: affected, error: syncError } = await supabase
      .from("employees")
      .select("id, position, department_id")
      .eq("organization_id", organizationId);

    if (!syncError && affected?.length) {
      // Se replica la misma condicion que usa el matching de alcance: mismo
      // nombre sin distinguir mayusculas ni espacios, y mismo departamento
      // (o empleado sin departamento asignado).
      const idsToSync = affected
        .filter((row) => (row.position ?? "").trim().toLowerCase() === previousName.toLowerCase())
        .filter((row) => !row.department_id || !previous?.department_id || row.department_id === previous.department_id)
        .map((row) => row.id);

      if (idsToSync.length) {
        await supabase.from("employees").update({ position: name }).in("id", idsToSync);
      }
    }
  }

  return { ok: true, id: positionId };
}

export async function deleteDepartmentPosition(params: {
  supabase: SupabaseClient;
  organizationId: string;
  positionId: string;
}): Promise<ServiceResult> {
  const { supabase, organizationId, positionId } = params;

  if (!positionId) {
    return { ok: false, message: "Invalid position" };
  }

  // Check if in use
  const { count, error: countError } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("position_id", positionId);

  if (countError) {
    return { ok: false, message: `Could not verify position usage: ${countError.message}` };
  }

  if (count && count > 0) {
    return { ok: false, message: "This position cannot be deleted because employees are assigned to it. Deactivate it instead." };
  }

  const { error } = await supabase
    .from("department_positions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", positionId);

  if (error) {
    return { ok: false, message: `Could not delete position: ${error.message}` };
  }

  return { ok: true };
}

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

function toCode(value: string) {
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
    return { ok: false, message: "Nombre de locación obligatorio" };
  }

  const code = toCode(name);

  try {
    await assertPlanLimitForBranches(organizationId, 1);
  } catch (error) {
    return {
      ok: false,
      message: getPlanLimitErrorMessage(error, "Límite de locaciones alcanzado. Actualiza tu plan para continuar."),
    };
  }

  const { data: existing } = await supabase
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .maybeSingle();

  if (existing) {
    return { ok: false, message: "Ya existe una locación con ese nombre" };
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
    return { ok: false, message: `No se pudo crear la locación: ${error.message}` };
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
    return { ok: false, message: "Locación inválida" };
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
    return { ok: false, message: "Ya existe otra locación con ese nombre" };
  }

  const { error } = await supabase
    .from("branches")
    .update({ name, code, city, state, country, address, phone })
    .eq("organization_id", organizationId)
    .eq("id", branchId);

  if (error) {
    return { ok: false, message: `No se pudo actualizar la locación: ${error.message}` };
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
    return { ok: false, message: "Locación inválida" };
  }

  const { error } = await supabase
    .from("branches")
    .update({ is_active: nextStatus })
    .eq("organization_id", organizationId)
    .eq("id", branchId);

  if (error) {
    return { ok: false, message: `No se pudo actualizar la locación: ${error.message}` };
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
    return { ok: false, message: "Locación inválida" };
  }

  // Check if in use by memberships
  const { count, error: countError } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId);

  if (countError) {
    return { ok: false, message: `No se pudo verificar el uso de la locación: ${countError.message}` };
  }

  if (count && count > 0) {
    return { ok: false, message: "No se puede eliminar la locación porque tiene personal asignado. Desactívala en su lugar." };
  }

  const { error } = await supabase
    .from("branches")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", branchId);

  if (error) {
    return { ok: false, message: `No se pudo eliminar la locación: ${error.message}` };
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
    return { ok: false, message: "Nombre de departamento obligatorio" };
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
    return { ok: false, message: `No se pudo crear departamento: ${error.message}` };
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
    return { ok: false, message: "Departamento inválido" };
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
    return { ok: false, message: "Ya existe otro departamento con ese nombre" };
  }

  const { error } = await supabase
    .from("organization_departments")
    .update({ name, code: code || null, description })
    .eq("organization_id", organizationId)
    .eq("id", departmentId);

  if (error) {
    return { ok: false, message: `No se pudo actualizar departamento: ${error.message}` };
  }

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
    return { ok: false, message: "Departamento inválido" };
  }

  const { error } = await supabase
    .from("organization_departments")
    .update({ is_active: nextStatus })
    .eq("organization_id", organizationId)
    .eq("id", departmentId);

  if (error) {
    return { ok: false, message: `No se pudo actualizar departamento: ${error.message}` };
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
    return { ok: false, message: "Departamento inválido" };
  }

  // Check if it has positions
  const { count: posCount, error: posError } = await supabase
    .from("department_positions")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("department_id", departmentId);

  if (posError) {
    return { ok: false, message: `No se pudo verificar puestos del departamento: ${posError.message}` };
  }

  if (posCount && posCount > 0) {
    return { ok: false, message: "No se puede eliminar el departamento porque tiene puestos asociados. Elimina los puestos primero." };
  }

  // Check if in use by memberships (just in case some memberships are linked to department but no position)
  const { count: memCount, error: memError } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("department_id", departmentId);

  if (memError) {
    return { ok: false, message: `No se pudo verificar uso del departamento: ${memError.message}` };
  }

  if (memCount && memCount > 0) {
    return { ok: false, message: "No se puede eliminar el departamento porque tiene personal asignado. Desactívalo en su lugar." };
  }

  const { error } = await supabase
    .from("organization_departments")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", departmentId);

  if (error) {
    return { ok: false, message: `No se pudo eliminar departamento: ${error.message}` };
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
    return { ok: false, message: "Departamento y puesto son obligatorios" };
  }

  const { data: department } = await supabase
    .from("organization_departments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", departmentId)
    .maybeSingle();

  if (!department) {
    return { ok: false, message: "Departamento inválido" };
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
    return { ok: false, message: "Ya existe ese puesto en el departamento" };
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
    return { ok: false, message: `No se pudo crear puesto: ${error.message}` };
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
    return { ok: false, message: "Puesto inválido" };
  }

  const { error } = await supabase
    .from("department_positions")
    .update({ is_active: nextStatus })
    .eq("organization_id", organizationId)
    .eq("id", positionId);

  if (error) {
    return { ok: false, message: `No se pudo actualizar puesto: ${error.message}` };
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
    return { ok: false, message: "Puesto inválido" };
  }

  const code = toCode(name);

  const { error } = await supabase
    .from("department_positions")
    .update({ name, code: code || null, description })
    .eq("organization_id", organizationId)
    .eq("id", positionId);

  if (error) {
    return { ok: false, message: `No se pudo actualizar puesto: ${error.message}` };
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
    return { ok: false, message: "Puesto inválido" };
  }

  // Check if in use
  const { count, error: countError } = await supabase
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("position_id", positionId);

  if (countError) {
    return { ok: false, message: `No se pudo verificar uso del puesto: ${countError.message}` };
  }

  if (count && count > 0) {
    return { ok: false, message: "No se puede eliminar el puesto porque tiene personal asignado. Desactívalo en su lugar." };
  }

  const { error } = await supabase
    .from("department_positions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", positionId);

  if (error) {
    return { ok: false, message: `No se pudo eliminar puesto: ${error.message}` };
  }

  return { ok: true };
}

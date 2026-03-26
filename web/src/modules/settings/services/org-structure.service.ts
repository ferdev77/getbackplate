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
    return { ok: false, message: "Nombre de locacion obligatorio" };
  }

  const code = toCode(name);

  try {
    await assertPlanLimitForBranches(organizationId, 1);
  } catch (error) {
    return {
      ok: false,
      message: getPlanLimitErrorMessage(error, "Limite de sucursales alcanzado. Actualiza tu plan para continuar."),
    };
  }

  const { data: existing } = await supabase
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .maybeSingle();

  if (existing) {
    return { ok: false, message: "Ya existe una locacion con ese nombre" };
  }

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
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, message: `No se pudo crear locacion: ${error.message}` };
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
    return { ok: false, message: "Locacion invalida" };
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
    return { ok: false, message: "Ya existe otra locacion con ese nombre" };
  }

  const { error } = await supabase
    .from("branches")
    .update({ name, code, city, state, country, address, phone })
    .eq("organization_id", organizationId)
    .eq("id", branchId);

  if (error) {
    return { ok: false, message: `No se pudo actualizar locacion: ${error.message}` };
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
    return { ok: false, message: "Locacion invalida" };
  }

  const { error } = await supabase
    .from("branches")
    .update({ is_active: nextStatus })
    .eq("organization_id", organizationId)
    .eq("id", branchId);

  if (error) {
    return { ok: false, message: `No se pudo actualizar locacion: ${error.message}` };
  }

  return { ok: true, id: branchId };
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

  const { data: created, error } = await supabase
    .from("organization_departments")
    .insert({
      organization_id: organizationId,
      code: code || null,
      name,
      description,
      created_by: createdBy,
      is_active: true,
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
    return { ok: false, message: "Departamento invalido" };
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
    return { ok: false, message: "Departamento invalido" };
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
    return { ok: false, message: "Departamento invalido" };
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
    return { ok: false, message: "Puesto invalido" };
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

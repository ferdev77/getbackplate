import type { SupabaseClient } from "@supabase/supabase-js";

export type SavedVendor = {
  vendorId: string;
  vendorName: string;
  branchIds: string[];
  isGlobal: boolean;
  created: boolean;
  branchesChanged: boolean;
};

export type DeletedVendor = {
  vendorName: string;
  branchIds: string[];
  isGlobal: boolean;
};

type SaveVendorInput = {
  organizationId: string;
  vendorId: string | null;
  actorId: string;
  patch: Record<string, unknown>;
  replaceLocations: boolean;
  branchIds: string[] | null;
  employeeScopeIds: string[] | null;
};

type RpcError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type VendorMutationHttpError = {
  status: 403 | 404 | 409 | 422 | 500;
  body: { error: string; code: string };
};

const ERROR_MESSAGES: Record<string, VendorMutationHttpError> = {
  vendor_not_found: {
    status: 404,
    body: { error: "Proveedor no encontrado", code: "vendor_not_found" },
  },
  vendor_employee_scope_empty: {
    status: 403,
    body: { error: "No tienes locaciones habilitadas para gestionar proveedores", code: "vendor_employee_scope_empty" },
  },
  vendor_out_of_scope: {
    status: 403,
    body: { error: "Este proveedor no pertenece a tus locaciones", code: "vendor_out_of_scope" },
  },
  vendor_location_out_of_scope: {
    status: 403,
    body: { error: "No puedes asignar el proveedor a locaciones fuera de tu alcance", code: "vendor_location_out_of_scope" },
  },
  vendor_global_scope: {
    status: 403,
    body: { error: "Un empleado no puede cambiar el alcance de un proveedor global", code: "vendor_global_scope" },
  },
  invalid_vendor_category: {
    status: 422,
    body: { error: "Categoría inválida", code: "invalid_vendor_category" },
  },
  invalid_vendor_location: {
    status: 422,
    body: { error: "Locaciones inválidas", code: "invalid_vendor_location" },
  },
  invalid_vendor_payload: {
    status: 422,
    body: { error: "Datos inválidos", code: "invalid_vendor_payload" },
  },
};

export function mapVendorMutationError(error: RpcError): VendorMutationHttpError {
  const stable = error.message ? ERROR_MESSAGES[error.message] : undefined;
  if (stable) return stable;

  if (error.code === "P0002") return ERROR_MESSAGES.vendor_not_found;
  if (error.code === "42501") {
    return {
      status: 403,
      body: { error: "Sin permisos para modificar este proveedor", code: "vendor_forbidden" },
    };
  }
  if (error.code === "22023") {
    return {
      status: 422,
      body: { error: "Datos inválidos", code: "invalid_vendor_payload" },
    };
  }
  if (error.code === "23505") {
    return {
      status: 409,
      body: { error: "La operación entra en conflicto con otro cambio", code: "vendor_conflict" },
    };
  }

  return {
    status: 500,
    body: { error: "No se pudo guardar el proveedor", code: "vendor_save_failed" },
  };
}

export async function saveVendorTransaction(
  supabase: SupabaseClient,
  input: SaveVendorInput,
): Promise<{ data: SavedVendor | null; error: RpcError | null }> {
  const { data, error } = await supabase.rpc("save_vendor_transaction", {
    p_organization_id: input.organizationId,
    p_vendor_id: input.vendorId,
    p_actor_id: input.actorId,
    p_patch: input.patch,
    p_replace_locations: input.replaceLocations,
    p_branch_ids: input.branchIds,
    p_employee_scope_ids: input.employeeScopeIds,
  });

  if (error) return { data: null, error };

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row
    || typeof row.vendor_id !== "string"
    || typeof row.vendor_name !== "string"
    || !Array.isArray(row.branch_ids)
    || !row.branch_ids.every((id: unknown) => typeof id === "string")
    || typeof row.is_global !== "boolean"
    || typeof row.created !== "boolean"
    || typeof row.branches_changed !== "boolean"
  ) {
    return {
      data: null,
      error: { code: "INVALID_RPC_RESULT", message: "invalid_vendor_rpc_result" },
    };
  }

  return {
    data: {
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      branchIds: row.branch_ids,
      isGlobal: row.is_global,
      created: row.created,
      branchesChanged: row.branches_changed,
    },
    error: null,
  };
}

export async function saveEmployeeVendorTransaction(
  supabase: SupabaseClient,
  input: Omit<SaveVendorInput, "vendorId" | "employeeScopeIds"> & {
    vendorId: string;
    employeeScopeIds: string[];
  },
): Promise<{ data: SavedVendor | null; error: RpcError | null }> {
  const { data, error } = await supabase.rpc("save_employee_vendor_transaction", {
    p_organization_id: input.organizationId,
    p_vendor_id: input.vendorId,
    p_actor_id: input.actorId,
    p_patch: input.patch,
    p_replace_locations: input.replaceLocations,
    p_branch_ids: input.branchIds,
    p_employee_scope_ids: input.employeeScopeIds,
  });

  if (error) return { data: null, error };
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row
    || typeof row.vendor_id !== "string"
    || typeof row.vendor_name !== "string"
    || !Array.isArray(row.branch_ids)
    || !row.branch_ids.every((id: unknown) => typeof id === "string")
    || typeof row.is_global !== "boolean"
    || typeof row.created !== "boolean"
    || typeof row.branches_changed !== "boolean"
  ) {
    return { data: null, error: { code: "INVALID_RPC_RESULT", message: "invalid_vendor_rpc_result" } };
  }

  return {
    data: {
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      branchIds: row.branch_ids,
      isGlobal: row.is_global,
      created: row.created,
      branchesChanged: row.branches_changed,
    },
    error: null,
  };
}

export async function deleteEmployeeVendorTransaction(
  supabase: SupabaseClient,
  input: { organizationId: string; vendorId: string; actorId: string; employeeScopeIds: string[] },
): Promise<{ data: DeletedVendor | null; error: RpcError | null }> {
  const { data, error } = await supabase.rpc("delete_employee_vendor_transaction", {
    p_organization_id: input.organizationId,
    p_vendor_id: input.vendorId,
    p_actor_id: input.actorId,
    p_employee_scope_ids: input.employeeScopeIds,
  });

  if (error) return { data: null, error };
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row
    || typeof row.vendor_name !== "string"
    || !Array.isArray(row.branch_ids)
    || !row.branch_ids.every((id: unknown) => typeof id === "string")
    || typeof row.is_global !== "boolean"
  ) {
    return { data: null, error: { code: "INVALID_RPC_RESULT", message: "invalid_vendor_rpc_result" } };
  }

  return {
    data: { vendorName: row.vendor_name, branchIds: row.branch_ids, isGlobal: row.is_global },
    error: null,
  };
}

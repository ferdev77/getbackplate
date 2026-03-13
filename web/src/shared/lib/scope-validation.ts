import type { SupabaseClient } from "@supabase/supabase-js";

export type ScopeValidationField = "locations" | "departments" | "positions" | "users";

type ValidateTenantScopeReferencesInput = {
  supabase: SupabaseClient;
  organizationId: string;
  locationIds?: string[];
  departmentIds?: string[];
  positionIds?: string[];
  userIds?: string[];
  userSource?: "employees" | "memberships";
};

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeScopeSelection(values: string[], options?: { allowAllToken?: boolean }) {
  const normalized = unique(values);
  if (options?.allowAllToken && normalized.includes("__all__")) {
    return [];
  }
  return normalized.filter((value) => value !== "__all__");
}

export async function validateTenantScopeReferences(
  input: ValidateTenantScopeReferencesInput,
): Promise<{ ok: true } | { ok: false; field: ScopeValidationField }> {
  const locationIds = unique(input.locationIds ?? []);
  if (locationIds.length) {
    const { data: rows, error } = await input.supabase
      .from("branches")
      .select("id")
      .eq("organization_id", input.organizationId)
      .in("id", locationIds);

    if (error || (rows?.length ?? 0) !== locationIds.length) {
      return { ok: false, field: "locations" };
    }
  }

  const departmentIds = unique(input.departmentIds ?? []);
  if (departmentIds.length) {
    const { data: rows, error } = await input.supabase
      .from("organization_departments")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("is_active", true)
      .in("id", departmentIds);

    if (error || (rows?.length ?? 0) !== departmentIds.length) {
      return { ok: false, field: "departments" };
    }
  }

  const positionIds = unique(input.positionIds ?? []);
  if (positionIds.length) {
    const { data: rows, error } = await input.supabase
      .from("department_positions")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("is_active", true)
      .in("id", positionIds);

    if (error || (rows?.length ?? 0) !== positionIds.length) {
      return { ok: false, field: "positions" };
    }
  }

  const userIds = unique(input.userIds ?? []);
  if (userIds.length) {
    const userSource = input.userSource ?? "employees";
    const query =
      userSource === "memberships"
        ? input.supabase
            .from("memberships")
            .select("user_id")
            .eq("organization_id", input.organizationId)
            .eq("status", "active")
            .in("user_id", userIds)
        : input.supabase
            .from("employees")
            .select("user_id")
            .eq("organization_id", input.organizationId)
            .in("user_id", userIds);

    const { data: rows, error } = await query;
    if (error || (rows?.length ?? 0) !== userIds.length) {
      return { ok: false, field: "users" };
    }
  }

  return { ok: true };
}

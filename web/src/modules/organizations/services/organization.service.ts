import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  assertOrganizationCanSwitchToPlan,
  getPlanLimitErrorMessage,
} from "@/shared/lib/plan-limits";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function toNullableInt(value: string | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

// ---------------------------------------------------------------------------
// Provision organization modules + limits from plan
// ---------------------------------------------------------------------------

export async function provisionOrganizationFromPlan(params: {
  organizationId: string;
  planId: string | null;
}) {
  const supabase = createSupabaseAdminClient();

  const { data: modules } = await supabase
    .from("module_catalog")
    .select("id, is_core");

  let planModuleIds = new Set<string>();
  if (params.planId) {
    const { data: planModules } = await supabase
      .from("plan_modules")
      .select("module_id")
      .eq("plan_id", params.planId)
      .eq("is_enabled", true);
    planModuleIds = new Set((planModules ?? []).map((row) => row.module_id));
  }

  if (modules?.length) {
    await supabase.from("organization_modules").insert(
      modules.map((mod) => ({
        organization_id: params.organizationId,
        module_id: mod.id,
        is_enabled: Boolean(mod.is_core) || planModuleIds.has(mod.id),
        enabled_at: Boolean(mod.is_core) || planModuleIds.has(mod.id) ? new Date().toISOString() : null,
      })),
    );
  }

  if (params.planId) {
    const { data: planLimits } = await supabase
      .from("plans")
      .select("max_branches, max_users, max_storage_mb, max_employees")
      .eq("id", params.planId)
      .maybeSingle();

    await supabase.from("organization_limits").upsert(
      {
        organization_id: params.organizationId,
        max_branches: planLimits?.max_branches ?? null,
        max_users: planLimits?.max_users ?? null,
        max_storage_mb: planLimits?.max_storage_mb ?? null,
        max_employees: planLimits?.max_employees ?? null,
      },
      { onConflict: "organization_id" },
    );
  }
}

// ---------------------------------------------------------------------------
// Sync plan change (modules + limits)
// ---------------------------------------------------------------------------

export async function syncOrganizationPlan(params: {
  organizationId: string;
  planId: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseAdminClient();

  if (params.planId) {
    try {
      await assertOrganizationCanSwitchToPlan(params.organizationId, params.planId);
    } catch (error) {
      return {
        ok: false,
        message: getPlanLimitErrorMessage(
          error,
          "No se puede cambiar plan porque el uso actual supera los limites del plan destino.",
        ),
      };
    }
  }

  // Update limits
  if (params.planId) {
    const { data: planLimits } = await supabase
      .from("plans")
      .select("max_branches, max_users, max_storage_mb, max_employees")
      .eq("id", params.planId)
      .maybeSingle();

    await supabase.from("organization_limits").upsert(
      {
        organization_id: params.organizationId,
        max_branches: planLimits?.max_branches ?? null,
        max_users: planLimits?.max_users ?? null,
        max_storage_mb: planLimits?.max_storage_mb ?? null,
        max_employees: planLimits?.max_employees ?? null,
      },
      { onConflict: "organization_id" },
    );
  }

  // Sync modules
  const { data: modules } = await supabase
    .from("module_catalog")
    .select("id, is_core");

  let planModuleIds = new Set<string>();
  if (params.planId) {
    const { data: planModules } = await supabase
      .from("plan_modules")
      .select("module_id")
      .eq("plan_id", params.planId)
      .eq("is_enabled", true);

    planModuleIds = new Set((planModules ?? []).map((row) => row.module_id));
  }

  if (modules?.length) {
    await supabase.from("organization_modules").upsert(
      modules.map((mod) => {
        const shouldEnable = Boolean(mod.is_core) || planModuleIds.has(mod.id);
        return {
          organization_id: params.organizationId,
          module_id: mod.id,
          is_enabled: shouldEnable,
          enabled_at: shouldEnable ? new Date().toISOString() : null,
        };
      }),
      { onConflict: "organization_id,module_id" },
    );
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cleanup tenant storage on deletion
// ---------------------------------------------------------------------------

export async function cleanupTenantStorageArtifacts(organizationId: string) {
  const supabase = createSupabaseAdminClient();
  const bucketId = "tenant-documents";

  const { data: objects } = await supabase
    .schema("storage")
    .from("objects")
    .select("name")
    .eq("bucket_id", bucketId)
    .like("name", `${organizationId}/%`)
    .limit(10000);

  const paths = (objects ?? []).map((row) => row.name).filter(Boolean);
  if (!paths.length) {
    return;
  }

  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    await supabase.storage.from(bucketId).remove(chunk);
  }
}

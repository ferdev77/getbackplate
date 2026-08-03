import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  assertOrganizationCanSwitchToPlan,
  getPlanLimitErrorMessage,
} from "@/shared/lib/plan-limits";
import { resolveEnabledOrganizationModuleIds } from "./plan-module-rules";

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
  integrationPlanId?: string | null;
}) {
  const supabase = createSupabaseAdminClient();

  const { data: modules } = await supabase
    .from("module_catalog")
    .select("id, code, is_core");

  const platformPlanModuleIds = new Set<string>();
  const integrationPlanModuleIds = new Set<string>();
  const selectedPlans: Array<[string | null, Set<string>]> = [
    [params.planId, platformPlanModuleIds],
    [params.integrationPlanId ?? null, integrationPlanModuleIds],
  ];
  for (const [planId, moduleIds] of selectedPlans) {
    if (!planId) continue;
    const { data: planModules } = await supabase
      .from("plan_modules")
      .select("module_id")
      .eq("plan_id", planId)
      .eq("is_enabled", true);
    for (const row of planModules ?? []) moduleIds.add(row.module_id);
  }

  if (modules?.length) {
    const enabledModuleIds = resolveEnabledOrganizationModuleIds({
      modules,
      platformPlanModuleIds,
      integrationPlanModuleIds,
      hasPlatformPlan: Boolean(params.planId),
      hasIntegrationPlan: Boolean(params.integrationPlanId),
    });
    await supabase.from("organization_modules").insert(
      modules.map((mod) => {
        const shouldEnable = enabledModuleIds.has(mod.id);
        return {
          organization_id: params.organizationId,
          module_id: mod.id,
          is_enabled: shouldEnable,
          enabled_at: shouldEnable ? new Date().toISOString() : null,
        };
      }),
    );
  }

  const { data: planLimits, error: planLimitsError } = params.planId
    ? await supabase
        .from("plans")
        .select("max_branches, max_users, max_storage_mb, max_employees")
        .eq("id", params.planId)
        .maybeSingle()
    : { data: null, error: null };
  if (planLimitsError) throw new Error(planLimitsError.message);

  const { error: limitsError } = await supabase.from("organization_limits").upsert(
    {
      organization_id: params.organizationId,
      max_branches: planLimits?.max_branches ?? null,
      max_users: planLimits?.max_users ?? null,
      max_storage_mb: planLimits?.max_storage_mb ?? null,
      max_employees: planLimits?.max_employees ?? null,
    },
    { onConflict: "organization_id" },
  );
  if (limitsError) throw new Error(limitsError.message);
}

export async function provisionManualIntegrationEntitlement(params: {
  organizationId: string;
  integrationPlanId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data: qboModule, error: moduleError } = await supabase
    .from("module_catalog")
    .select("id")
    .eq("code", "qbo_r365")
    .maybeSingle();

  if (moduleError || !qboModule) {
    throw new Error(moduleError?.message ?? "The QuickBooks® Online integration module was not found");
  }

  const { error: addonError } = await supabase.from("organization_addons").upsert(
    {
      organization_id: params.organizationId,
      module_id: qboModule.id,
      integration_plan_id: params.integrationPlanId,
      status: "active",
    },
    { onConflict: "organization_id,module_id" },
  );

  if (addonError) throw new Error(addonError.message);
}

// ---------------------------------------------------------------------------
// Sync plan change (modules + limits)
// ---------------------------------------------------------------------------

export async function syncOrganizationPlan(params: {
  organizationId: string;
  planId: string | null;
  integrationPlanId?: string | null;
  skipPlanLimitCheck?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createSupabaseAdminClient();

  if (params.planId && !params.skipPlanLimitCheck) {
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

  // Update limits from platform plan only
  const { data: planLimits, error: planLimitsError } = params.planId
    ? await supabase
        .from("plans")
        .select("max_branches, max_users, max_storage_mb, max_employees")
        .eq("id", params.planId)
        .maybeSingle()
    : { data: null, error: null };
  if (planLimitsError) return { ok: false, message: planLimitsError.message };

  const { error: limitsError } = await supabase.from("organization_limits").upsert(
    {
      organization_id: params.organizationId,
      max_branches: planLimits?.max_branches ?? null,
      max_users: planLimits?.max_users ?? null,
      max_storage_mb: planLimits?.max_storage_mb ?? null,
      max_employees: planLimits?.max_employees ?? null,
    },
    { onConflict: "organization_id" },
  );
  if (limitsError) return { ok: false, message: limitsError.message };

  // Sync modules — union de ambos planes
  const { data: modules, error: modulesError } = await supabase
    .from("module_catalog")
    .select("id, code, is_core");
  if (modulesError) return { ok: false, message: modulesError.message };

  const platformPlanModuleIds = new Set<string>();
  const integrationPlanModuleIds = new Set<string>();
  const selectedPlans: Array<[string | null, Set<string>]> = [
    [params.planId, platformPlanModuleIds],
    [params.integrationPlanId ?? null, integrationPlanModuleIds],
  ];
  for (const [planId, moduleIds] of selectedPlans) {
    if (!planId) continue;
    const { data: planModules, error: planModulesError } = await supabase
      .from("plan_modules")
      .select("module_id")
      .eq("plan_id", planId)
      .eq("is_enabled", true);
    if (planModulesError) return { ok: false, message: planModulesError.message };
    for (const row of planModules ?? []) moduleIds.add(row.module_id);
  }

  if (modules?.length) {
    const enabledModuleIds = resolveEnabledOrganizationModuleIds({
      modules,
      platformPlanModuleIds,
      integrationPlanModuleIds,
      hasPlatformPlan: Boolean(params.planId),
      hasIntegrationPlan: Boolean(params.integrationPlanId),
    });
    const { error: organizationModulesError } = await supabase.from("organization_modules").upsert(
      modules.map((mod) => {
        const shouldEnable = enabledModuleIds.has(mod.id);
        return {
          organization_id: params.organizationId,
          module_id: mod.id,
          is_enabled: shouldEnable,
          enabled_at: shouldEnable ? new Date().toISOString() : null,
        };
      }),
      { onConflict: "organization_id,module_id" },
    );
    if (organizationModulesError) return { ok: false, message: organizationModulesError.message };
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

import { getOrganizationByIdCached, getUserPreferencesCached } from "@/modules/organizations/cached-queries";
import { isModuleEnabledForOrganization } from "@/shared/lib/tenant-modules";

export type AppLocale = "es" | "en";

// Integration-plan organizations are contractually English-only. Other
// organizations keep their explicit preference and existing module fallback.
export async function resolveUserLocale(input: { organizationId: string; userId: string | null }): Promise<AppLocale> {
  const [organization, preferences] = await Promise.all([
    getOrganizationByIdCached(input.organizationId),
    input.userId
      ? getUserPreferencesCached(input.userId, input.organizationId)
      : Promise.resolve(null),
  ]);

  if (organization?.integration_plan_id) return "en";

  if (preferences?.language === "en" || preferences?.language === "es") {
    return preferences.language;
  }

  const isIntegrationPlan = await isModuleEnabledForOrganization(input.organizationId, "qbo_r365");
  return isIntegrationPlan ? "en" : "es";
}

export type PlanModuleCatalogEntry = {
  id: string;
  is_core: boolean | null;
};

export function resolveEnabledOrganizationModuleIds(params: {
  modules: PlanModuleCatalogEntry[];
  platformPlanModuleIds: Iterable<string>;
  integrationPlanModuleIds: Iterable<string>;
  hasPlatformPlan: boolean;
  hasIntegrationPlan: boolean;
}): Set<string> {
  const planModuleIds = new Set([
    ...params.platformPlanModuleIds,
    ...params.integrationPlanModuleIds,
  ]);
  const isIntegrationOnly = !params.hasPlatformPlan && params.hasIntegrationPlan;

  return new Set(
    params.modules
      .filter((module) => planModuleIds.has(module.id) || (!isIntegrationOnly && Boolean(module.is_core)))
      .map((module) => module.id),
  );
}

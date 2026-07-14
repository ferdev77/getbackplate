import "server-only";

import { cache } from "react";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";

// Separado de access.ts para que otros módulos (como el servicio de MFA)
// puedan chequear módulos habilitados sin crear una dependencia circular
// con access.ts, que a su vez necesita consultar el estado de MFA.
export const isTenantModuleEnabled = cache(async function isTenantModuleEnabled(organizationId: string, moduleCode: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_module_enabled", {
    org_id: organizationId,
    module_code: moduleCode,
  });

  return {
    enabled: Boolean(data),
    hasError: Boolean(error),
  };
});

export async function isModuleEnabledForOrganization(organizationId: string, moduleCode: string) {
  const moduleAccess = await isTenantModuleEnabled(organizationId, moduleCode);
  return moduleAccess.enabled;
}

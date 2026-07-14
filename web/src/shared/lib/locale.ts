import { getUserPreferencesCached } from "@/modules/organizations/cached-queries";
import { isModuleEnabledForOrganization } from "@/shared/lib/tenant-modules";

export type AppLocale = "es" | "en";

// Idioma automatico por plan (ingles para cuentas con la integracion QBO
// activa, espanol para el resto) salvo que el usuario ya haya guardado una
// preferencia explicita desde Ajustes (ver migracion 20260714000002).
export async function resolveUserLocale(input: { organizationId: string; userId: string | null }): Promise<AppLocale> {
  const preferences = input.userId
    ? await getUserPreferencesCached(input.userId, input.organizationId)
    : null;

  if (preferences?.language === "en" || preferences?.language === "es") {
    return preferences.language;
  }

  const isIntegrationPlan = await isModuleEnabledForOrganization(input.organizationId, "qbo_r365");
  return isIntegrationPlan ? "en" : "es";
}

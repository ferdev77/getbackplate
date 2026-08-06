export type AppLocale = "es" | "en";
export type FormattingLocale = "es-MX" | "en-US";

export function resolveOrganizationLocale(
  integrationPlanId: string | null | undefined,
): AppLocale {
  return integrationPlanId != null ? "en" : "es";
}

export function getFormattingLocale(locale: AppLocale): FormattingLocale {
  return locale === "en" ? "en-US" : "es-MX";
}

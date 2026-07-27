const DEVELOPMENT_SUPABASE_REF = "uubdslmtfxwraszinpao";
const PRODUCTION_QBO_HOST = "quickbooks.api.intuit.com";
const PRODUCTION_QBO_URL = `https://${PRODUCTION_QBO_HOST}`;
const SANDBOX_QBO_URL = "https://sandbox-quickbooks.api.intuit.com";

type QboEnvironmentInput = {
  QBO_API_BASE_URL?: string;
  QBO_ENVIRONMENT?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

export function isDevelopmentSupabaseProject(supabaseUrl: string | undefined) {
  if (!supabaseUrl) return false;
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] === DEVELOPMENT_SUPABASE_REF;
  } catch {
    return false;
  }
}

export function resolveQboApiBaseUrl(env: QboEnvironmentInput = process.env as QboEnvironmentInput) {
  const isDevelopmentProject = isDevelopmentSupabaseProject(env.NEXT_PUBLIC_SUPABASE_URL);
  const override = env.QBO_API_BASE_URL?.trim();

  if (override) {
    let parsed: URL;
    try {
      parsed = new URL(override);
    } catch {
      throw new Error("QBO_API_BASE_URL must be a valid absolute URL");
    }
    if (isDevelopmentProject && parsed.hostname === PRODUCTION_QBO_HOST) {
      throw new Error("Supabase dev cannot use the production QuickBooks Accounting API");
    }
    return override.replace(/\/+$/, "");
  }

  if (isDevelopmentProject) return SANDBOX_QBO_URL;
  return env.QBO_ENVIRONMENT?.trim().toLowerCase() === "sandbox"
    ? SANDBOX_QBO_URL
    : PRODUCTION_QBO_URL;
}

/**
 * Cached versions of organization queries.
 *
 * These use `unstable_cache` from Next.js to persist results across requests
 * with a configurable TTL.  They bypass RLS by using the admin client, so the
 * caller must have already verified authorization.
 *
 * Use `React.cache()` for intra-request dedup (already in queries.ts).
 * Use these for cross-request caching of semi-static data.
 */

import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { getBillingGateForOrganization } from "@/modules/billing/services/billing-gate.service";

// ─── Global (non-org-specific) ─────────────────────────────────────────────

/** Active plans — rarely change. 5 min TTL. */
export const getActivePlansCached = unstable_cache(
  async () => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("plans")
      .select(
        "id, code, name, price_amount, billing_period, is_active, max_branches, max_users, max_employees, max_storage_mb, stripe_price_id",
      )
      .eq("is_active", true)
      .order("price_amount", { ascending: true, nullsFirst: false });
    return data ?? [];
  },
  ["active-plans-v1"],
  { revalidate: 300 },
);

/** Plan → modules map — rarely changes. 5 min TTL. */
export const getPlanModulesMapCached = unstable_cache(
  async () => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("plan_modules")
      .select("plan_id, module_catalog!inner(code, name), is_enabled")
      .eq("is_enabled", true);

    const map: Record<string, Array<{ code: string; name: string }>> = {};

    for (const row of data ?? []) {
      const planId = typeof row.plan_id === "string" ? row.plan_id : null;
      const catalog = row.module_catalog as unknown as {
        code?: string | null;
        name?: string | null;
      } | null;
      const code = typeof catalog?.code === "string" ? catalog.code : "";
      const name = typeof catalog?.name === "string" ? catalog.name : code;

      if (!planId || !code) continue;
      if (!map[planId]) map[planId] = [];
      if (!map[planId].some((item) => item.code === code)) {
        map[planId].push({ code, name });
      }
    }

    return map;
  },
  ["plan-modules-map-v1"],
  { revalidate: 300 },
);

// ─── Org-specific (keyed by organizationId) ────────────────────────────────

/** Organization row — 60s TTL. */
export const getOrganizationByIdCached = unstable_cache(
  async (organizationId: string) => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("organizations")
      .select(
        "id, name, slug, status, plan_id, billing_activation_status, billing_activated_at, billing_onboarding_required",
      )
      .eq("id", organizationId)
      .maybeSingle();
    return data;
  },
  ["org-by-id-v1"],
  { revalidate: 60 },
);

/** Organization settings — 60s TTL. */
export const getOrganizationSettingsCached = unstable_cache(
  async (organizationId: string) => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("organization_settings")
      .select(
        "billing_plan, billing_period, billed_to, billing_email, payment_last4, invoice_emails_enabled, dashboard_note, company_logo_url, company_logo_dark_url, company_favicon_url",
      )
      .eq("organization_id", organizationId)
      .maybeSingle();
    return data;
  },
  ["org-settings-v1"],
  { revalidate: 60 },
);

/** Enabled module codes for org — 60s TTL. */
export const getEnabledModulesCached = unstable_cache(
  async (organizationId: string) => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("organization_modules")
      .select("module_catalog!inner(code)")
      .eq("organization_id", organizationId)
      .eq("is_enabled", true);

    return (data ?? []).map((row) => {
      const catalog = row.module_catalog as unknown as { code: string } | null;
      return catalog?.code ?? "";
    });
  },
  ["enabled-modules-v1"],
  { revalidate: 60 },
);

/** Active branches for org — 60s TTL. */
export const getActiveBranchesCached = unstable_cache(
  async (organizationId: string) => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name");
    return data ?? [];
  },
  ["active-branches-v1"],
  { revalidate: 60 },
);

/** Latest subscription for org — 30s TTL (billing-sensitive). */
export const getLatestSubscriptionCached = unstable_cache(
  async (organizationId: string) => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("organization_id", organizationId)
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    return data;
  },
  ["latest-subscription-v1"],
  { revalidate: 30 },
);

/** Billing gate for org — 30s TTL. */
export const getOrganizationBillingGateCached = unstable_cache(
  async (organizationId: string) => {
    const supabase = createSupabaseAdminClient();
    return getBillingGateForOrganization({ supabase, organizationId });
  },
  ["billing-gate-v1"],
  { revalidate: 30 },
);

/** User preferences — 60s TTL. */
export const getUserPreferencesCached = unstable_cache(
  async (userId: string, organizationId: string) => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("user_preferences")
      .select(
        "theme, language, date_format, timezone_mode, timezone_manual, analytics_enabled, two_factor_enabled, two_factor_method",
      )
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    return data;
  },
  ["user-preferences-v1"],
  { revalidate: 60 },
);

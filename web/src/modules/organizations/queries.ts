import { cache } from "react";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getBillingGateForOrganization } from "@/modules/billing/services/billing-gate.service";

export const getOrganizationById = cache(async function getOrganizationById(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, slug, status, plan_id, billing_activation_status, billing_activated_at, billing_onboarding_required")
    .eq("id", organizationId)
    .maybeSingle();
  return data;
});

export const getOrganizationBillingGate = cache(async function getOrganizationBillingGate(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  return getBillingGateForOrganization({
    supabase,
    organizationId,
  });
});

export const getOrganizationSettings = cache(async function getOrganizationSettings(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("organization_settings")
    .select("billing_plan, billing_period, billed_to, billing_email, payment_last4, invoice_emails_enabled, dashboard_note, company_logo_url, company_logo_dark_url")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
});

export const getEnabledModules = cache(async function getEnabledModules(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("organization_modules")
    .select("module_catalog!inner(code)")
    .eq("organization_id", organizationId)
    .eq("is_enabled", true);
  
  return new Set(
    (data ?? []).map((row) => {
      const catalog = row.module_catalog as unknown as { code: string } | null;
      return catalog?.code ?? "";
    })
  );
});

export const getActivePlans = cache(async function getActivePlans() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("plans")
    .select("id, code, name, price_amount, billing_period, is_active, max_branches, max_users, max_employees, max_storage_mb, stripe_price_id")
    .eq("is_active", true)
    .order("price_amount", { ascending: true, nullsFirst: false });
  return data ?? [];
});

export const getPlanModulesMap = cache(async function getPlanModulesMap() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("plan_modules")
    .select("plan_id, module_catalog!inner(code, name), is_enabled")
    .eq("is_enabled", true);

  const map: Record<string, Array<{ code: string; name: string }>> = {};

  for (const row of data ?? []) {
    const planId = typeof row.plan_id === "string" ? row.plan_id : null;
    const catalog = row.module_catalog as unknown as { code?: string | null; name?: string | null } | null;
    const code = typeof catalog?.code === "string" ? catalog.code : "";
    const name = typeof catalog?.name === "string" ? catalog.name : code;

    if (!planId || !code) continue;
    if (!map[planId]) map[planId] = [];
    if (!map[planId].some((item) => item.code === code)) {
      map[planId].push({ code, name });
    }
  }

  return map;
});

export const getUserPreferences = cache(async function getUserPreferences(userId: string, organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_preferences")
    .select("theme, language, date_format, timezone_mode, timezone_manual, analytics_enabled, two_factor_enabled, two_factor_method")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
});

export const getActiveBranches = cache(async function getActiveBranches(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name, city")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return data ?? [];
});

export const getLatestSubscriptionForOrganization = cache(async function getLatestSubscriptionForOrganization(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("organization_id", organizationId)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return data;
});

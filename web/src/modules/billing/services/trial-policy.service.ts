import type { SupabaseClient } from "@supabase/supabase-js";

const TRIAL_DAYS = 30;

type ResolveTrialPolicyParams = {
  supabase: SupabaseClient;
  organizationId: string;
  hasActiveSubscription: boolean;
};

export async function resolveTrialPolicyForOrganization(
  params: ResolveTrialPolicyParams,
): Promise<{ eligible: boolean; trialDays: number }> {
  if (params.hasActiveSubscription) {
    return { eligible: false, trialDays: 0 };
  }

  const { data, error } = await params.supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("organization_id", params.organizationId)
    .limit(1);

  if (error) {
    return { eligible: false, trialDays: 0 };
  }

  const hasAnyHistoricalSubscription = Array.isArray(data) && data.length > 0;

  if (hasAnyHistoricalSubscription) {
    return { eligible: false, trialDays: 0 };
  }

  return { eligible: true, trialDays: TRIAL_DAYS };
}

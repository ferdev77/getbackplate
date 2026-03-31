import type { SupabaseClient } from "@supabase/supabase-js";

export type BillingGateReason =
  | "not_required"
  | "subscription_active"
  | "trial_expired"
  | "subscription_missing"
  | "subscription_inactive";

export type BillingGateState = {
  isBlocked: boolean;
  reason: BillingGateReason;
  required: boolean;
  hasActiveSubscription: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
};

type BillingGateInput = {
  billingOnboardingRequired: boolean;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  now?: Date;
};

function isValidDate(value: string | null): value is string {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function resolveBillingGateState(input: BillingGateInput): BillingGateState {
  const now = input.now ?? new Date();
  const status = input.subscriptionStatus;

  if (!input.billingOnboardingRequired) {
    return {
      isBlocked: false,
      reason: "not_required",
      required: false,
      hasActiveSubscription: false,
      status,
      currentPeriodEnd: input.subscriptionCurrentPeriodEnd,
    };
  }

  if (status === "active") {
    return {
      isBlocked: false,
      reason: "subscription_active",
      required: true,
      hasActiveSubscription: true,
      status,
      currentPeriodEnd: input.subscriptionCurrentPeriodEnd,
    };
  }

  if (status === "trialing") {
    if (isValidDate(input.subscriptionCurrentPeriodEnd)) {
      const endsAt = new Date(input.subscriptionCurrentPeriodEnd);
      if (endsAt >= now) {
        return {
          isBlocked: false,
          reason: "subscription_active",
          required: true,
          hasActiveSubscription: true,
          status,
          currentPeriodEnd: input.subscriptionCurrentPeriodEnd,
        };
      }

      return {
        isBlocked: true,
        reason: "trial_expired",
        required: true,
        hasActiveSubscription: false,
        status,
        currentPeriodEnd: input.subscriptionCurrentPeriodEnd,
      };
    }

    return {
      isBlocked: false,
      reason: "subscription_active",
      required: true,
      hasActiveSubscription: true,
      status,
      currentPeriodEnd: input.subscriptionCurrentPeriodEnd,
    };
  }

  if (!status) {
    return {
      isBlocked: true,
      reason: "subscription_missing",
      required: true,
      hasActiveSubscription: false,
      status: null,
      currentPeriodEnd: input.subscriptionCurrentPeriodEnd,
    };
  }

  return {
    isBlocked: true,
    reason: "subscription_inactive",
    required: true,
    hasActiveSubscription: false,
    status,
    currentPeriodEnd: input.subscriptionCurrentPeriodEnd,
  };
}

export async function getBillingGateForOrganization(params: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<BillingGateState> {
  const [{ data: organization }, { data: latestSubscription }] = await Promise.all([
    params.supabase
      .from("organizations")
      .select("billing_onboarding_required")
      .eq("id", params.organizationId)
      .maybeSingle(),
    params.supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("organization_id", params.organizationId)
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return resolveBillingGateState({
    billingOnboardingRequired: Boolean(organization?.billing_onboarding_required),
    subscriptionStatus: typeof latestSubscription?.status === "string" ? latestSubscription.status : null,
    subscriptionCurrentPeriodEnd:
      typeof latestSubscription?.current_period_end === "string" ? latestSubscription.current_period_end : null,
  });
}

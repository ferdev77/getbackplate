import { describe, it, expect } from "vitest";
import { resolveBillingGateState } from "../billing-gate.service";

describe("resolveBillingGateState", () => {
  describe("billingOnboardingRequired: false", () => {
    it("never blocks regardless of subscription status", () => {
      const result = resolveBillingGateState({
        billingOnboardingRequired: false,
        subscriptionStatus: null,
        subscriptionCurrentPeriodEnd: null,
      });
      expect(result.isBlocked).toBe(false);
      expect(result.reason).toBe("not_required");
      expect(result.required).toBe(false);
    });

    it("never blocks even when subscription is canceled", () => {
      const result = resolveBillingGateState({
        billingOnboardingRequired: false,
        subscriptionStatus: "canceled",
        subscriptionCurrentPeriodEnd: null,
      });
      expect(result.isBlocked).toBe(false);
      expect(result.reason).toBe("not_required");
    });

    it("never blocks when status is active", () => {
      const result = resolveBillingGateState({
        billingOnboardingRequired: false,
        subscriptionStatus: "active",
        subscriptionCurrentPeriodEnd: "2027-01-01T00:00:00Z",
      });
      expect(result.isBlocked).toBe(false);
      expect(result.reason).toBe("not_required");
    });
  });

  describe("status: active", () => {
    it("is not blocked", () => {
      const result = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: "active",
        subscriptionCurrentPeriodEnd: "2027-01-01T00:00:00Z",
      });
      expect(result.isBlocked).toBe(false);
      expect(result.reason).toBe("subscription_active");
      expect(result.hasActiveSubscription).toBe(true);
      expect(result.required).toBe(true);
    });
  });

  describe("status: trialing", () => {
    it("is not blocked when trial has not expired", () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: "trialing",
        subscriptionCurrentPeriodEnd: futureDate,
      });
      expect(result.isBlocked).toBe(false);
      expect(result.reason).toBe("subscription_active");
      expect(result.hasActiveSubscription).toBe(true);
    });

    it("is blocked when trial has expired", () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const result = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: "trialing",
        subscriptionCurrentPeriodEnd: pastDate,
      });
      expect(result.isBlocked).toBe(true);
      expect(result.reason).toBe("trial_expired");
      expect(result.hasActiveSubscription).toBe(false);
    });

    it("is not blocked when trialing with null end date", () => {
      const result = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: "trialing",
        subscriptionCurrentPeriodEnd: null,
      });
      expect(result.isBlocked).toBe(false);
      expect(result.reason).toBe("subscription_active");
    });

    it("is not blocked when trialing with invalid date string", () => {
      const result = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: "trialing",
        subscriptionCurrentPeriodEnd: "not-a-date",
      });
      expect(result.isBlocked).toBe(false);
      expect(result.reason).toBe("subscription_active");
    });

    it("supports injecting a custom `now` for deterministic expiry tests", () => {
      const periodEnd = "2025-01-01T00:00:00Z";

      const beforeExpiry = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: "trialing",
        subscriptionCurrentPeriodEnd: periodEnd,
        now: new Date("2024-12-31T00:00:00Z"),
      });
      expect(beforeExpiry.isBlocked).toBe(false);

      const afterExpiry = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: "trialing",
        subscriptionCurrentPeriodEnd: periodEnd,
        now: new Date("2025-01-02T00:00:00Z"),
      });
      expect(afterExpiry.isBlocked).toBe(true);
    });
  });

  describe("status: null (missing subscription)", () => {
    it("is blocked with reason subscription_missing", () => {
      const result = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: null,
        subscriptionCurrentPeriodEnd: null,
      });
      expect(result.isBlocked).toBe(true);
      expect(result.reason).toBe("subscription_missing");
      expect(result.hasActiveSubscription).toBe(false);
      expect(result.status).toBe(null);
    });
  });

  describe("inactive statuses", () => {
    it.each(["canceled", "past_due", "unpaid", "incomplete", "incomplete_expired"])(
      "is blocked for status: %s",
      (status) => {
        const result = resolveBillingGateState({
          billingOnboardingRequired: true,
          subscriptionStatus: status,
          subscriptionCurrentPeriodEnd: null,
        });
        expect(result.isBlocked).toBe(true);
        expect(result.reason).toBe("subscription_inactive");
        expect(result.hasActiveSubscription).toBe(false);
        expect(result.status).toBe(status);
      },
    );
  });

  describe("result shape", () => {
    it("includes status and currentPeriodEnd in the result", () => {
      const periodEnd = "2027-06-01T00:00:00Z";
      const result = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: "active",
        subscriptionCurrentPeriodEnd: periodEnd,
      });
      expect(result.status).toBe("active");
      expect(result.currentPeriodEnd).toBe(periodEnd);
    });

    it("passes currentPeriodEnd through for expired trials", () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const result = resolveBillingGateState({
        billingOnboardingRequired: true,
        subscriptionStatus: "trialing",
        subscriptionCurrentPeriodEnd: pastDate,
      });
      expect(result.currentPeriodEnd).toBe(pastDate);
    });
  });
});

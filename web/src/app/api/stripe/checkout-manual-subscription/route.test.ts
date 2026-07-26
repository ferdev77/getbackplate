import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  assertSuperadmin: vi.fn(),
  syncOrganizationPlan: vi.fn(),
  pricesRetrieve: vi.fn(),
  pricesList: vi.fn(),
  checkoutCreate: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionUpdate: vi.fn(),
  portalCreate: vi.fn(),
  existingSubscriptionId: null as string | null,
  insertedOrders: [] as Record<string, unknown>[],
}));

function queryFor(table: string) {
  let selection = "";
  const query = {
    select: vi.fn((columns?: string) => {
      selection = columns ?? "";
      return query;
    }),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    update: vi.fn(() => query),
    upsert: vi.fn(() => query),
    delete: vi.fn(() => query),
    insert: vi.fn((value: Record<string, unknown>) => {
      if (table === "manual_subscription_orders") mocks.insertedOrders.push(value);
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "organizations") {
        return { data: { id: "org-1", plan_id: null, integration_plan_id: null } };
      }
      if (table === "plans") {
        return {
          data: {
            id: "plan-grow",
            code: "grow",
            name: "Grow",
            stripe_price_id: "price-monthly",
            is_enterprise: false,
            setup_fee_amount: 799,
            setup_fee_annual_discount_pct: 25,
          },
        };
      }
      if (table === "module_catalog") {
        return { data: { id: "module-qbo", extra_connection_stripe_price_id: null } };
      }
      if (table === "stripe_customers") return { data: null };
      if (table === "subscriptions" || selection === "stripe_subscription_id") {
        return {
          data: mocks.existingSubscriptionId
            ? { stripe_subscription_id: mocks.existingSubscriptionId }
            : null,
        };
      }
      if (table === "organization_addons") return { data: { price_per_invoice_cents: null } };
      throw new Error(`Unexpected maybeSingle query for ${table} (${selection})`);
    }),
    single: vi.fn(async () => ({ data: { id: "order-1" }, error: null })),
  };
  return query;
}

const supabase = { from: vi.fn((table: string) => queryFor(table)) };

vi.mock("@/shared/lib/access", () => ({ assertSuperadminApi: mocks.assertSuperadmin }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => supabase),
}));
vi.mock("@/modules/organizations/services/organization.service", () => ({
  syncOrganizationPlan: mocks.syncOrganizationPlan,
}));
vi.mock("@/shared/lib/legal-consent", () => ({
  legalConsentMetadata: vi.fn(() => ({ legalVersion: "test-version" })),
  buildTermsConsentParams: vi.fn(() => ({
    consent_collection: { terms_of_service: "required" },
    custom_text: { terms_of_service_acceptance: { message: "Test terms" } },
  })),
}));
vi.mock("@/infrastructure/stripe/client", () => ({
  stripe: {
    prices: { retrieve: mocks.pricesRetrieve, list: mocks.pricesList },
    checkout: { sessions: { create: mocks.checkoutCreate } },
    subscriptions: {
      retrieve: mocks.subscriptionRetrieve,
      update: mocks.subscriptionUpdate,
    },
    billingPortal: { sessions: { create: mocks.portalCreate } },
  },
}));

function request(includeSetupFee: boolean) {
  return new NextRequest("https://test.invalid/api/stripe/checkout-manual-subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      organizationId: "org-1",
      planKind: "integration",
      planId: "plan-grow",
      billingPeriod: "yearly",
      includeSetupFee,
    }),
  });
}

describe("POST /api/stripe/checkout-manual-subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertedOrders.length = 0;
    mocks.existingSubscriptionId = null;
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://test.invalid");
    mocks.assertSuperadmin.mockResolvedValue({ ok: true, userId: "admin-1" });
    mocks.syncOrganizationPlan.mockResolvedValue({ ok: true });
    mocks.pricesRetrieve.mockResolvedValue({
      id: "price-monthly",
      product: "prod-grow",
      currency: "usd",
      recurring: { interval: "month" },
    });
    mocks.pricesList.mockResolvedValue({
      data: [{
        id: "price-yearly",
        product: "prod-grow",
        currency: "usd",
        recurring: { interval: "year" },
      }],
    });
    mocks.checkoutCreate.mockResolvedValue({
      id: "cs-test",
      url: "https://checkout.test/session",
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    { includeSetupFee: true, expectedAmount: 59_925, expectedPaid: "true" },
    { includeSetupFee: false, expectedAmount: null, expectedPaid: "false" },
  ])(
    "creates yearly integration checkout with setup=$includeSetupFee and a 25% discount",
    async ({ includeSetupFee, expectedAmount, expectedPaid }) => {
      const { POST } = await import("./route");
      const response = await POST(request(includeSetupFee));

      expect(response.status).toBe(200);
      expect(mocks.checkoutCreate).toHaveBeenCalledOnce();
      const params = mocks.checkoutCreate.mock.calls[0][0];
      expect(params.line_items[0]).toEqual({ price: "price-yearly", quantity: 1 });
      if (expectedAmount === null) {
        expect(params.line_items).toHaveLength(1);
      } else {
        expect(params.line_items[1]).toEqual({
          price_data: {
            currency: "usd",
            product_data: { name: "Setup · Grow (25% annual discount)" },
            unit_amount: expectedAmount,
          },
          quantity: 1,
        });
      }
      expect(params.metadata).toMatchObject({
        setupFeePaid: expectedPaid,
        setupFeeAmount: String(expectedAmount ?? 0),
        manualSubscriptionOrderId: "order-1",
      });
      expect(mocks.insertedOrders[0]).toMatchObject({
        include_setup_fee: includeSetupFee,
        status: "pending",
      });
    },
  );

  it("updates an existing subscription without creating Checkout", async () => {
    mocks.existingSubscriptionId = "sub-existing";
    mocks.subscriptionRetrieve.mockResolvedValue({
      items: { data: [{ id: "si-current", price: { id: "price-old" } }] },
    });
    const { POST } = await import("./route");
    const response = await POST(request(true));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ upgraded: true });
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith("sub-existing", expect.objectContaining({
      items: [{ id: "si-current", price: "price-yearly" }],
      proration_behavior: "create_prorations",
    }));
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    expect(mocks.insertedOrders).toContainEqual(expect.objectContaining({
      status: "upgraded",
      include_setup_fee: false,
    }));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  plan: null as Record<string, unknown> | null,
  moduleRow: { id: "module-qbo", code: "qbo_r365" } as Record<string, unknown> | null,
  existingAddon: null as Record<string, unknown> | null,
  pricesRetrieve: vi.fn(),
  pricesList: vi.fn(),
  checkoutCreate: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionUpdate: vi.fn(),
  portalCreate: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

function queryFor(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn(() => query),
    maybeSingle: vi.fn(async () => {
      if (table === "plans") return { data: mocks.plan };
      if (table === "module_catalog") return { data: mocks.moduleRow };
      if (table === "organization_addons") return { data: mocks.existingAddon };
      if (table === "stripe_customers") return { data: null };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return query;
}

const supabase = { from: vi.fn((table: string) => queryFor(table)) };

vi.mock("@/shared/lib/access", () => ({
  assertCompanyAdminModuleApi: mocks.assertAccess,
}));

vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/infrastructure/stripe/client", () => ({
  stripe: {
    prices: {
      retrieve: mocks.pricesRetrieve,
      list: mocks.pricesList,
    },
    checkout: { sessions: { create: mocks.checkoutCreate } },
    subscriptions: {
      retrieve: mocks.subscriptionRetrieve,
      update: mocks.subscriptionUpdate,
    },
    billingPortal: { sessions: { create: mocks.portalCreate } },
  },
}));

function request(body: Record<string, unknown>) {
  return new Request("https://test.invalid/api/stripe/checkout-integration", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createdSession() {
  expect(mocks.checkoutCreate).toHaveBeenCalledOnce();
  return mocks.checkoutCreate.mock.calls[0][0];
}

describe("POST /api/stripe/checkout-integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://test.invalid");
    vi.stubEnv("STRIPE_AUTOMATIC_TAX_ENABLED", "false");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_not-a-real-key");

    mocks.assertAccess.mockResolvedValue({
      ok: true,
      userId: "user-1",
      tenant: { organizationId: "org-1" },
    });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);
    mocks.plan = {
      id: "plan-grow",
      code: "grow",
      name: "Grow",
      stripe_price_id: "price-monthly",
      plan_type: "qbo_r365",
      is_enterprise: false,
      setup_fee_amount: 799,
      setup_fee_annual_discount_pct: 25,
    };
    mocks.moduleRow = { id: "module-qbo", code: "qbo_r365" };
    mocks.existingAddon = null;
    mocks.pricesRetrieve.mockResolvedValue({
      id: "price-monthly",
      product: "prod-grow",
      currency: "usd",
      recurring: { interval: "month" },
    });
    mocks.pricesList.mockResolvedValue({
      data: [{
        id: "price-annual",
        product: "prod-grow",
        currency: "usd",
        recurring: { interval: "year" },
      }],
    });
    mocks.checkoutCreate.mockResolvedValue({ url: "https://checkout.test/session" });
    mocks.subscriptionRetrieve.mockResolvedValue({ items: { data: [{ id: "si-1" }] } });
    mocks.subscriptionUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds the full one-time setup line item to monthly checkout", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      planId: "plan-grow",
      billingPeriod: "monthly",
      includeSetupFee: true,
    }));

    expect(response.status).toBe(200);
    expect(createdSession()).toMatchObject({
      mode: "subscription",
      line_items: [
        { price: "price-monthly", quantity: 1 },
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Setup · Grow" },
            unit_amount: 79_900,
          },
          quantity: 1,
        },
      ],
      metadata: {
        setupFeePaid: "true",
        setupFeeIncluded: "true",
        setupFeeAmount: "79900",
      },
      subscription_data: {
        metadata: { setupFeePaid: "true", setupFeeAmount: "79900" },
      },
    });
  });

  it("returns access denied without touching Supabase or Stripe", async () => {
    mocks.assertAccess.mockResolvedValue({
      ok: false,
      error: "Forbidden",
      status: 403,
    });
    const { POST } = await import("./route");
    const response = await POST(request({
      planId: "plan-grow",
      billingPeriod: "monthly",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.pricesRetrieve).not.toHaveBeenCalled();
    expect(mocks.pricesList).not.toHaveBeenCalled();
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.portalCreate).not.toHaveBeenCalled();
  });

  it.each(["inactive", "wrong type"])(
    "rejects an %s plan selected out by the database query",
    async () => {
      mocks.plan = null;
      const { POST } = await import("./route");
      const response = await POST(request({
        planId: "plan-grow",
        billingPeriod: "monthly",
      }));

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Plan not found" });
      expect(mocks.pricesRetrieve).not.toHaveBeenCalled();
      expect(mocks.checkoutCreate).not.toHaveBeenCalled();
      expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    },
  );

  it("rejects annual billing when Stripe has no matching annual price", async () => {
    mocks.pricesList.mockResolvedValue({ data: [] });
    const { POST } = await import("./route");
    const response = await POST(request({
      planId: "plan-grow",
      billingPeriod: "annual",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "No annual price found for this plan in Stripe.",
    });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    expect(mocks.subscriptionRetrieve).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("applies the configured discount to annual setup and selects the annual price", async () => {
    mocks.plan = {
      ...mocks.plan,
      setup_fee_annual_discount_pct: 20,
    };
    const { POST } = await import("./route");
    await POST(request({
      planId: "plan-grow",
      billingPeriod: "annual",
      includeSetupFee: true,
    }));

    const session = createdSession();
    expect(mocks.pricesList).toHaveBeenCalledWith({
      product: "prod-grow",
      active: true,
      limit: 100,
    });
    expect(session.line_items).toEqual([
      { price: "price-annual", quantity: 1 },
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Setup · Grow (20% annual discount)" },
          unit_amount: 63_920,
        },
        quantity: 1,
      },
    ]);
    expect(session.metadata).toMatchObject({
      billingPeriod: "annual",
      setupFeePaid: "true",
      setupFeeAmount: "63920",
    });
  });

  it("does not add setup when includeSetupFee is false", async () => {
    const { POST } = await import("./route");
    await POST(request({
      planId: "plan-grow",
      billingPeriod: "monthly",
      includeSetupFee: false,
    }));

    const session = createdSession();
    expect(session.line_items).toEqual([{ price: "price-monthly", quantity: 1 }]);
    expect(session.metadata).toMatchObject({
      setupFeePaid: "false",
      setupFeeIncluded: "false",
      setupFeeAmount: "0",
    });
    expect(session.subscription_data.metadata).toMatchObject({
      setupFeePaid: "false",
      setupFeeAmount: "0",
    });
  });

  it("does not charge setup again when an integration subscription exists", async () => {
    mocks.existingAddon = {
      status: "active",
      stripe_subscription_id: "sub-existing",
      integration_plan_id: "plan-old",
      setup_fee_paid: false,
    };
    const { POST } = await import("./route");
    const response = await POST(request({
      planId: "plan-grow",
      billingPeriod: "monthly",
      includeSetupFee: true,
    }));

    expect(response.status).toBe(200);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith("sub-existing", expect.objectContaining({
      items: [{ id: "si-1", price: "price-monthly" }],
      metadata: expect.objectContaining({
        setupFeePaid: "false",
        setupFeeIncluded: "true",
        setupFeeAmount: "0",
      }),
    }));
  });

  it("rejects enterprise plans before any Stripe checkout operation", async () => {
    mocks.plan = { ...mocks.plan, is_enterprise: true };
    const { POST } = await import("./route");
    const response = await POST(request({
      planId: "plan-grow",
      billingPeriod: "monthly",
      includeSetupFee: true,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Enterprise plans require contacting sales directly.",
    });
    expect(mocks.pricesRetrieve).not.toHaveBeenCalled();
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
  });
});

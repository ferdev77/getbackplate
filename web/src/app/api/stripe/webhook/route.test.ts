import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieveSubscription: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  syncOrganizationPlan: vi.fn(),
  billingNotification: vi.fn(),
  planChangeNotification: vi.fn(),
  billInvoiceUsageForRenewal: vi.fn(),
  logAuditEvent: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/infrastructure/stripe/client", () => ({
  stripe: {
    webhooks: { constructEvent: mocks.constructEvent },
    subscriptions: { retrieve: mocks.retrieveSubscription, update: vi.fn() },
  },
}));
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/modules/organizations/services/organization.service", () => ({
  syncOrganizationPlan: mocks.syncOrganizationPlan,
}));
vi.mock("@/modules/billing/services/billing-notifications.service", () => ({
  sendRenewalReminderEmail: mocks.billingNotification,
  sendPaymentFailedEmail: mocks.billingNotification,
  sendSuccessfulPaymentEmail: mocks.billingNotification,
  sendSubscriptionActivatedEmail: mocks.billingNotification,
}));
vi.mock("@/modules/billing/services/plan-change-notifications.service", () => ({
  sendPlanChangeAppliedEmail: mocks.planChangeNotification,
}));
vi.mock("@/modules/integrations/qbo-r365/usage-billing", () => ({
  billInvoiceUsageForRenewal: mocks.billInvoiceUsageForRenewal,
}));
vi.mock("@/modules/integrations/qbo-r365/renewal-format", () => ({
  formatIntegrationRenewalReminder: vi.fn(),
}));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));

function request() {
  return new Request("https://test.invalid/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "test-signature" },
    body: "raw-webhook-body",
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_not-real");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: mocks.from,
      rpc: mocks.rpc,
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects an invalid signature before creating a database client", async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
    expect(mocks.constructEvent).toHaveBeenCalledWith(
      "raw-webhook-body",
      "test-signature",
      "whsec_test_not-real",
    );
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("acknowledges a duplicate event without running business effects", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-duplicate",
      type: "checkout.session.completed",
      created: 1_774_742_400,
      data: { object: { id: "cs-duplicate" } },
    });
    mocks.rpc.mockResolvedValueOnce({
      data: [{ outcome: "processed", processing_token: null, attempt_count: 1 }],
      error: null,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_stripe_event", {
      p_event_id: "evt-duplicate",
      p_event_type: "checkout.session.completed",
      p_stripe_created_at: "2026-03-29T00:00:00.000Z",
      p_lease_seconds: 1800,
      p_max_attempts: 8,
    });
    expect(mocks.syncOrganizationPlan).not.toHaveBeenCalled();
    expect(mocks.billingNotification).not.toHaveBeenCalled();
    expect(mocks.planChangeNotification).not.toHaveBeenCalled();
    expect(mocks.billInvoiceUsageForRenewal).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    consoleInfo.mockRestore();
  });

  it("marks an event processed only after business handling completes", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-success",
      type: "unhandled.test.event",
      created: 1_774_742_400,
      data: { object: {} },
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ outcome: "claimed", processing_token: "claim-token", attempt_count: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_stripe_event", {
      p_event_id: "evt-success",
      p_processing_token: "claim-token",
    });
    consoleInfo.mockRestore();
  });

  it("returns a retryable response while another worker owns the lease", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-busy",
      type: "unhandled.test.event",
      created: 1_774_742_400,
      data: { object: {} },
    });
    mocks.rpc.mockResolvedValueOnce({
      data: [{ outcome: "busy", processing_token: null, attempt_count: 2 }],
      error: null,
    });
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    consoleWarn.mockRestore();
  });

  it("does not replay legacy partial events automatically", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-legacy",
      type: "unhandled.test.event",
      created: 1_774_742_400,
      data: { object: {} },
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ outcome: "legacy_blocked", processing_token: null, attempt_count: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, reconciliationRequired: true });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "queue_stripe_event_reconciliation", {
      p_event_id: "evt-legacy",
      p_reason: "legacy_blocked",
    });
    consoleError.mockRestore();
  });

  it("marks failed work with the same claim token so Stripe can retry it", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-failure",
      type: "checkout.session.completed",
      created: 1_774_742_400,
      data: {
        object: {
          id: "cs-failure",
          metadata: { manualPaymentOrderId: "order-id", organizationId: "org-id" },
          payment_status: "paid",
        },
      },
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ outcome: "claimed", processing_token: "failure-token", attempt_count: 3 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "fail_stripe_event_v2", {
      p_event_id: "evt-failure",
      p_processing_token: "failure-token",
      p_error: "Manual payment Checkout Session is missing required payment data",
      p_retry_after_seconds: 30,
      p_max_attempts: 8,
    });
    consoleError.mockRestore();
  });

  it("applies an asynchronously confirmed manual order before finalizing the event", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-manual",
      type: "checkout.session.async_payment_succeeded",
      created: 1_774_742_400,
      data: {
        object: {
          id: "cs-manual",
          metadata: { manualPaymentOrderId: "order-id", organizationId: "org-id" },
          amount_subtotal: 5000,
          amount_total: 5413,
          currency: "usd",
          payment_status: "paid",
          payment_intent: "pi-test",
          customer_details: { email: "customer@example.test" },
        },
      },
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ outcome: "claimed", processing_token: "manual-token", attempt_count: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "apply_manual_payment_order_transaction_v2", {
      p_order_id: "order-id",
      p_event_id: "evt-manual",
      p_checkout_session_id: "cs-manual",
      p_metadata_organization_id: "org-id",
      p_amount_subtotal: 5000,
      p_amount_total: 5413,
      p_currency: "usd",
      p_payment_intent_id: "pi-test",
      p_customer_email: "customer@example.test",
      p_paid_at: expect.any(String),
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "complete_stripe_event", {
      p_event_id: "evt-manual",
      p_processing_token: "manual-token",
    });
    consoleInfo.mockRestore();
  });

  it("acknowledges a manual session that is still awaiting asynchronous payment", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-manual-awaiting",
      type: "checkout.session.completed",
      created: 1_774_742_400,
      data: {
        object: {
          id: "cs-manual-awaiting",
          metadata: { manualPaymentOrderId: "order-id", organizationId: "org-id" },
          amount_subtotal: 5000,
          amount_total: 5000,
          currency: "usd",
          payment_status: "unpaid",
        },
      },
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ outcome: "claimed", processing_token: "awaiting-token", attempt_count: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "apply_manual_payment_order_transaction_v2",
      expect.anything(),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_stripe_event", {
      p_event_id: "evt-manual-awaiting",
      p_processing_token: "awaiting-token",
    });
    consoleInfo.mockRestore();
  });

  it("fails closed when the claim token cannot finalize the event", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-stale-worker",
      type: "unhandled.test.event",
      created: 1_774_742_400,
      data: { object: {} },
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ outcome: "claimed", processing_token: "stale-token", attempt_count: 2 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: false, error: null });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(500);
    consoleError.mockRestore();
  });

  it("rejects a paid manual session whose total is below the configured subtotal", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-underpaid",
      type: "checkout.session.completed",
      created: 1_774_742_400,
      data: {
        object: {
          id: "cs-underpaid",
          metadata: { manualPaymentOrderId: "order-id", organizationId: "org-id" },
          amount_subtotal: 5000,
          amount_total: 100,
          currency: "usd",
          payment_status: "paid",
        },
      },
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ outcome: "claimed", processing_token: "underpaid-token", attempt_count: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "apply_manual_payment_order_transaction_v2",
      expect.anything(),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "fail_stripe_event_v2", expect.objectContaining({
      p_event_id: "evt-underpaid",
      p_processing_token: "underpaid-token",
      p_error: "Manual payment total is below the configured order amount",
    }));
    consoleError.mockRestore();
  });

  it("projects the live canceled subscription instead of replaying stale active add-on data", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-stale-addon",
      type: "customer.subscription.updated",
      created: 1_774_742_400,
      data: {
        object: {
          id: "sub-addon",
          status: "active",
          customer: "cus-test",
          metadata: { isAddon: "true", organizationId: "org-id", moduleId: "module-id" },
        },
      },
    });
    mocks.retrieveSubscription.mockResolvedValue({
      id: "sub-addon",
      status: "canceled",
      customer: "cus-test",
      metadata: {
        isAddon: "true",
        organizationId: "org-id",
        moduleId: "module-id",
        moduleCode: "qbo_r365",
        integrationPlanId: "integration-plan-id",
      },
      billing_cycle_anchor: 1_774_742_400,
      start_date: 1_774_742_400,
      trial_end: null,
      items: { data: [{ price: { id: "price-test", recurring: { interval: "month" } } }] },
    });
    const addonUpsert = vi.fn().mockResolvedValue({ error: null });
    const moduleLookup = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "stop after projection" } }),
    };
    moduleLookup.select.mockReturnValue(moduleLookup);
    moduleLookup.eq.mockReturnValue(moduleLookup);
    mocks.from.mockImplementation((table: string) => {
      if (table === "organization_addons") return { upsert: addonUpsert };
      if (table === "module_catalog") return moduleLookup;
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ outcome: "claimed", processing_token: "stale-addon-token", attempt_count: 2 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith("sub-addon");
    expect(addonUpsert).toHaveBeenCalledWith(expect.objectContaining({
      status: "canceled",
      integration_plan_id: null,
    }), { onConflict: "organization_id,module_id" });
    consoleError.mockRestore();
  });
});

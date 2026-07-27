import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
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
    subscriptions: { retrieve: vi.fn(), update: vi.fn() },
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
    const reservation = {
      insert: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(),
    };
    reservation.insert.mockReturnValue(reservation);
    reservation.select.mockReturnValue(reservation);
    reservation.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    mocks.from.mockReturnValue(reservation);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith("stripe_processed_events");
    expect(reservation.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_id: "evt-duplicate",
      event_type: "checkout.session.completed",
      status: "processing",
      stripe_created_at: "2026-03-29T00:00:00.000Z",
      started_at: expect.any(String),
    }));
    expect(mocks.syncOrganizationPlan).not.toHaveBeenCalled();
    expect(mocks.billingNotification).not.toHaveBeenCalled();
    expect(mocks.planChangeNotification).not.toHaveBeenCalled();
    expect(mocks.billInvoiceUsageForRenewal).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    consoleInfo.mockRestore();
  });

  it("marks an event processed only after business handling completes", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt-success",
      type: "unhandled.test.event",
      created: 1_774_742_400,
      data: { object: {} },
    });
    const reservation = {
      insert: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(),
    };
    reservation.insert.mockReturnValue(reservation);
    reservation.select.mockReturnValue(reservation);
    reservation.maybeSingle.mockResolvedValue({ data: { event_id: "evt-success" }, error: null });
    const finalization = {
      update: vi.fn(),
      eq: vi.fn(),
    };
    finalization.update.mockReturnValue(finalization);
    finalization.eq.mockReturnValueOnce(finalization).mockResolvedValueOnce({ error: null });
    mocks.from.mockReturnValueOnce(reservation).mockReturnValueOnce(finalization);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(finalization.update).toHaveBeenCalledWith({
      status: "processed",
      completed_at: expect.any(String),
      last_error: null,
    });
    expect(finalization.eq).toHaveBeenNthCalledWith(1, "event_id", "evt-success");
    expect(finalization.eq).toHaveBeenNthCalledWith(2, "status", "processing");
    consoleInfo.mockRestore();
  });
});

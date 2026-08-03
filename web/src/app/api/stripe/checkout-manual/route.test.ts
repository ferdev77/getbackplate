import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  assertSuperadminApi: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  createSession: vi.fn(),
  expireSession: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/shared/lib/access", () => ({ assertSuperadminApi: mocks.assertSuperadminApi }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/infrastructure/stripe/client", () => ({
  stripe: {
    checkout: { sessions: { create: mocks.createSession, expire: mocks.expireSession } },
  },
}));

function request() {
  return new NextRequest("https://test.invalid/api/stripe/checkout-manual", {
    method: "POST",
    body: JSON.stringify({
      organizationId: "org-id",
      currency: "usd",
      items: [{ description: "Manual service", amountCents: 5000, actionType: "custom" }],
    }),
  });
}

describe("POST /api/stripe/checkout-manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSuperadminApi.mockResolvedValue({ ok: true, userId: "admin-id" });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: mocks.from });
    mocks.createSession.mockResolvedValue({ id: "cs-test", url: "https://checkout.stripe.test/session" });
    mocks.expireSession.mockResolvedValue({ id: "cs-test", status: "expired" });
  });

  it("expires Checkout and withholds the URL when its session ID cannot be persisted", async () => {
    const organizationQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: { id: "org-id", name: "Test Org" }, error: null }),
    };
    organizationQuery.select.mockReturnValue(organizationQuery);
    organizationQuery.eq.mockReturnValue(organizationQuery);

    const orderQuery = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: { id: "order-id" }, error: null }),
      update: vi.fn(),
      eq: vi.fn(),
    };
    orderQuery.insert.mockReturnValue(orderQuery);
    orderQuery.select.mockReturnValue(orderQuery);
    orderQuery.update.mockReturnValue(orderQuery);
    orderQuery.eq.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    const customerQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    customerQuery.select.mockReturnValue(customerQuery);
    customerQuery.eq.mockReturnValue(customerQuery);

    mocks.from.mockImplementation((table: string) => {
      if (table === "organizations") return organizationQuery;
      if (table === "manual_payment_orders") return orderQuery;
      if (table === "stripe_customers") return customerQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "No se pudo guardar el enlace de pago" });
    expect(mocks.expireSession).toHaveBeenCalledWith("cs-test");
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      mode: "payment",
      payment_method_types: ["card"],
    }));
    consoleError.mockRestore();
  });
});

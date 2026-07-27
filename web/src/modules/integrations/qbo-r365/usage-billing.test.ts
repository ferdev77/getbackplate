import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  moduleRow: { id: "module-qbo" } as Record<string, unknown> | null,
  addon: null as Record<string, unknown> | null,
  plan: { invoices_included: 0 } as Record<string, unknown> | null,
  sentCount: 0,
  errors: {} as Record<string, { message: string } | null>,
  updates: [] as Array<Record<string, unknown>>,
  gte: vi.fn(),
  lt: vi.fn(),
  invoiceItemCreate: vi.fn(),
}));

function queryFor(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn((column: string, value: string) => {
      mocks.gte(table, column, value);
      return query;
    }),
    lt: vi.fn(async (column: string, value: string) => {
      mocks.lt(table, column, value);
      return { count: mocks.sentCount, error: mocks.errors[`${table}:count`] ?? null };
    }),
    update: vi.fn((values: Record<string, unknown>) => {
      mocks.updates.push(values);
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "module_catalog") return { data: mocks.moduleRow, error: mocks.errors[table] ?? null };
      if (table === "organization_addons") return { data: mocks.addon, error: mocks.errors[table] ?? null };
      if (table === "plans") return { data: mocks.plan, error: mocks.errors[table] ?? null };
      throw new Error(`Unexpected maybeSingle query for ${table}`);
    }),
    then: (resolve: (value: { data: null; error: { message: string } | null }) => unknown) =>
      Promise.resolve({ data: null, error: mocks.errors[`${table}:update`] ?? null }).then(resolve),
  };

  return query;
}

const supabase = {
  from: vi.fn((table: string) => queryFor(table)),
};

vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => supabase),
}));

vi.mock("@/infrastructure/stripe/client", () => ({
  stripe: {
    invoiceItems: { create: mocks.invoiceItemCreate },
  },
}));

import { billInvoiceUsageForRenewal, buildInvoiceUsageIdempotencyKey } from "./usage-billing";

const periodStart = new Date("2026-06-01T00:00:00.000Z");
const periodEnd = new Date("2026-07-01T00:00:00.000Z");

function bill() {
  return billInvoiceUsageForRenewal({
    organizationId: "org-1",
    stripeCustomerId: "cus-1",
    stripeSubscriptionId: "sub-1",
    periodStart,
    periodEnd,
  });
}

describe("billInvoiceUsageForRenewal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.moduleRow = { id: "module-qbo" };
    mocks.addon = {
      price_per_invoice_cents: 50,
      last_usage_billed_through: null,
      invoice_balance: 0,
      invoice_allowance_override: null,
      integration_plan_id: "plan-1",
    };
    mocks.plan = { invoices_included: 100 };
    mocks.sentCount = 0;
    mocks.errors = {};
    mocks.updates.length = 0;
    mocks.invoiceItemCreate.mockResolvedValue({ id: "ii-1" });
  });

  it("does not create an invoice item when no positive unit price is configured", async () => {
    mocks.addon = { ...mocks.addon, price_per_invoice_cents: null };

    await bill();

    expect(mocks.invoiceItemCreate).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(0);
    expect(supabase.from).not.toHaveBeenCalledWith("qbo_unified_invoices");
  });

  it("bills every sent document when the allowance override is zero", async () => {
    mocks.addon = {
      ...mocks.addon,
      price_per_invoice_cents: 75,
      invoice_balance: 500,
      invoice_allowance_override: 0,
    };
    mocks.sentCount = 12;

    await bill();

    expect(supabase.from).not.toHaveBeenCalledWith("plans");
    expect(mocks.invoiceItemCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 900,
      description: "Documents sent to R365 (12 sent, 0 included, 12 × $0.75)",
    }), expect.objectContaining({ idempotencyKey: expect.any(String) }));
  });

  it("combines the plan allowance and purchased invoice balance", async () => {
    mocks.plan = { invoices_included: 100 };
    mocks.addon = { ...mocks.addon, invoice_balance: 20 };
    mocks.sentCount = 125;

    await bill();

    expect(mocks.invoiceItemCreate).toHaveBeenCalledWith(expect.objectContaining({
      amount: 250,
      description: "Documents sent to R365 (125 sent, 120 included, 5 × $0.50)",
    }), expect.any(Object));
  });

  it("records a no-charge period without creating a Stripe invoice item", async () => {
    mocks.addon = { ...mocks.addon, invoice_balance: 20 };
    mocks.sentCount = 100;

    await bill();

    expect(mocks.invoiceItemCreate).not.toHaveBeenCalled();
    expect(mocks.updates).toContainEqual({ last_usage_billed_through: periodEnd.toISOString() });
  });

  it("skips a period already covered by the local usage marker", async () => {
    mocks.addon = {
      ...mocks.addon,
      last_usage_billed_through: periodEnd.toISOString(),
    };

    await bill();

    expect(mocks.invoiceItemCreate).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(0);
    expect(supabase.from).not.toHaveBeenCalledWith("qbo_unified_invoices");
  });

  it("passes Stripe identifiers and counts the exact half-open billing period", async () => {
    mocks.addon = { ...mocks.addon, invoice_allowance_override: 0 };
    mocks.sentCount = 3;

    await bill();

    expect(mocks.gte).toHaveBeenCalledWith(
      "qbo_unified_invoices",
      "first_sent_at",
      periodStart.toISOString(),
    );
    expect(mocks.lt).toHaveBeenCalledWith(
      "qbo_unified_invoices",
      "first_sent_at",
      periodEnd.toISOString(),
    );
    expect(mocks.invoiceItemCreate).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus-1",
      subscription: "sub-1",
      amount: 150,
      currency: "usd",
    }), {
      idempotencyKey: buildInvoiceUsageIdempotencyKey("org-1", periodStart, periodEnd),
    });
    expect(mocks.updates).toContainEqual({
      last_usage_billed_through: periodEnd.toISOString(),
    });
  });

  it("does not advance the local marker when Stripe rejects the invoice item", async () => {
    mocks.addon = { ...mocks.addon, invoice_allowance_override: 0 };
    mocks.sentCount = 3;
    mocks.invoiceItemCreate.mockRejectedValueOnce(new Error("Stripe unavailable"));

    await expect(bill()).rejects.toThrow("Stripe unavailable");

    expect(mocks.updates).toHaveLength(0);
  });

  it("does not charge or advance the marker when the document count fails", async () => {
    mocks.addon = { ...mocks.addon, invoice_allowance_override: 0 };
    mocks.errors["qbo_unified_invoices:count"] = { message: "count unavailable" };

    await expect(bill()).rejects.toThrow("Unable to count delivered documents: count unavailable");

    expect(mocks.invoiceItemCreate).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(0);
  });

  it("surfaces marker failures after Stripe uses a deterministic idempotency key", async () => {
    mocks.addon = { ...mocks.addon, invoice_allowance_override: 0 };
    mocks.sentCount = 3;
    mocks.errors["organization_addons:update"] = { message: "write unavailable" };

    await expect(bill()).rejects.toThrow("Unable to advance usage billing marker: write unavailable");

    expect(mocks.invoiceItemCreate).toHaveBeenCalledTimes(1);
    expect(mocks.invoiceItemCreate.mock.calls[0][1]).toEqual({
      idempotencyKey: buildInvoiceUsageIdempotencyKey("org-1", periodStart, periodEnd),
    });
  });
});

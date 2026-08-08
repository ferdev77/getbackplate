import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireSuperadmin: vi.fn(),
  update: vi.fn(),
  maybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
  adminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/shared/lib/access", () => ({
  requireAuthenticatedUser: mocks.requireUser,
  requireSuperadmin: mocks.requireSuperadmin,
}));
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient: mocks.adminClient }));

const reportId = "00000000-0000-4000-8000-000000000001";

describe("development report publishing actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "publisher-id", email: "fer@soliz.com" });
    mocks.requireSuperadmin.mockResolvedValue(undefined);
    mocks.maybeSingle.mockResolvedValue({ data: { id: reportId }, error: null });
    const chain = { eq: vi.fn(), select: vi.fn(), maybeSingle: mocks.maybeSingle };
    chain.eq.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    mocks.update.mockReturnValue(chain);
    mocks.adminClient.mockReturnValue({ from: vi.fn(() => ({ select: chain.select, update: mocks.update })) });
  });

  it("rejects every editor except fer@soliz.com", async () => {
    mocks.requireUser.mockResolvedValue({ id: "other-id", email: "other@example.com" });
    const { saveDevelopmentReportPricesAction } = await import("./actions");
    const result = await saveDevelopmentReportPricesAction(reportId, { "i1-1": "30" });

    expect(result).toEqual({ ok: false, error: "Sólo fer@soliz.com puede editar este borrador" });
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("persists valid prices and recalculates the total", async () => {
    const { saveDevelopmentReportPricesAction } = await import("./actions");
    const result = await saveDevelopmentReportPricesAction(reportId, { "i1-1": "30", "t1-total": "20.50" });

    expect(result).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ total_cents: 5050 }));
  });

  it("publishes a draft irreversibly with actor metadata", async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { price_state: { "i1-1": "30" } }, error: null })
      .mockResolvedValueOnce({ data: { id: reportId }, error: null });
    const { publishDevelopmentReportAction } = await import("./actions");
    const result = await publishDevelopmentReportAction(reportId);

    expect(result).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      publication_status: "published",
      published_by: "publisher-id",
      total_cents: 3000,
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/superadmin/development-log");
  });
});

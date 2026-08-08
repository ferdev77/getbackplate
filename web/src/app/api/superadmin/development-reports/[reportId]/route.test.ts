import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  maybeSingle: vi.fn(),
  adminClient: vi.fn(),
}));

vi.mock("@/shared/lib/access", () => ({ assertSuperadminApi: mocks.access }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient: mocks.adminClient }));

const reportId = "00000000-0000-4000-8000-000000000001";

describe("GET /api/superadmin/development-reports/[reportId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ ok: true, userId: "admin-id" });
    mocks.maybeSingle.mockResolvedValue({
      data: { title: "Informe privado", html_document: "<!doctype html><p>ok</p>", content_sha256: "a".repeat(64) },
      error: null,
    });
    mocks.adminClient.mockReturnValue({
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })) })),
    });
  });

  it("rejects callers who are not superadmins before reading a report", async () => {
    mocks.access.mockResolvedValue({ ok: false, status: 403, error: "Unauthorized" });
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://app.example.com/api/superadmin/development-reports/${reportId}`), { params: Promise.resolve({ reportId }) });

    expect(response.status).toBe(403);
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });

  it("serves the immutable HTML inline with restrictive headers", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://app.example.com/api/superadmin/development-reports/${reportId}`), { params: Promise.resolve({ reportId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("content-security-policy")).toContain("script-src 'unsafe-inline'");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(await response.text()).toContain("<p>ok</p>");
  });

  it("uses attachment disposition for downloads", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://app.example.com/api/superadmin/development-reports/${reportId}?download=1`), { params: Promise.resolve({ reportId }) });

    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Informe-privado.html"');
  });
});

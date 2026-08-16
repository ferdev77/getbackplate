import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  maybeSingle: vi.fn(),
  getUserById: vi.fn(),
  adminClient: vi.fn(),
}));

vi.mock("@/shared/lib/access", () => ({ assertSuperadminApi: mocks.access }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient: mocks.adminClient }));

const reportId = "00000000-0000-4000-8000-000000000001";

describe("GET /api/superadmin/development-reports/[reportId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ ok: true, userId: "admin-id" });
    mocks.getUserById.mockResolvedValue({ data: { user: { email: "other@example.com" } } });
    mocks.maybeSingle.mockResolvedValue({
      data: { title: "Informe privado", html_document: '<!doctype html><body><p>ok</p><script>var precios = {"old":"1"};</script></body>', content_sha256: "a".repeat(64), publication_status: "published", price_state: { "i1-1": "30" } },
      error: null,
    });
    mocks.adminClient.mockReturnValue({
      auth: { admin: { getUserById: mocks.getUserById } },
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
    const html = await response.text();
    expect(html).toContain("<p>ok</p>");
    expect(html).toContain("draftNote.remove()");
    expect(html).toContain("Aislamiento confirmado:");
    expect(html).toContain("Valor total del período");
    expect(html).toContain("field.replaceWith(amount)");
  });

  it("never exposes an attachment download mode", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://app.example.com/api/superadmin/development-reports/${reportId}?download=1`), { params: Promise.resolve({ reportId }) });

    expect(response.headers.get("content-disposition")).toBe('inline; filename="Informe-privado.html"');
  });

  it("hides drafts from every superadmin except fer@soliz.com", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { title: "Borrador", html_document: "<body></body>", content_sha256: "a".repeat(64), publication_status: "draft", price_state: {} },
      error: null,
    });
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://app.example.com/api/superadmin/development-reports/${reportId}`), { params: Promise.resolve({ reportId }) });

    expect(response.status).toBe(404);
  });

  it("injects saved prices and the editing bridge for the publisher draft", async () => {
    mocks.getUserById.mockResolvedValue({ data: { user: { email: "fer@soliz.com" } } });
    mocks.maybeSingle.mockResolvedValue({
      data: { title: "Borrador", html_document: '<body><script>var precios = {"old":"1"};</script></body>', content_sha256: "a".repeat(64), publication_status: "draft", price_state: { "i1-1": "45" } },
      error: null,
    });
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://app.example.com/api/superadmin/development-reports/${reportId}`), { params: Promise.resolve({ reportId }) });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('var precios = {"i1-1":"45"};');
    expect(html).toContain("development-report-prices");
    expect(html).not.toContain("draftNote.remove()");
  });
});

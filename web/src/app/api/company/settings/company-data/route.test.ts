import { beforeEach, describe, expect, it, vi } from "vitest";

const assertAccessMock = vi.fn();
const logAuditEventMock = vi.fn();
const revalidatePathMock = vi.fn();
const settingsUpsertMock = vi.fn();
const organizationUpdateEqMock = vi.fn();
const getUserByIdMock = vi.fn();
const identityMaybeSingleMock = vi.fn();
const settingsMaybeSingleMock = vi.fn();

const serverClient = {
  from: vi.fn((table: string) => {
    if (table === "organization_settings") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: settingsMaybeSingleMock })),
        })),
        upsert: settingsUpsertMock,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
};

const adminClient = {
  from: vi.fn((table: string) => {
    if (table === "organizations") {
      return {
        update: vi.fn(() => ({ eq: organizationUpdateEqMock })),
      };
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: identityMaybeSingleMock })),
        })),
      })),
    };
  }),
  auth: { admin: { getUserById: getUserByIdMock } },
};

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/shared/lib/access", () => ({ assertCompanyAdminModuleApi: assertAccessMock }));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: logAuditEventMock }));
vi.mock("@/infrastructure/supabase/client/server", () => ({
  createSupabaseServerClient: vi.fn(async () => serverClient),
}));
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => adminClient),
}));

function request(body: Record<string, unknown>) {
  return new Request("https://app.example.com/api/company/settings/company-data", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/company/settings/company-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertAccessMock.mockResolvedValue({
      ok: true,
      userId: "user-1",
      tenant: { organizationId: "org-1" },
    });
    settingsMaybeSingleMock.mockResolvedValue({ data: { support_email: null } });
    identityMaybeSingleMock.mockResolvedValue({ data: { email_at_link: "intuit@example.com" } });
    getUserByIdMock.mockResolvedValue({ data: { user: { email: "auth@example.com" } } });
    organizationUpdateEqMock.mockResolvedValue({ error: null });
    settingsUpsertMock.mockResolvedValue({ error: null });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it("stores company fields in organization_settings and ignores a submitted email", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      organizationName: "Acme Distribution",
      contactName: "Ada Admin",
      supportEmail: "attacker@example.com",
      supportPhone: "+1 555 0100",
      address: "1 Main Street",
      websiteUrl: "acme.example",
    }));

    expect(response.status).toBe(200);
    expect(settingsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        contact_name: "Ada Admin",
        support_email: "intuit@example.com",
        support_phone: "+1 555 0100",
        address: "1 Main Street",
        website_url: "https://acme.example",
      }),
      { onConflict: "organization_id" },
    );
    expect(organizationUpdateEqMock).toHaveBeenCalledWith("id", "org-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/integrations/quickbooks");
  });

  it("preserves the existing canonical email when another admin saves", async () => {
    settingsMaybeSingleMock.mockResolvedValue({ data: { support_email: "owner@example.com" } });
    const { POST } = await import("./route");
    const response = await POST(request({ organizationName: "Acme", supportPhone: "555" }));

    expect(response.status).toBe(200);
    expect(settingsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ support_email: "owner@example.com" }),
      { onConflict: "organization_id" },
    );
  });
});

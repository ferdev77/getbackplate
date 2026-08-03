import { describe, it, expect, vi, beforeEach } from "vitest";

// La firma refleja la real: (userIds, payload, options).
type PushPayload = { title: string; body: string; url: string };
type PushOptions = { source: string; organizationId: string };

const sendPushToUsers = vi.hoisted(() =>
  vi.fn(async (...args: [string[], PushPayload, PushOptions]) => ({
    sent: Array.isArray(args[0]) ? args[0].length : 0,
  })),
);

vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers }));
vi.mock("@/shared/lib/auth-users", () => ({
  getAuthEmailByUserId: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, `${id}@test.com`]))),
}));

const { sendDocumentAudiencePush, sendFolderAudiencePush } = await import("../document-audience.service");

function buildSupabaseMock(employees: object[], memberships: object[] = []) {
  const tables: Record<string, object[]> = {
    employees,
    memberships,
    department_positions: [],
    organization_user_profiles: [],
    branches: [],
    // Sin company_admins: toda la audiencia de estos casos es del portal, asi
    // que sendPushPorRol manda un solo push, con el link de empleado.
    roles: [],
  };
  const chain = (data: object[]) => {
    const c = {
      select: () => c,
      eq: () => c,
      not: () => c,
      in: () => c,
      maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
      data,
      error: null,
    };
    return c;
  };
  return { from: (table: string) => chain(tables[table] ?? []) };
}

const empleados = [
  { user_id: "u-centro", branch_id: "b-centro", department_id: "d-cocina", position: null, phone: null, phone_country_code: null },
  { user_id: "u-norte", branch_id: "b-norte", department_id: "d-cocina", position: null, phone: null, phone_country_code: null },
  { user_id: "u-autor", branch_id: "b-centro", department_id: "d-cocina", position: null, phone: null, phone_country_code: null },
];

beforeEach(() => sendPushToUsers.mockClear());

describe("notificaciones de documentos y carpetas", () => {
  it("notifica a quien queda dentro del alcance", async () => {
    await sendDocumentAudiencePush({
      supabase: buildSupabaseMock(empleados),
      organizationId: "org1",
      accessScope: { locations: ["b-centro"], department_ids: [], position_ids: [], users: [] },
      title: "Manual de cierre",
    });

    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    const [recipients, payload] = sendPushToUsers.mock.calls[0];
    expect(recipients).toContain("u-centro");
    expect(recipients).not.toContain("u-norte");
    expect(payload).toMatchObject({ title: "Nuevo documento", body: "Manual de cierre" });
  });

  it("no le notifica a quien subio el documento", async () => {
    await sendDocumentAudiencePush({
      supabase: buildSupabaseMock(empleados),
      organizationId: "org1",
      accessScope: { locations: ["b-centro"], department_ids: [], position_ids: [], users: [] },
      actorUserId: "u-autor",
      title: "Manual de cierre",
    });

    const [recipients] = sendPushToUsers.mock.calls[0];
    expect(recipients).toContain("u-centro");
    expect(recipients).not.toContain("u-autor");
  });

  it("respeta un alcance de solo personas", async () => {
    await sendDocumentAudiencePush({
      supabase: buildSupabaseMock(empleados),
      organizationId: "org1",
      accessScope: { locations: [], department_ids: [], position_ids: [], users: ["u-norte"] },
      title: "Contrato",
    });

    const [recipients] = sendPushToUsers.mock.calls[0];
    expect(recipients).toEqual(["u-norte"]);
  });

  it("no manda nada cuando nadie queda en el alcance", async () => {
    await sendDocumentAudiencePush({
      supabase: buildSupabaseMock(empleados),
      organizationId: "org1",
      accessScope: { locations: ["b-inexistente"], department_ids: [], position_ids: [], users: [] },
      title: "Manual",
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("distingue el titulo de una carpeta", async () => {
    await sendFolderAudiencePush({
      supabase: buildSupabaseMock(empleados),
      organizationId: "org1",
      accessScope: { locations: ["b-centro"], department_ids: [], position_ids: [], users: [] },
      title: "Recetas",
    });

    const [, payload] = sendPushToUsers.mock.calls[0];
    expect(payload).toMatchObject({ title: "Nueva carpeta", body: "Recetas" });
  });

  it("exige todas las dimensiones pobladas, igual que la lectura", async () => {
    await sendDocumentAudiencePush({
      supabase: buildSupabaseMock(empleados),
      organizationId: "org1",
      accessScope: { locations: ["b-centro"], department_ids: ["d-salon"], position_ids: [], users: [] },
      title: "Manual",
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});

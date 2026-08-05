import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Que avisa el alta de una solicitud, y que no.
 *
 * Dos reglas, cada una por un problema real:
 *
 * 1. Un borrador no avisa a nadie. Antes la campanita salia igual al guardar
 *    borrador: le llegaba a toda la gente de mantenimiento un aviso de algo a
 *    medio escribir, que ademas no podian ver.
 *
 * 2. El push/campanita sale siempre que se envie; el email solo si tildaron
 *    "Enviar por email" en el modal.
 */

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  create: vi.fn(),
  attach: vi.fn(),
  notifyPush: vi.fn(),
  notifyEmail: vi.fn(),
  locationName: vi.fn(),
  /** Lo que `after` dejo corriendo despues de responder. */
  pendientes: [] as Promise<unknown>[],
}));

// `after` difiere el trabajo hasta despues de la respuesta, sin que el handler
// lo espere: hay que guardarse la promesa para poder observar los avisos.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => Promise<void>) => { mocks.pendientes.push(cb()); } };
});

vi.mock("@/shared/lib/access", () => ({ assertCompanyAdminModuleApi: mocks.access }));
vi.mock("@/modules/maintenance/services", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/maintenance/services")>();
  return { ...original, createMaintenanceRequest: mocks.create, attachMaintenanceFiles: mocks.attach };
});
vi.mock("@/modules/maintenance/services/maintenance-events.service", () => ({
  notifyMaintenanceRequested: mocks.notifyPush,
  notifyMaintenanceRequestedByEmail: mocks.notifyEmail,
}));
vi.mock("@/modules/maintenance/lib/location-label", () => ({ nombreDeLaLocacion: mocks.locationName }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({})) }));

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const BRANCH_ID = "00000000-0000-4000-8000-000000000003";
const REQUEST_ID = "00000000-0000-4000-8000-000000000004";

function request(campos: Record<string, string>) {
  const formData = new FormData();
  formData.set("branch_id", BRANCH_ID);
  formData.set("title", "Heladera");
  formData.set("description", "Pierde agua por abajo.");
  formData.set("category", "Refrigeracion");
  formData.set("priority", "high");
  for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor);

  return new Request("https://test.invalid/api/company/maintenance", { method: "POST", body: formData });
}

/** Postea y espera a que terminen los avisos que quedaron en `after`. */
async function crear(campos: Record<string, string>) {
  const { POST } = await import("./route");
  const response = await POST(request(campos));
  await Promise.all(mocks.pendientes);
  return response;
}

describe("POST /api/company/maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendientes.length = 0;
    mocks.access.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      tenant: { organizationId: ORG_ID, branchId: null, roleCode: "company_admin" },
    });
    mocks.create.mockResolvedValue(REQUEST_ID);
    mocks.attach.mockResolvedValue(undefined);
    mocks.locationName.mockResolvedValue("Long Beach");
    mocks.notifyPush.mockResolvedValue(0);
    mocks.notifyEmail.mockResolvedValue(undefined);
  });

  it("guardar borrador no avisa a nadie, ni por campanita ni por email", async () => {
    const response = await crear({ action: "draft", send_email: "on" });

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalled();
    expect(mocks.notifyPush).not.toHaveBeenCalled();
    expect(mocks.notifyEmail).not.toHaveBeenCalled();
  });

  it("crear y enviar con el check tildado manda campanita y email", async () => {
    const response = await crear({ action: "submit", send_email: "on" });

    expect(response.status).toBe(201);
    expect(mocks.notifyPush).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      title: "Heladera",
      priority: "high",
      branchId: BRANCH_ID,
      locationName: "Long Beach",
      createdByUserId: USER_ID,
    }));
    expect(mocks.notifyEmail).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG_ID,
      title: "Heladera",
      description: "Pierde agua por abajo.",
      priority: "high",
      locationName: "Long Beach",
      createdByUserId: USER_ID,
    }));
  });

  it("crear y enviar con el check destildado manda solo campanita", async () => {
    const response = await crear({ action: "submit" });

    expect(response.status).toBe(201);
    expect(mocks.notifyPush).toHaveBeenCalled();
    expect(mocks.notifyEmail).not.toHaveBeenCalled();
  });
});

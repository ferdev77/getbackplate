import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Subida instantanea al expediente desde el portal, para quien tiene la gestion
 * de empleados delegada.
 *
 * Existe porque la pantalla apuntaba fija al endpoint del panel de empresa, que
 * exige rol company_admin: al delegado le devolvia 403 al subir un documento.
 *
 * Las dos reglas que importan:
 *
 * 1. El permiso delegado no alcanza a toda la empresa. Quien gestiona una
 *    locacion no puede cargarle documentos a alguien de otra.
 * 2. Un slot guarda un documento: el nuevo reemplaza al anterior en vez de
 *    apilarse, y los duplicados viejos se descartan.
 */

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  hrScope: vi.fn(),
  inScope: vi.fn(),
  crearDocumento: vi.fn(),
  analyze: vi.fn(),
  audit: vi.fn(),
  push: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  borrarDocumento: vi.fn(),
  filas: {} as Record<string, unknown>,
}));

vi.mock("@/shared/lib/access", () => ({ assertEmployeeCapabilityApi: mocks.access }));
vi.mock("@/modules/employees/lib/api-scope", () => ({
  resolveHrScope: mocks.hrScope,
  isEmployeeInScope: mocks.inScope,
}));
vi.mock("@/modules/employees/services/employee-documents-upload.service", () => ({
  createEmployeeSlotDocument: mocks.crearDocumento,
}));
vi.mock("@/shared/lib/file-security", () => ({ analyzeUploadedFile: mocks.analyze }));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers: mocks.push }));
vi.mock("@/shared/lib/locale", () => ({ resolveUserLocale: vi.fn(async () => "es") }));
vi.mock("@/shared/lib/notifications.i18n", () => ({
  createNotificationsTranslator: vi.fn(() => (texto: string) => texto),
}));

function consulta(tabla: string) {
  const resultado = { data: mocks.filas[tabla] ?? null, error: null };
  const cadena: Record<string, unknown> = {
    select: () => cadena,
    insert: (payload: unknown) => {
      mocks.insert(tabla, payload);
      return cadena;
    },
    update: (payload: unknown) => {
      mocks.update(tabla, payload);
      return cadena;
    },
    delete: () => cadena,
    eq: () => cadena,
    in: () => cadena,
    is: () => cadena,
    limit: () => cadena,
    maybeSingle: async () => resultado,
    single: async () => resultado,
    then: (resolver: (valor: typeof resultado) => unknown) => resolver(resultado),
  };
  return cadena;
}

vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: (tabla: string) => consulta(tabla),
    storage: { from: () => ({ remove: mocks.borrarDocumento }) },
  })),
}));

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000002";
const EMPLEADO = "00000000-0000-4000-8000-000000000003";

function pedido(campos: Record<string, string | File> = {}) {
  const formData = new FormData();
  formData.set("employeeId", EMPLEADO);
  formData.set("slot", "id");
  formData.set("file", new File(["bytes"], "ine.pdf", { type: "application/pdf" }));
  for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor);

  return new Request("https://test.invalid/api/employee/employees/documents/upload", {
    method: "POST",
    body: formData,
  });
}

async function subir(campos: Record<string, string | File> = {}) {
  const { POST } = await import("./route");
  return POST(pedido(campos));
}

describe("POST /api/employee/employees/documents/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      ok: true,
      userId: ACTOR,
      tenant: { organizationId: ORG, branchId: null, roleCode: "employee" },
    });
    mocks.hrScope.mockResolvedValue(null);
    mocks.inScope.mockReturnValue(true);
    mocks.analyze.mockResolvedValue({
      safeName: "ine.pdf",
      originalName: "ine.pdf",
      normalizedMime: "application/pdf",
      checksumSha256: "abc",
    });
    mocks.crearDocumento.mockResolvedValue({
      ok: true,
      documentId: "doc-1",
      title: "ID / Identificacion - Ana Perez",
      path: `${ORG}/employees/${EMPLEADO}/company/id/1738-ine.pdf`,
    });
    mocks.audit.mockResolvedValue(undefined);
    mocks.filas = {
      employees: {
        id: EMPLEADO,
        user_id: "user-1",
        first_name: "Ana",
        last_name: "Perez",
        branch_id: "branch-1",
        department_id: null,
        location_scope_ids: [],
        all_locations: false,
      },
      employee_documents: [],
    };
  });

  it("sube el documento y lo cuelga del expediente", async () => {
    const response = await subir();
    const cuerpo = await response.json();

    expect(response.status).toBe(200);
    expect(cuerpo).toMatchObject({ ok: true, slot: "id", status: "approved", documentId: "doc-1" });
    expect(mocks.crearDocumento).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, employeeId: EMPLEADO, actorId: ACTOR, slot: "id" }),
    );
    expect(mocks.insert).toHaveBeenCalledWith("employee_documents", expect.objectContaining({ employee_id: EMPLEADO }));
  });

  it("no deja cargarle documentos a un empleado de otra locacion", async () => {
    mocks.hrScope.mockResolvedValue(["branch-2"]);
    mocks.inScope.mockReturnValue(false);

    const response = await subir();
    const cuerpo = await response.json();

    expect(response.status).toBe(403);
    expect(cuerpo.error).toContain("No tienes permisos");
    // Se corta antes de escribir nada.
    expect(mocks.crearDocumento).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("respeta el gate de capacidad delegada", async () => {
    mocks.access.mockResolvedValue({ ok: false, status: 403, error: "Permission required" });

    const response = await subir();

    expect(response.status).toBe(403);
    expect(mocks.crearDocumento).not.toHaveBeenCalled();
  });

  it("reemplaza el documento anterior del mismo slot en vez de apilar otro", async () => {
    mocks.filas.employee_documents = [
      { id: "link-1", document_id: "doc-viejo", linked_document: { title: "ID / Identificacion - Ana Perez" } },
    ];

    const response = await subir();

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      "employee_documents",
      expect.objectContaining({ document_id: "doc-1", status: "approved" }),
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rechaza el pedido sin archivo ni ruta", async () => {
    const formData = new FormData();
    formData.set("employeeId", EMPLEADO);
    formData.set("slot", "id");

    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://test.invalid/api/employee/employees/documents/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.crearDocumento).not.toHaveBeenCalled();
  });

  it("rechaza un slot que no existe", async () => {
    const response = await subir({ slot: "inventado" });

    expect(response.status).toBe(400);
    expect(mocks.crearDocumento).not.toHaveBeenCalled();
  });

  it("devuelve el error del servicio sin dejar el documento a medias", async () => {
    mocks.crearDocumento.mockResolvedValue({ ok: false, message: "Limite de almacenamiento alcanzado" });

    const response = await subir();
    const cuerpo = await response.json();

    expect(response.status).toBe(400);
    expect(cuerpo.error).toBe("Limite de almacenamiento alcanzado");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Que hace el alta del portal con los documentos del expediente.
 *
 * Esta ruta parseaba el multipart y descartaba los archivos: respondia
 * "empleado creado" con el expediente vacio y nadie se enteraba. Estuvo asi
 * desde que se creo el modulo de delegacion de RRHH, cinco semanas.
 *
 * Las tres reglas que quedaron:
 *
 * 1. Si vienen documentos, se guardan y se cuelgan del expediente.
 * 2. Si no se pueden guardar, se avisa y se revierten solo los documentos: en
 *    una edicion, tirar abajo al empleado por un archivo fallido seria peor.
 * 3. Un usuario sin perfil de empleado no tiene expediente. Antes se le
 *    aceptaban los archivos igual y se perdian; ahora se avisa.
 */

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  hrScope: vi.fn(),
  inScope: vi.fn(),
  leerDocumentos: vi.fn(),
  colgarDocumentos: vi.fn(),
  borrarStaging: vi.fn(),
  revertirDocumentos: vi.fn(),
  revertirAlta: vi.fn(),
  syncProyeccion: vi.fn(),
  contratoPdf: vi.fn(),
  audit: vi.fn(),
  filas: {} as Record<string, unknown>,
}));

vi.mock("@/shared/lib/access", () => ({ assertEmployeeCapabilityApi: mocks.access }));
vi.mock("@/modules/employees/lib/api-scope", () => ({
  resolveHrScope: mocks.hrScope,
  isEmployeeInScope: mocks.inScope,
}));
vi.mock("@/modules/employees/services/employee-documents-upload.service", () => ({
  readEmployeeDocumentUploads: mocks.leerDocumentos,
  attachEmployeeDocumentUploads: mocks.colgarDocumentos,
  removeStagedEmployeeUploads: mocks.borrarStaging,
  rollbackEmployeeDocumentUploads: mocks.revertirDocumentos,
}));
vi.mock("@/modules/employees/services/company-employees-route-support", () => ({
  rollbackEmployeeCreateFlow: mocks.revertirAlta,
  syncEmployeeProfileProjection: mocks.syncProyeccion,
  upsertEmployeeContractDocument: mocks.contratoPdf,
}));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/modules/employees/services", () => ({ getEmployeeDirectoryView: vi.fn() }));
vi.mock("@/shared/lib/plan-limits", () => ({
  assertPlanLimitForEmployees: vi.fn(),
  assertPlanLimitForUsers: vi.fn(),
  getPlanLimitErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
}));
vi.mock("@/shared/lib/user-provisioning.service", () => ({ provisionOrganizationUserAccount: vi.fn() }));
vi.mock("@/shared/lib/user", () => ({ extractDisplayName: vi.fn(() => "Nombre") }));

/**
 * Cadena de supabase que responde lo que diga mocks.filas segun la tabla, y que
 * ademas se puede esperar directamente (update/insert devuelven { error }).
 */
function consulta(tabla: string) {
  const resultado = { data: mocks.filas[tabla] ?? null, error: null };
  const cadena: Record<string, unknown> = {
    select: () => cadena,
    insert: () => cadena,
    update: () => cadena,
    upsert: () => cadena,
    delete: () => cadena,
    eq: () => cadena,
    in: () => cadena,
    is: () => cadena,
    order: () => cadena,
    limit: () => cadena,
    maybeSingle: async () => resultado,
    single: async () => resultado,
    then: (resolver: (valor: typeof resultado) => unknown) => resolver(resultado),
  };
  return cadena;
}

const clienteFalso = { from: (tabla: string) => consulta(tabla), storage: {} };

vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => clienteFalso),
}));
vi.mock("@/infrastructure/supabase/client/server", () => ({
  createSupabaseServerClient: vi.fn(async () => clienteFalso),
}));

const ORG = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000002";
const EMPLEADO = "00000000-0000-4000-8000-000000000003";

function formulario(campos: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("employee_id", EMPLEADO);
  formData.set("first_name", "Ana");
  formData.set("last_name", "Perez");
  formData.set("email", "ana@empresa.com");
  formData.set("phone", "5551234567");
  for (const [clave, valor] of Object.entries(campos)) formData.set(clave, valor);

  return new Request("https://test.invalid/api/employee/employees", { method: "POST", body: formData });
}

async function guardar(campos: Record<string, string> = {}) {
  const { POST } = await import("./route");
  return POST(formulario(campos));
}

const UN_DOCUMENTO = [{ slotKey: "id", slotLabel: "ID / Identificacion", file: {}, analysis: {} }];

describe("POST /api/employee/employees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      ok: true,
      userId: ACTOR,
      tenant: { organizationId: ORG, branchId: null, roleCode: "employee" },
    });
    mocks.hrScope.mockResolvedValue(null);
    mocks.inScope.mockReturnValue(true);
    mocks.leerDocumentos.mockResolvedValue({ ok: true, uploads: [], stagingPaths: [] });
    mocks.colgarDocumentos.mockResolvedValue({ ok: true, documentIds: [], paths: [] });
    mocks.audit.mockResolvedValue(undefined);
    mocks.syncProyeccion.mockResolvedValue({ error: null });
    mocks.filas = {
      organizations: { name: "Prodel" },
      employees: { id: EMPLEADO, user_id: null, branch_id: null, location_scope_ids: [], all_locations: false },
      organization_user_profiles: { id: "perfil-1", user_id: null },
    };
  });

  it("cuelga del expediente los documentos que vinieron con el formulario", async () => {
    mocks.leerDocumentos.mockResolvedValue({
      ok: true,
      uploads: UN_DOCUMENTO,
      stagingPaths: [`${ORG}/staging/employees/1738-ine.pdf`],
    });

    const response = await guardar();

    expect(response.status).toBe(200);
    expect(mocks.colgarDocumentos).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, employeeId: EMPLEADO, actorId: ACTOR, uploads: UN_DOCUMENTO }),
    );
    // La carpeta de paso no queda ocupada despues de copiar los bytes.
    expect(mocks.borrarStaging).toHaveBeenCalledWith([`${ORG}/staging/employees/1738-ine.pdf`]);
  });

  it("no inventa trabajo cuando el formulario no trae documentos", async () => {
    const response = await guardar();

    expect(response.status).toBe(200);
    expect(mocks.colgarDocumentos).not.toHaveBeenCalled();
  });

  it("avisa y revierte solo los documentos cuando no se pueden guardar", async () => {
    mocks.leerDocumentos.mockResolvedValue({ ok: true, uploads: UN_DOCUMENTO, stagingPaths: [] });
    mocks.colgarDocumentos.mockResolvedValue({
      ok: false,
      message: "Limite de almacenamiento alcanzado",
      documentIds: ["doc-1"],
      paths: [`${ORG}/employees/${EMPLEADO}/1738-ine.pdf`],
    });

    const response = await guardar();
    const cuerpo = await response.json();

    expect(response.status).toBe(400);
    expect(cuerpo.error).toContain("no se pudieron guardar los documentos");
    expect(cuerpo.error).toContain("Limite de almacenamiento alcanzado");
    expect(mocks.revertirDocumentos).toHaveBeenCalledWith(
      expect.objectContaining({ documentIds: ["doc-1"], paths: [`${ORG}/employees/${EMPLEADO}/1738-ine.pdf`] }),
    );
    // El empleado sigue en pie: no se revierte el alta entera.
    expect(mocks.revertirAlta).not.toHaveBeenCalled();
  });

  it("corta antes de tocar nada si un archivo no se pudo leer", async () => {
    mocks.leerDocumentos.mockResolvedValue({
      ok: false,
      message: "ID / Identificacion: ruta de archivo invalida",
      stagingPaths: ["otra-org/robado.pdf"],
    });

    const response = await guardar();
    const cuerpo = await response.json();

    expect(response.status).toBe(400);
    expect(cuerpo.error).toContain("ruta de archivo invalida");
    expect(mocks.colgarDocumentos).not.toHaveBeenCalled();
    expect(mocks.borrarStaging).toHaveBeenCalledWith(["otra-org/robado.pdf"]);
  });

  it("no acepta documentos para un usuario sin perfil de empleado", async () => {
    mocks.leerDocumentos.mockResolvedValue({
      ok: true,
      uploads: UN_DOCUMENTO,
      stagingPaths: [`${ORG}/staging/employees/1738-ine.pdf`],
    });

    const response = await guardar({ is_employee: "no", organization_user_profile_id: "perfil-1" });
    const cuerpo = await response.json();

    expect(response.status).toBe(400);
    expect(cuerpo.error).toBe("Los documentos solo se pueden guardar en un perfil de empleado");
    expect(mocks.colgarDocumentos).not.toHaveBeenCalled();
    expect(mocks.borrarStaging).toHaveBeenCalledWith([`${ORG}/staging/employees/1738-ine.pdf`]);
  });

  it("sigue dejando guardar un usuario sin perfil de empleado cuando no manda documentos", async () => {
    const response = await guardar({ is_employee: "no", organization_user_profile_id: "perfil-1" });

    expect(response.status).toBe(200);
    expect(mocks.colgarDocumentos).not.toHaveBeenCalled();
  });
});

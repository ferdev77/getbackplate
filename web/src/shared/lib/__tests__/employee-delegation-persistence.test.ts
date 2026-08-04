import { describe, expect, it, vi, beforeEach } from "vitest";

type FilaDePermiso = {
  organization_id: string;
  membership_id: string;
  module_code: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  granted_by: string;
};

const upsertRecibido = vi.hoisted(() => ({ filas: [] as FilaDePermiso[], onConflict: "" }));
const errorDelUpsert = vi.hoisted(() => ({ actual: null as { message: string } | null }));

const createSupabaseAdminClient = vi.hoisted(() =>
  vi.fn(() => ({
    from: () => ({
      upsert: async (filas: FilaDePermiso[], opciones: { onConflict: string }) => {
        upsertRecibido.filas = filas;
        upsertRecibido.onConflict = opciones.onConflict;
        return { error: errorDelUpsert.actual };
      },
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  })),
);

vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/modules/documents/revalidate-cache", () => ({ revalidateDocumentsCaches: vi.fn() }));
vi.mock("@/shared/lib/employee-documents-root-folder", () => ({
  ensureEmployeeDocumentsRootFolder: vi.fn(async () => ({ folderId: "folder-1" })),
  backfillEmployeeDocumentsIntoRoot: vi.fn(async () => undefined),
}));

const { parseDelegatedPermissionsFromFormData, syncDelegatedEmployeePermissions } = await import(
  "../employee-delegation-persistence"
);

/**
 * Guardar los permisos delegados de un empleado.
 *
 * Lo que se testeaba hasta ahora era el calculo de los permisos, no que se
 * guardaran. Un admin podia tocar los toggles, apretar guardar y no pasaba
 * nada: no habia nada que avisara.
 */

const TODOS_LOS_MODULOS = [
  "announcements",
  "checklists",
  "documents",
  "vendors",
  "ai_assistant",
  "maintenance",
  "employees",
];

function permisos(cambios: Record<string, Partial<Record<"view" | "create" | "edit" | "delete", boolean>>> = {}) {
  const base = parseDelegatedPermissionsFromFormData(new FormData());
  for (const [modulo, flags] of Object.entries(cambios)) {
    Object.assign(base[modulo as keyof typeof base], flags);
  }
  return base;
}

beforeEach(() => {
  upsertRecibido.filas = [];
  upsertRecibido.onConflict = "";
  errorDelUpsert.actual = null;
  createSupabaseAdminClient.mockClear();
});

describe("syncDelegatedEmployeePermissions", () => {
  it("escribe una fila por cada modulo, sin saltearse ninguno", async () => {
    // El sync es la unica via por la que se crean estas filas. Si deja alguno
    // afuera, ese modulo queda sin registro y el permiso no se puede otorgar
    // nunca: paso de verdad con maintenance y employees, que quedaron sin fila
    // en todas las organizaciones.
    await syncDelegatedEmployeePermissions({
      organizationId: "org-1",
      membershipId: "mem-1",
      actorId: "admin-1",
      permissions: permisos(),
    });

    expect(upsertRecibido.filas.map((f) => f.module_code).sort()).toEqual([...TODOS_LOS_MODULOS].sort());
    expect(upsertRecibido.onConflict).toBe("organization_id,membership_id,module_code");
  });

  it("guarda exactamente lo que el admin eligio", async () => {
    await syncDelegatedEmployeePermissions({
      organizationId: "org-1",
      membershipId: "mem-1",
      actorId: "admin-1",
      permissions: permisos({ checklists: { view: true, create: true, edit: true } }),
    });

    const checklists = upsertRecibido.filas.find((f) => f.module_code === "checklists");
    expect(checklists).toMatchObject({
      organization_id: "org-1",
      membership_id: "mem-1",
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: false,
      granted_by: "admin-1",
    });
  });

  it("no se come el error de la base", async () => {
    // Un fallo silencioso aca es lo peor: el admin cree que guardo.
    errorDelUpsert.actual = { message: "permission denied" };

    const resultado = await syncDelegatedEmployeePermissions({
      organizationId: "org-1",
      membershipId: "mem-1",
      actorId: "admin-1",
      permissions: permisos(),
    });

    expect(resultado.error).toContain("permission denied");
  });
});

describe("parseDelegatedPermissionsFromFormData", () => {
  it("lee lo que mando el formulario", () => {
    const formData = new FormData();
    formData.set(
      "delegated_permissions_json",
      JSON.stringify({ checklists: { view: true, create: true, edit: false, delete: false } }),
    );

    expect(parseDelegatedPermissionsFromFormData(formData).checklists).toEqual({
      view: true,
      create: true,
      edit: false,
      delete: false,
    });
  });

  it("sin datos deja el acceso de lectura por defecto de los modulos del portal", () => {
    const base = parseDelegatedPermissionsFromFormData(new FormData());

    expect(base.checklists.view).toBe(true);
    expect(base.announcements.view).toBe(true);
    expect(base.documents.view).toBe(true);
    expect(base.checklists.create).toBe(false);
    expect(base.vendors.view).toBe(false);
  });

  it("un json roto no rompe el guardado", () => {
    const formData = new FormData();
    formData.set("delegated_permissions_json", "{esto no es json");

    expect(parseDelegatedPermissionsFromFormData(formData).checklists.view).toBe(true);
  });
});

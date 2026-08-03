import { beforeEach, describe, expect, it, vi } from "vitest";

type Payload = { title: string; body: string; url: string };
type Opciones = { source: string; organizationId: string };

const sendPushToUsers = vi.hoisted(() =>
  vi.fn<(usuarios: string[], payload: Payload, opciones: Opciones) => Promise<{ sent: number; expired: number; failed: number }>>(
    async (usuarios) => ({ sent: usuarios.length, expired: 0, failed: 0 }),
  ),
);

vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers }));

// resolveUserLocale pasa por unstable_cache de Next, que no existe fuera del
// servidor. El idioma en si se prueba en shared/lib/__tests__/notifications.i18n.
const resolveUserLocale = vi.hoisted(() => vi.fn<() => Promise<"es" | "en">>(async () => "es"));
vi.mock("@/shared/lib/locale", () => ({ resolveUserLocale }));

const { notifyVendorEvent, sucursalesDelProveedor } = await import("../notifications");

/**
 * A quien le llega el aviso de un proveedor.
 *
 * Los admins alcanzan toda la empresa, asi que entran siempre. Los empleados
 * solo si el proveedor es de una de sus locaciones: un proveedor de otro local
 * ni siquiera lo pueden ver en la app (resolveEmployeeVendorScope), asi que
 * avisarles los mandaba a una pantalla donde no estaba.
 */

type Persona = { userId: string; locaciones?: string[]; todas?: boolean };
type Fila = Record<string, unknown>;

function supabaseFalso(opciones: {
  admins?: string[];
  operativos?: Persona[];
  /** Sucursales activas de la organizacion. */
  sucursales?: string[];
  /** Locaciones asignadas a un proveedor, para sucursalesDelProveedor. */
  locacionesDelProveedor?: Array<string | null>;
  errorLocaciones?: string;
} = {}) {
  const admins = opciones.admins ?? [];
  const operativos = opciones.operativos ?? [];
  const sucursales = opciones.sucursales ?? ["loc-a", "loc-b", "loc-c"];
  const membresiaDe = new Map(operativos.map((p, i) => [`mem-${i}`, p]));

  return {
    from: (tabla: string) => {
      const filtros: Record<string, unknown> = {};
      let filas: Fila[] = [];

      const cadena = {
        select: () => cadena,
        eq: (columna: string, valor: unknown) => {
          filtros[columna] = valor;
          if (tabla === "memberships" && columna === "role_id" && valor === "rol-admin") {
            filas = admins.map((id) => ({ user_id: id }));
          }
          return cadena;
        },
        in: (_columna: string, valores: string[]) => {
          if (tabla === "memberships") {
            filas = valores
              .map((mem) => membresiaDe.get(mem))
              .filter((p): p is Persona => Boolean(p))
              .map((p) => ({
                user_id: p.userId,
                branch_id: null,
                all_locations: p.todas ?? false,
                location_scope_ids: p.locaciones ?? [],
              }));
          }
          if (tabla === "employees") {
            // El legajo no aporta nada extra en estas pruebas.
            filas = [];
          }
          return cadena;
        },
        maybeSingle: async () => ({ data: tabla === "roles" ? { id: "rol-admin" } : null, error: null }),
        get data() {
          if (tabla === "employee_module_permissions") {
            // El mock honra el filtro: si se pide otra capacidad que no sea
            // can_edit, no devuelve a nadie. Sin esto el test pasaria aunque
            // el servicio consultara el permiso equivocado.
            const pideOperar = filtros.can_edit === true && filtros.module_code === "vendors";
            return pideOperar ? [...membresiaDe.keys()].map((mem) => ({ membership_id: mem })) : [];
          }
          if (tabla === "branches") return sucursales.map((id) => ({ id }));
          if (tabla === "vendor_locations") {
            return (opciones.locacionesDelProveedor ?? []).map((branch_id) => ({ branch_id }));
          }
          return filas;
        },
        get error() {
          return tabla === "vendor_locations" && opciones.errorLocaciones
            ? { message: opciones.errorLocaciones }
            : null;
        },
      };

      return cadena;
    },
  } as never;
}

/** Los userIds a los que se les mando algo, sin importar en cuantas tandas. */
function avisados() {
  return sendPushToUsers.mock.calls.flatMap((c) => c[0]);
}

beforeEach(() => {
  sendPushToUsers.mockClear();
  resolveUserLocale.mockResolvedValue("es");
});

describe("el idioma del aviso", () => {
  it("sale en español para una empresa que lee español", async () => {
    await notifyVendorEvent({
      supabase: supabaseFalso({ admins: ["admin-1"] }),
      organizationId: "org-1",
      actorId: null,
      title: "Nuevo proveedor",
      body: "Acme Supplies",
      source: "vendor_created",
      locationScope: { branchIds: [], isGlobal: true },
    });

    expect(sendPushToUsers.mock.calls[0]![1].title).toBe("Nuevo proveedor");
  });

  it("sale traducido para una empresa que lee inglés (plan de integración)", async () => {
    resolveUserLocale.mockResolvedValue("en");

    await notifyVendorEvent({
      supabase: supabaseFalso({ admins: ["admin-1"] }),
      organizationId: "org-1",
      actorId: null,
      title: "Nuevo proveedor",
      body: "Acme Supplies",
      source: "vendor_created",
      locationScope: { branchIds: [], isGlobal: true },
    });

    expect(sendPushToUsers.mock.calls[0]![1].title).toBe("New vendor added");
    // El nombre del proveedor es un dato: no se traduce.
    expect(sendPushToUsers.mock.calls[0]![1].body).toBe("Acme Supplies");
  });
});

describe("notifyVendorEvent", () => {
  it("avisa a los admins y a los empleados con permiso de editar vendors, cada uno a su propia pantalla", async () => {
    await notifyVendorEvent({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: [{ userId: "encargado", todas: true }] }),
      organizationId: "org-1",
      actorId: null,
      title: "New vendor added",
      body: "Acme Supplies",
      source: "vendor_created",
      locationScope: { branchIds: [], isGlobal: true },
    });

    expect(sendPushToUsers).toHaveBeenCalledWith(
      ["admin-1"],
      expect.objectContaining({ title: "New vendor added", url: "/app/vendors" }),
      expect.objectContaining({ source: "vendor_created" }),
    );
    expect(sendPushToUsers).toHaveBeenCalledWith(
      ["encargado"],
      expect.objectContaining({ url: "/portal/vendors" }),
      expect.objectContaining({ source: "vendor_created" }),
    );
  });

  it("no le avisa a quien hizo la accion", async () => {
    await notifyVendorEvent({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: [{ userId: "encargado", todas: true }] }),
      organizationId: "org-1",
      actorId: "admin-1",
      title: "Vendor updated",
      body: "Acme Supplies",
      source: "vendor_updated",
      locationScope: { branchIds: [], isGlobal: true },
    });

    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    expect(sendPushToUsers).toHaveBeenCalledWith(["encargado"], expect.anything(), expect.anything());
  });

  it("sin nadie que gestione vendors, no manda nada", async () => {
    await notifyVendorEvent({
      supabase: supabaseFalso({}),
      organizationId: "org-1",
      actorId: null,
      title: "Vendor deleted",
      body: "Acme Supplies",
      source: "vendor_deleted",
      locationScope: { branchIds: [], isGlobal: true },
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});

describe("el alcance por sucursal", () => {
  it("no le avisa al empleado de un local donde ese proveedor no esta", async () => {
    await notifyVendorEvent({
      supabase: supabaseFalso({
        operativos: [
          { userId: "de-la-a", locaciones: ["loc-a"] },
          { userId: "de-la-b", locaciones: ["loc-b"] },
        ],
      }),
      organizationId: "org-1",
      actorId: null,
      title: "Vendor updated",
      body: "Acme Supplies",
      source: "vendor_updated",
      locationScope: { branchIds: ["loc-a"], isGlobal: false },
    });

    expect(avisados()).toEqual(["de-la-a"]);
  });

  it("un proveedor global (sin locaciones) le llega a todos los que gestionan", async () => {
    await notifyVendorEvent({
      supabase: supabaseFalso({
        operativos: [
          { userId: "de-la-a", locaciones: ["loc-a"] },
          { userId: "de-la-b", locaciones: ["loc-b"] },
        ],
      }),
      organizationId: "org-1",
      actorId: null,
      title: "New vendor added",
      body: "Acme Supplies",
      source: "vendor_created",
      locationScope: { branchIds: [], isGlobal: true },
    });

    expect(avisados().sort()).toEqual(["de-la-a", "de-la-b"]);
  });

  it("quien alcanza todas las locaciones entra aunque el proveedor sea de una sola", async () => {
    await notifyVendorEvent({
      supabase: supabaseFalso({
        operativos: [
          { userId: "regional", todas: true },
          { userId: "de-la-b", locaciones: ["loc-b"] },
        ],
      }),
      organizationId: "org-1",
      actorId: null,
      title: "Vendor updated",
      body: "Acme Supplies",
      source: "vendor_updated",
      locationScope: { branchIds: ["loc-a"], isGlobal: false },
    });

    expect(avisados()).toEqual(["regional"]);
  });

  it("los admins entran siempre: alcanzan toda la empresa", async () => {
    await notifyVendorEvent({
      supabase: supabaseFalso({
        admins: ["admin-1"],
        operativos: [{ userId: "de-la-b", locaciones: ["loc-b"] }],
      }),
      organizationId: "org-1",
      actorId: null,
      title: "Vendor updated",
      body: "Acme Supplies",
      source: "vendor_updated",
      locationScope: { branchIds: ["loc-a"], isGlobal: false },
    });

    expect(avisados()).toEqual(["admin-1"]);
  });
});

describe("sucursalesDelProveedor", () => {
  it("devuelve las locaciones asignadas", async () => {
    const filas = await sucursalesDelProveedor(
      supabaseFalso({ locacionesDelProveedor: ["loc-a", "loc-b"] }),
      "org-1",
      "vendor-1",
    );

    expect(filas).toEqual({ branchIds: ["loc-a", "loc-b"], isGlobal: false });
  });

  it("devuelve alcance global explícito para una fila con branch_id null", async () => {
    const filas = await sucursalesDelProveedor(
      supabaseFalso({ locacionesDelProveedor: [null] }),
      "org-1",
      "vendor-1",
    );

    expect(filas).toEqual({ branchIds: [], isGlobal: true });
  });

  it("falla cerrado si no hay una fila de alcance", async () => {
    await expect(
      sucursalesDelProveedor(supabaseFalso(), "org-1", "vendor-1"),
    ).rejects.toThrow("alcance de locaciones inválido");
  });

  it("falla cerrado si la consulta de locaciones falla", async () => {
    await expect(
      sucursalesDelProveedor(
        supabaseFalso({ errorLocaciones: "database unavailable" }),
        "org-1",
        "vendor-1",
      ),
    ).rejects.toThrow("No se pudo resolver el alcance del proveedor");
  });
});

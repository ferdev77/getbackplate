import { beforeEach, describe, expect, it, vi } from "vitest";

type Payload = { title: string; body: string; url: string };
type Opciones = { source: string; organizationId: string };

const sendPushToUsers = vi.hoisted(() =>
  vi.fn<(usuarios: string[], payload: Payload, opciones: Opciones) => Promise<{ sent: number; expired: number; failed: number }>>(
    async (usuarios) => ({ sent: usuarios.length, expired: 0, failed: 0 }),
  ),
);

vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers }));

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
        error: null,
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
      branchIds: [],
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
      branchIds: [],
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
      branchIds: [],
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
      branchIds: ["loc-a"],
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
      branchIds: [],
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
      branchIds: ["loc-a"],
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
      branchIds: ["loc-a"],
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

    expect(filas).toEqual(["loc-a", "loc-b"]);
  });

  it("un proveedor global se guarda con branch_id null: devuelve vacio, que es como se representa", async () => {
    const filas = await sucursalesDelProveedor(
      supabaseFalso({ locacionesDelProveedor: [null] }),
      "org-1",
      "vendor-1",
    );

    expect(filas).toEqual([]);
  });
});

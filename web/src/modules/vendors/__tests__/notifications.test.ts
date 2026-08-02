import { beforeEach, describe, expect, it, vi } from "vitest";

type Payload = { title: string; body: string; url: string };
type Opciones = { source: string; organizationId: string };

const sendPushToUsers = vi.hoisted(() =>
  vi.fn<(usuarios: string[], payload: Payload, opciones: Opciones) => Promise<{ sent: number; expired: number; failed: number }>>(
    async (usuarios) => ({ sent: usuarios.length, expired: 0, failed: 0 }),
  ),
);

vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers }));

const { notifyVendorEvent } = await import("../notifications");

type Fila = Record<string, unknown>;

function supabaseFalso(opciones: { admins?: string[]; operativos?: string[] } = {}) {
  const admins = opciones.admins ?? [];
  const operativos = opciones.operativos ?? [];
  const membresiaDe = new Map(operativos.map((id, i) => [`mem-${i}`, id]));

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
          filas = valores
            .map((mem) => membresiaDe.get(mem))
            .filter((id): id is string => Boolean(id))
            .map((id) => ({ user_id: id }));
          return cadena;
        },
        maybeSingle: async () => ({ data: tabla === "roles" ? { id: "rol-admin" } : null, error: null }),
        get data() {
          if (tabla === "employee_module_permissions") {
            const pideOperar = filtros.can_edit === true && filtros.module_code === "vendors";
            return pideOperar ? [...membresiaDe.keys()].map((mem) => ({ membership_id: mem })) : [];
          }
          return filas;
        },
        error: null,
      };

      return cadena;
    },
  } as never;
}

beforeEach(() => {
  sendPushToUsers.mockClear();
});

describe("notifyVendorEvent", () => {
  it("avisa a los admins y a los empleados con permiso de editar vendors, cada uno a su propia pantalla", async () => {
    await notifyVendorEvent({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: ["encargado"] }),
      organizationId: "org-1",
      actorId: null,
      title: "New vendor added",
      body: "Acme Supplies",
      source: "vendor_created",
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
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: ["encargado"] }),
      organizationId: "org-1",
      actorId: "admin-1",
      title: "Vendor updated",
      body: "Acme Supplies",
      source: "vendor_updated",
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
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});

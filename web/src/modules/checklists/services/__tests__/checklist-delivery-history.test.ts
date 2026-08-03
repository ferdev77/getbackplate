import { describe, expect, it, vi, beforeEach } from "vitest";

type Fila = { user_id: string | null; created_at: string; metadata: unknown };

const filasDeNotifications = vi.hoisted(() => ({ actual: [] as Fila[] }));
const filtrosUsados = vi.hoisted(() => ({ actual: {} as Record<string, unknown> }));

const createSupabaseAdminClient = vi.hoisted(() =>
  vi.fn(() => {
    const cadena = {
      select: () => cadena,
      eq: (columna: string, valor: unknown) => {
        filtrosUsados.actual[columna] = valor;
        return cadena;
      },
      in: () => cadena,
      order: () => cadena,
      limit: async () => ({ data: filasDeNotifications.actual, error: null }),
      // employees / organization_user_profiles resuelven nombres: se responde
      // vacio salvo que el caso lo necesite.
      then: undefined,
      data: [] as unknown[],
      error: null,
    };
    return { from: () => cadena };
  }),
);

vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient }));

const { obtenerHistorialDeRepartos, puedeVerHistorialDeRepartos } = await import(
  "../checklist-delivery-history.service"
);

/**
 * El historial dice a quienes se le repartio un checklist. Es informacion del
 * creador: el modal de vista previa del portal se abre para cualquier checklist
 * *asignado*, asi que sin el filtro un empleado veria los nombres de todos sus
 * companeros.
 */

beforeEach(() => {
  filasDeNotifications.actual = [];
  filtrosUsados.actual = {};
});

describe("puedeVerHistorialDeRepartos", () => {
  it("el admin de empresa ve cualquier checklist", () => {
    expect(
      puedeVerHistorialDeRepartos({ userId: "admin-1", esCompanyAdmin: true }, "otra-persona"),
    ).toBe(true);
  });

  it("el empleado ve solo los que creo el", () => {
    expect(
      puedeVerHistorialDeRepartos({ userId: "emp-1", esCompanyAdmin: false }, "emp-1"),
    ).toBe(true);
    expect(
      puedeVerHistorialDeRepartos({ userId: "emp-1", esCompanyAdmin: false }, "emp-2"),
    ).toBe(false);
  });

  it("sin creador conocido, un empleado no ve nada", () => {
    // Un checklist sin created_by no es de nadie: no habilita a cualquiera.
    expect(puedeVerHistorialDeRepartos({ userId: "emp-1", esCompanyAdmin: false }, null)).toBe(false);
    expect(puedeVerHistorialDeRepartos({ userId: null, esCompanyAdmin: false }, "emp-1")).toBe(false);
  });
});

describe("obtenerHistorialDeRepartos", () => {
  const base = {
    organizationId: "org-1",
    templateId: "tpl-1",
    templateCreatedBy: "emp-1",
  };

  it("no consulta nada si quien mira no tiene permiso", async () => {
    filasDeNotifications.actual = [
      { user_id: "u1", created_at: "2026-08-03T09:00:00.000Z", metadata: { origen: "recurrencia" } },
    ];

    const resultado = await obtenerHistorialDeRepartos({
      ...base,
      visor: { userId: "otro", esCompanyAdmin: false },
    });

    expect(resultado).toEqual([]);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("agrupa por reparto y cuenta destinatarios sin repetir", async () => {
    filasDeNotifications.actual = [
      { user_id: "u1", created_at: "2026-08-03T09:00:01.000Z", metadata: { origen: "recurrencia" } },
      { user_id: "u2", created_at: "2026-08-03T09:00:03.000Z", metadata: { origen: "recurrencia" } },
      { user_id: "u2", created_at: "2026-08-03T09:00:04.000Z", metadata: { origen: "recurrencia" } },
      { user_id: "u1", created_at: "2026-08-02T09:00:00.000Z", metadata: { origen: "alta" } },
    ];

    const resultado = await obtenerHistorialDeRepartos({
      ...base,
      visor: { userId: "emp-1", esCompanyAdmin: false },
    });

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({ origen: "recurrencia", cantidad: 2 });
    expect(resultado[1]).toMatchObject({ origen: "alta", cantidad: 1 });
  });

  it("lee la campanita y no el push", async () => {
    // El push solo existe para quien tiene el dispositivo suscripto: contarlo
    // daria menos gente de la realmente alcanzada.
    await obtenerHistorialDeRepartos({ ...base, visor: { userId: "emp-1", esCompanyAdmin: false } });

    expect(filtrosUsados.actual.channel).toBe("in_app");
    expect(filtrosUsados.actual.source).toBe("checklist");
    expect(filtrosUsados.actual.source_id).toBe("tpl-1");
    expect(filtrosUsados.actual.organization_id).toBe("org-1");
  });

  it("marca como desconocido lo que no tiene origen guardado", async () => {
    // Los repartos anteriores al cambio no traen metadata.
    filasDeNotifications.actual = [
      { user_id: "u1", created_at: "2026-08-03T09:00:00.000Z", metadata: {} },
    ];

    const resultado = await obtenerHistorialDeRepartos({
      ...base,
      visor: { userId: "emp-1", esCompanyAdmin: true },
    });

    expect(resultado[0]?.origen).toBe("desconocido");
  });
});

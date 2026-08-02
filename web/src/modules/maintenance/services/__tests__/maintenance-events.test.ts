import { describe, expect, it, vi, beforeEach } from "vitest";

type Payload = { title: string; body: string; url: string };
type Opciones = { source: string; organizationId: string };

const sendPushToUsers = vi.hoisted(() =>
  vi.fn<(usuarios: string[], payload: Payload, opciones: Opciones) => Promise<{ sent: number; expired: number; failed: number }>>(
    async (usuarios) => ({ sent: usuarios.length, expired: 0, failed: 0 }),
  ),
);

vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers }));

const sendEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("@/shared/lib/brevo", () => ({ sendEmail }));

const getAuthEmailByUserId = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/auth-users", () => ({ getAuthEmailByUserId }));

const {
  notifyMaintenanceRequested,
  notifyMaintenanceStatusChanged,
  notifyMaintenanceUpdate,
  notifyMaintenanceResponseByEmail,
} = await import("../maintenance-events.service");

/**
 * A quien le llega cada aviso de mantenimiento, y que dice.
 *
 * Tres reglas, cada una por un problema real:
 *
 * 1. Se avisa a los admins y a los empleados con permiso de operar (can_edit),
 *    que son quienes lo van a atender. Los avances y cambios de estado van
 *    ademas a quien reporto.
 *
 * 2. Solo a quien tenga esa locacion. Antes no se miraba la locacion en ningun
 *    momento: una encargada de un solo local recibia los avisos de los siete, y
 *    ninguna de las solicitudes que le llegaron era de su local.
 *
 * 3. La sucursal se aclara solo a quien maneja mas de una. A quien tiene un
 *    solo local, nombrarselo no le agrega nada.
 */

type Persona = { userId: string; locaciones?: string[]; todas?: boolean };

/**
 * Mock de supabase con lo que consulta el resolvedor: el rol company_admin, las
 * membresias con su alcance, los permisos por modulo y las sucursales activas.
 */
function supabaseFalso(opciones: {
  admins?: string[];
  operativos?: Persona[];
  /** Sucursales activas de la organizacion. */
  sucursales?: string[];
  /** Un user_id que ya no tiene membresia (ej: superadmin que impersono). */
  noMiembro?: string;
} = {}) {
  const admins = opciones.admins ?? [];
  const operativos = opciones.operativos ?? [];
  const sucursales = opciones.sucursales ?? ["loc-a", "loc-b", "loc-c"];
  const membresiaDe = new Map(operativos.map((p, i) => [`mem-${i}`, p]));

  return {
    from: (tabla: string) => {
      const filtros: Record<string, unknown> = {};
      let filas: Array<Record<string, unknown>> = [];

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
        limit: () => cadena,
        maybeSingle: async () => {
          if (tabla === "roles") return { data: { id: "rol-admin" }, error: null };
          // isActiveMember: quien no es miembro no aparece.
          if (tabla === "memberships") {
            const usuario = filtros.user_id as string | undefined;
            return { data: usuario && usuario !== opciones.noMiembro ? { id: "mem-x" } : null, error: null };
          }
          return { data: null, error: null };
        },
        get data() {
          if (tabla === "employee_module_permissions") {
            // El mock honra el filtro: si se pide otra capacidad que no sea
            // can_edit, no devuelve a nadie. Sin esto el test pasaria aunque el
            // servicio consultara el permiso equivocado.
            const pideOperar = filtros.can_edit === true && filtros.module_code === "maintenance";
            return pideOperar ? [...membresiaDe.keys()].map((mem) => ({ membership_id: mem })) : [];
          }
          if (tabla === "branches") return sucursales.map((id) => ({ id }));
          return filas;
        },
        error: null,
      };

      return cadena;
    },
  } as never;
}

/** Todos los avisados, juntando las dos tandas del ultimo envio. */
function avisados() {
  return [...new Set(sendPushToUsers.mock.calls.flatMap((c) => c[0]))].sort();
}

/** El cuerpo que le llego a una persona puntual. */
function cuerpoPara(userId: string) {
  const llamada = sendPushToUsers.mock.calls.find((c) => c[0].includes(userId));
  return llamada?.[1].body;
}

beforeEach(() => {
  sendPushToUsers.mockClear();
  sendEmail.mockClear();
  sendEmail.mockResolvedValue({ ok: true });
  getAuthEmailByUserId.mockReset();
});

describe("a quien le llega", () => {
  it("a los admins y a los empleados que pueden operar mantenimiento", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({
        admins: ["admin-1"],
        operativos: [{ userId: "encargado", todas: true }],
      }),
      organizationId: "org-1",
      title: "Se rompió la heladera",
      priority: "high",
      branchId: "loc-a",
      locationName: "Long Beach",
      createdByUserId: "quien-reporto",
    });

    expect(avisados()).toEqual(["admin-1", "encargado"]);
  });

  it("no le avisa a quien acaba de reportar, aunque sea admin", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: [] }),
      organizationId: "org-1",
      title: "Se rompió la heladera",
      priority: null,
      branchId: "loc-a",
      locationName: null,
      createdByUserId: "admin-1",
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});

describe("solo a quien tiene esa locación", () => {
  const gente = [
    { userId: "de-long-beach", locaciones: ["loc-a"] },
    { userId: "de-wiggins", locaciones: ["loc-b"] },
    { userId: "de-varias", locaciones: ["loc-a", "loc-c"] },
    { userId: "de-todas", todas: true },
  ];

  it("no le llega a quien no trabaja en esa locación", async () => {
    // El caso real: una encargada de un solo local recibia los avisos de los
    // siete, y ninguno era del suyo.
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: [], operativos: gente }),
      organizationId: "org-1",
      title: "Heladera",
      priority: null,
      branchId: "loc-a",
      locationName: "Long Beach",
      createdByUserId: "otro",
    });

    expect(avisados()).toEqual(["de-long-beach", "de-todas", "de-varias"]);
    expect(avisados()).not.toContain("de-wiggins");
  });

  it("el admin recibe de cualquier locación", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: [] }),
      organizationId: "org-1",
      title: "Heladera",
      priority: null,
      branchId: "loc-z",
      locationName: "Otra",
      createdByUserId: "otro",
    });

    expect(avisados()).toEqual(["admin-1"]);
  });

  it("sin locación en la solicitud le llega a todos los que atienden", async () => {
    // Preferible avisar de mas que no avisarle a nadie.
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: [], operativos: gente }),
      organizationId: "org-1",
      title: "Heladera",
      priority: null,
      branchId: null,
      locationName: null,
      createdByUserId: "otro",
    });

    expect(avisados()).toEqual(["de-long-beach", "de-todas", "de-varias", "de-wiggins"]);
  });

  it("a quien reportó le llega aunque la locación no sea suya", async () => {
    // Es su solicitud: la hizo el mismo, espera la respuesta.
    await notifyMaintenanceStatusChanged({
      supabase: supabaseFalso({ admins: [], operativos: gente }),
      organizationId: "org-1",
      title: "Heladera",
      toStatus: "resolved",
      branchId: "loc-a",
      locationName: "Long Beach",
      requestedByUserId: "de-wiggins",
      actorUserId: "otro",
    });

    expect(avisados()).toContain("de-wiggins");
  });
});

describe("la sucursal se aclara solo a quien maneja varias", () => {
  it("a quien tiene un solo local no se la nombra", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({
        admins: [],
        operativos: [
          { userId: "de-un-local", locaciones: ["loc-a"] },
          { userId: "de-varios", locaciones: ["loc-a", "loc-b"] },
        ],
      }),
      organizationId: "org-1",
      title: "Heladera",
      priority: "high",
      branchId: "loc-a",
      locationName: "Long Beach",
      createdByUserId: "otro",
    });

    expect(cuerpoPara("de-un-local")).toBe("Prioridad Alta");
    expect(cuerpoPara("de-varios")).toBe("Long Beach · Prioridad Alta");
  });

  it("al admin siempre se la nombra", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: [] }),
      organizationId: "org-1",
      title: "Heladera",
      priority: "high",
      branchId: "loc-a",
      locationName: "Long Beach",
      createdByUserId: "otro",
    });

    expect(cuerpoPara("admin-1")).toBe("Long Beach · Prioridad Alta");
  });

  it("sin nombre de locación nadie recibe un separador suelto", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: [] }),
      organizationId: "org-1",
      title: "Heladera",
      priority: "high",
      branchId: "loc-a",
      locationName: null,
      createdByUserId: "otro",
    });

    expect(cuerpoPara("admin-1")).toBe("Prioridad Alta");
  });
});

describe("el texto va en español, no con el valor crudo", () => {
  it("traduce la prioridad", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: ["admin-1"] }),
      organizationId: "org-1",
      title: "Heladera",
      priority: "high",
      branchId: null,
      locationName: null,
      createdByUserId: "otro",
    });

    // Antes decia "Prioridad high".
    expect(cuerpoPara("admin-1")).toBe("Prioridad Alta");
  });

  it("traduce el estado", async () => {
    await notifyMaintenanceStatusChanged({
      supabase: supabaseFalso({ admins: ["admin-1"] }),
      organizationId: "org-1",
      title: "Heladera",
      toStatus: "needs_parts",
      branchId: null,
      locationName: null,
      requestedByUserId: null,
      actorUserId: "otro",
    });

    // Antes decia "Pasó a needs_parts".
    expect(cuerpoPara("admin-1")).toBe("Pasó a Requiere repuesto");
  });

  it("un estado desconocido se muestra tal cual en vez de dejar un hueco", async () => {
    await notifyMaintenanceStatusChanged({
      supabase: supabaseFalso({ admins: ["admin-1"] }),
      organizationId: "org-1",
      title: "Heladera",
      toStatus: "algo_nuevo",
      branchId: null,
      locationName: null,
      requestedByUserId: null,
      actorUserId: "otro",
    });

    expect(cuerpoPara("admin-1")).toBe("Pasó a algo_nuevo");
  });
});

describe("quien reportó", () => {
  it("recibe el cambio de estado", async () => {
    await notifyMaintenanceStatusChanged({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: [{ userId: "encargado", todas: true }] }),
      organizationId: "org-1",
      title: "Heladera",
      toStatus: "resolved",
      branchId: "loc-a",
      locationName: "Long Beach",
      requestedByUserId: "quien-reporto",
      actorUserId: "encargado",
    });

    expect(avisados()).toEqual(["admin-1", "quien-reporto"]);
  });

  it("no recibe nada si ya no es miembro real (ej: superadmin que probó impersonando)", async () => {
    await notifyMaintenanceStatusChanged({
      supabase: supabaseFalso({ admins: ["admin-1"], noMiembro: "ex-superadmin" }),
      organizationId: "org-1",
      title: "Heladera",
      toStatus: "resolved",
      branchId: null,
      locationName: null,
      requestedByUserId: "ex-superadmin",
      actorUserId: "encargado",
    });

    expect(avisados()).toEqual(["admin-1"]);
  });
});

describe("novedades", () => {
  it("avisa la visita programada con su fecha", async () => {
    await notifyMaintenanceUpdate({
      supabase: supabaseFalso({ admins: ["admin-1"] }),
      organizationId: "org-1",
      title: "Heladera",
      message: null,
      scheduledVisitAt: "2026-08-15T10:00:00.000Z",
      branchId: null,
      locationName: null,
      requestedByUserId: null,
      actorUserId: "encargado",
    });

    expect(cuerpoPara("admin-1")).toContain("Visita programada");
    expect(sendPushToUsers.mock.calls.at(-1)?.[2]).toMatchObject({ source: "maintenance_visit_scheduled" });
  });

  it("usa el mensaje cuando es un comentario", async () => {
    await notifyMaintenanceUpdate({
      supabase: supabaseFalso({ admins: ["admin-1"] }),
      organizationId: "org-1",
      title: "Heladera",
      message: "Ya vino el técnico",
      scheduledVisitAt: null,
      branchId: null,
      locationName: null,
      requestedByUserId: null,
      actorUserId: "encargado",
    });

    expect(cuerpoPara("admin-1")).toBe("Ya vino el técnico");
    expect(sendPushToUsers.mock.calls.at(-1)?.[2]).toMatchObject({ source: "maintenance_update" });
  });
});

describe("no se manda nada al vacío", () => {
  it("sin destinatarios no llama al push", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: [], operativos: [] }),
      organizationId: "org-1",
      title: "Heladera",
      priority: null,
      branchId: "loc-a",
      locationName: "Long Beach",
      createdByUserId: "otro",
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("no repite a alguien que es admin y además operativo", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({
        admins: ["dos-sombreros"],
        operativos: [{ userId: "dos-sombreros", todas: true }],
      }),
      organizationId: "org-1",
      title: "Heladera",
      priority: null,
      branchId: "loc-a",
      locationName: "Long Beach",
      createdByUserId: "otro",
    });

    expect(sendPushToUsers.mock.calls.flatMap((c) => c[0])).toEqual(["dos-sombreros"]);
  });
});

describe("notifyMaintenanceResponseByEmail", () => {
  it("le manda a los admins y a cualquiera con permiso de mantenimiento, sin filtrar por locación", async () => {
    getAuthEmailByUserId.mockResolvedValue(
      new Map([
        ["admin-1", "admin@x.com"],
        ["encargado", "encargado@x.com"],
      ]),
    );

    await notifyMaintenanceResponseByEmail({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: [{ userId: "encargado", locaciones: ["loc-z"] }] }),
      organizationId: "org-1",
      branchId: "loc-a",
      title: "Heladera",
      body: "Pasó a resuelto",
      actorUserId: null,
    });

    const destinatarios = sendEmail.mock.calls.flatMap((c) => c[0].to.map((r: { email: string }) => r.email));
    expect(destinatarios).toEqual(expect.arrayContaining(["admin@x.com", "encargado@x.com"]));
  });

  it("no duplica la campanita de quien ya recibió el push (misma locación); a quien el push no alcanzó por locación le arma su propia fila", async () => {
    getAuthEmailByUserId.mockResolvedValue(
      new Map([
        ["admin-1", "admin@x.com"],
        ["local-a", "local-a@x.com"],
        ["fuera-de-alcance", "fuera@x.com"],
      ]),
    );

    await notifyMaintenanceResponseByEmail({
      supabase: supabaseFalso({
        admins: ["admin-1"],
        operativos: [
          { userId: "local-a", locaciones: ["loc-a"] },
          { userId: "fuera-de-alcance", locaciones: ["loc-b"] },
        ],
      }),
      organizationId: "org-1",
      branchId: "loc-a",
      title: "Heladera",
      body: "Pasó a resuelto",
      actorUserId: null,
    });

    expect(sendEmail).toHaveBeenCalledTimes(2);

    // admin-1 y local-a atienden loc-a: ya tienen fila por el push, se les
    // manda el email con userId:null para no duplicarla.
    const conCampanitaYa = sendEmail.mock.calls.find((c) =>
      c[0].to.some((r: { email: string }) => r.email === "admin@x.com"),
    )![0];
    expect(conCampanitaYa.to).toEqual(
      expect.arrayContaining([{ email: "admin@x.com" }, { email: "local-a@x.com" }]),
    );
    expect(conCampanitaYa.notification.userId).toBeNull();

    // fuera-de-alcance solo cubre loc-b: el push no lo alcanzó, asi que el
    // email se manda con su userId para que le arme su propia fila.
    const sinCampanitaTodavia = sendEmail.mock.calls.find((c) =>
      c[0].to.some((r: { email: string }) => r.email === "fuera@x.com"),
    )![0];
    expect(sinCampanitaTodavia.to).toEqual([{ email: "fuera@x.com" }]);
    expect(sinCampanitaTodavia.notification.userId).toBe("fuera-de-alcance");
  });

  it("no le manda a quien escribió la respuesta", async () => {
    getAuthEmailByUserId.mockResolvedValue(new Map([["encargado", "encargado@x.com"]]));

    await notifyMaintenanceResponseByEmail({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: [{ userId: "encargado", todas: true }] }),
      organizationId: "org-1",
      branchId: null,
      title: "Heladera",
      body: "Hay una novedad",
      actorUserId: "admin-1",
    });

    expect(getAuthEmailByUserId).toHaveBeenCalledWith(["encargado"]);
  });

  it("sin nadie que gestione mantenimiento, no manda nada", async () => {
    await notifyMaintenanceResponseByEmail({
      supabase: supabaseFalso({}),
      organizationId: "org-1",
      branchId: null,
      title: "Heladera",
      body: "Hay una novedad",
      actorUserId: null,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(getAuthEmailByUserId).not.toHaveBeenCalled();
  });
});

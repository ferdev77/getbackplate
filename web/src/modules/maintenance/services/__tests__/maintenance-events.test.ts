import { describe, expect, it, vi, beforeEach } from "vitest";

// La firma refleja la real: (userIds, payload, options).
type Payload = { title: string; body: string; url: string };
type Opciones = { source: string; organizationId: string };

const sendPushToUsers = vi.hoisted(() =>
  vi.fn(async (...args: [string[], Payload, Opciones]) => ({
    sent: args[0].length,
    expired: 0,
    failed: 0,
  })),
);

vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers }));

const { notifyMaintenanceRequested, notifyMaintenanceStatusChanged, notifyMaintenanceUpdate } =
  await import("../maintenance-events.service");

/**
 * A quien le llega cada aviso de mantenimiento.
 *
 * El modulo no emitia ninguno. La decision es: una solicitud nueva va a los
 * admins y a los empleados con permiso de operar mantenimiento (can_edit), que
 * son quienes la van a atender; los avances y cambios de estado van ademas a
 * quien la reporto.
 */

type Fila = Record<string, unknown>;

/**
 * Mock de supabase con lo que usa el resolvedor de destinatarios: el rol
 * company_admin, las membresias y los permisos por modulo.
 */
function supabaseFalso(opciones: { admins?: string[]; operativos?: string[]; noMiembro?: string } = {}) {
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
        limit: () => cadena,
        maybeSingle: async () => {
          if (tabla === "roles") return { data: { id: "rol-admin" }, error: null };
          // isActiveMember: consulta puntual por user_id -- "quien-reporto" es
          // miembro salvo que el test diga explicitamente lo contrario.
          if (tabla === "memberships" && filtros.user_id) {
            const esMiembro = filtros.user_id !== opciones.noMiembro;
            return { data: esMiembro ? { id: "mem-requester" } : null, error: null };
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
          return filas;
        },
        error: null,
      };

      return cadena;
    },
  } as never;
}

function avisados() {
  return (sendPushToUsers.mock.calls.at(-1)?.[0] ?? []).slice().sort();
}

beforeEach(() => {
  sendPushToUsers.mockClear();
});

describe("notifyMaintenanceRequested", () => {
  it("avisa a los admins y a los empleados que pueden operar mantenimiento", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: ["encargado"] }),
      organizationId: "org-1",
      title: "Se rompió la heladera",
      priority: "alta",
      locationName: "Sur",
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
      locationName: null,
      createdByUserId: "admin-1",
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("pone la locación y la prioridad en el cuerpo", async () => {
    await notifyMaintenanceRequested({
      supabase: supabaseFalso({ admins: ["admin-1"] }),
      organizationId: "org-1",
      title: "Se rompió la heladera",
      priority: "alta",
      locationName: "Sur",
      createdByUserId: "quien-reporto",
    });

    expect(sendPushToUsers.mock.calls.at(-1)?.[1]).toMatchObject({
      title: "Nueva solicitud de mantenimiento: Se rompió la heladera",
      body: "Sur · Prioridad alta",
    });
  });
});

describe("notifyMaintenanceStatusChanged", () => {
  it("avisa a quien reportó y a los que atienden", async () => {
    await notifyMaintenanceStatusChanged({
      supabase: supabaseFalso({ admins: ["admin-1"], operativos: ["encargado"] }),
      organizationId: "org-1",
      title: "Heladera",
      toStatus: "resuelto",
      requestedByUserId: "quien-reporto",
      actorUserId: "encargado",
    });

    expect(avisados()).toEqual(["admin-1", "quien-reporto"]);
  });

  it("no le avisa a quien reportó si ya no es miembro real de la organización (ej: superadmin que probó el módulo impersonando)", async () => {
    await notifyMaintenanceStatusChanged({
      supabase: supabaseFalso({ admins: ["admin-1"], noMiembro: "ex-superadmin" }),
      organizationId: "org-1",
      title: "Heladera",
      toStatus: "resuelto",
      requestedByUserId: "ex-superadmin",
      actorUserId: "encargado",
    });

    expect(avisados()).toEqual(["admin-1"]);
  });

  it("dice en qué estado quedó", async () => {
    await notifyMaintenanceStatusChanged({
      supabase: supabaseFalso({ admins: [] }),
      organizationId: "org-1",
      title: "Heladera",
      toStatus: "en progreso",
      requestedByUserId: "quien-reporto",
      actorUserId: "encargado",
    });

    expect(sendPushToUsers.mock.calls.at(-1)?.[1]).toMatchObject({ body: "Pasó a en progreso" });
  });
});

describe("notifyMaintenanceUpdate", () => {
  it("avisa la visita programada con su fecha", async () => {
    await notifyMaintenanceUpdate({
      supabase: supabaseFalso({ admins: [] }),
      organizationId: "org-1",
      title: "Heladera",
      message: null,
      scheduledVisitAt: "2026-08-15T10:00:00.000Z",
      requestedByUserId: "quien-reporto",
      actorUserId: "encargado",
    });

    expect(sendPushToUsers.mock.calls.at(-1)?.[1].body).toContain("Visita programada");
    expect(sendPushToUsers.mock.calls.at(-1)?.[2]).toMatchObject({ source: "maintenance_visit_scheduled" });
  });

  it("usa el mensaje cuando es un comentario", async () => {
    await notifyMaintenanceUpdate({
      supabase: supabaseFalso({ admins: [] }),
      organizationId: "org-1",
      title: "Heladera",
      message: "Ya vino el técnico",
      scheduledVisitAt: null,
      requestedByUserId: "quien-reporto",
      actorUserId: "encargado",
    });

    expect(sendPushToUsers.mock.calls.at(-1)?.[1]).toMatchObject({ body: "Ya vino el técnico" });
    expect(sendPushToUsers.mock.calls.at(-1)?.[2]).toMatchObject({ source: "maintenance_update" });
  });

  it("no deja el aviso vacío si el comentario viene en blanco", async () => {
    await notifyMaintenanceUpdate({
      supabase: supabaseFalso({ admins: [] }),
      organizationId: "org-1",
      title: "Heladera",
      message: "   ",
      scheduledVisitAt: null,
      requestedByUserId: "quien-reporto",
      actorUserId: "encargado",
    });

    expect(sendPushToUsers.mock.calls.at(-1)?.[1]).toMatchObject({ body: "Hay una novedad" });
  });
});

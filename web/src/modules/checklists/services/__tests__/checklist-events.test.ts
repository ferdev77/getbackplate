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

const { notifyChecklistSubmitted, notifyChecklistReviewed } = await import("../checklist-events.service");

/**
 * A quien le llega el aviso de cada momento del checklist.
 *
 * Ninguno de los dos avisaba nada: enviar y revisar pasaban en silencio. Estos
 * tests fijan la decision de a quien se notifica, que es lo que se puede
 * desarmar sin que nada se rompa.
 */

type Fila = Record<string, unknown>;

/** Mock de supabase con solo lo que usa el servicio: roles y memberships. */
function supabaseFalso(adminIds: string[]) {
  const tablas: Record<string, Fila[]> = {
    roles: [{ id: "rol-admin" }],
    memberships: adminIds.map((id) => ({ user_id: id })),
  };

  return {
    from: (tabla: string) => {
      const filas = tablas[tabla] ?? [];
      const cadena = {
        select: () => cadena,
        eq: () => cadena,
        maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
        then: undefined,
        data: filas,
        error: null,
      };
      return cadena;
    },
  } as never;
}

/**
 * Todos los destinatarios, juntando las llamadas.
 *
 * El aviso sale partido por rol (ver shared/lib/notification-links.ts): los
 * company_admins van al panel de empresa y el resto al portal, asi que la misma
 * notificacion puede ser dos envios.
 */
function destinatariosDeLaLlamada() {
  return sendPushToUsers.mock.calls.flatMap((llamada) => llamada[0] ?? []);
}

/** El link con el que salio cada grupo, para chequear que cada rol va al suyo. */
function urlPorDestinatario(): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const [usuarios, payload] of sendPushToUsers.mock.calls) {
    for (const usuario of usuarios ?? []) mapa[usuario] = payload.url;
  }
  return mapa;
}

beforeEach(() => {
  sendPushToUsers.mockClear();
});

describe("notifyChecklistSubmitted", () => {
  it("avisa al creador del checklist y a los company admins", async () => {
    await notifyChecklistSubmitted({
      supabase: supabaseFalso(["admin-1", "admin-2"]),
      organizationId: "org-1",
      templateId: "tpl-1",
      templateName: "Apertura",
      templateCreatedBy: "creador",
      submittedByUserId: "quien-envio",
      itemsCount: 5,
      flaggedCount: 0,
    });

    expect(destinatariosDeLaLlamada().sort()).toEqual(["admin-1", "admin-2", "creador"]);
  });

  it("manda a cada rol a su propia pantalla de reportes", async () => {
    // El creador de la plantilla puede ser un empleado del portal. Antes todos
    // recibian /app/reports y el empleado caia en el panel de administracion.
    //
    // El destino es la pantalla de reportes de cada uno, no la lista de
    // checklists: a quien recibe este aviso no le toca completar nada, le
    // avisan que ya se lo completaron.
    await notifyChecklistSubmitted({
      supabase: supabaseFalso(["admin-1"]),
      organizationId: "org-1",
      templateId: "tpl-1",
      templateName: "Apertura",
      templateCreatedBy: "empleado-creador",
      submittedByUserId: "quien-envio",
      itemsCount: 5,
      flaggedCount: 0,
    });

    expect(urlPorDestinatario()).toEqual({
      "admin-1": "/app/reports",
      "empleado-creador": "/portal/checklist/reports",
    });
  });

  it("no le avisa a quien acaba de enviarlo, aunque sea el creador", async () => {
    await notifyChecklistSubmitted({
      supabase: supabaseFalso([]),
      organizationId: "org-1",
      templateId: "tpl-1",
      templateName: "Apertura",
      templateCreatedBy: "misma-persona",
      submittedByUserId: "misma-persona",
      itemsCount: 5,
      flaggedCount: 0,
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("no repite a quien es creador y admin a la vez", async () => {
    await notifyChecklistSubmitted({
      supabase: supabaseFalso(["creador", "admin-2"]),
      organizationId: "org-1",
      templateId: "tpl-1",
      templateName: "Apertura",
      templateCreatedBy: "creador",
      submittedByUserId: "quien-envio",
      itemsCount: 5,
      flaggedCount: 0,
    });

    expect(destinatariosDeLaLlamada().sort()).toEqual(["admin-2", "creador"]);
  });

  it("dice cuantos items quedaron para atención", async () => {
    await notifyChecklistSubmitted({
      supabase: supabaseFalso(["admin-1"]),
      organizationId: "org-1",
      templateId: "tpl-1",
      templateName: "Apertura",
      templateCreatedBy: null,
      submittedByUserId: "quien-envio",
      itemsCount: 5,
      flaggedCount: 2,
    });

    expect(sendPushToUsers.mock.calls.at(-1)?.[1]).toMatchObject({
      title: "Checklist completado: Apertura",
      body: "5 ítems · 2 para atención",
    });
  });

  it("avisa sin novedades cuando no hay nada marcado", async () => {
    await notifyChecklistSubmitted({
      supabase: supabaseFalso(["admin-1"]),
      organizationId: "org-1",
      templateId: "tpl-1",
      templateName: "Apertura",
      templateCreatedBy: null,
      submittedByUserId: "quien-envio",
      itemsCount: 3,
      flaggedCount: 0,
    });

    expect(sendPushToUsers.mock.calls.at(-1)?.[1]).toMatchObject({ body: "3 ítems · sin novedades" });
  });
});

describe("notifyChecklistReviewed", () => {
  it("avisa a quien lo envió y a quien creó el checklist", async () => {
    await notifyChecklistReviewed({
      supabase: supabaseFalso([]),
      organizationId: "org-1",
      templateName: "Apertura",
      templateCreatedBy: "creador",
      submittedByUserId: "quien-envio",
      reviewedByUserId: "quien-revisa",
    });

    expect(destinatariosDeLaLlamada().sort()).toEqual(["creador", "quien-envio"]);
  });

  it("no le avisa a quien acaba de revisarlo", async () => {
    // El caso normal: el creador revisa el reporte de otro.
    await notifyChecklistReviewed({
      supabase: supabaseFalso([]),
      organizationId: "org-1",
      templateName: "Apertura",
      templateCreatedBy: "creador",
      submittedByUserId: "quien-envio",
      reviewedByUserId: "creador",
    });

    expect(destinatariosDeLaLlamada()).toEqual(["quien-envio"]);
  });

  it("no avisa si el unico destinatario es quien reviso", async () => {
    await notifyChecklistReviewed({
      supabase: supabaseFalso([]),
      organizationId: "org-1",
      templateName: "Apertura",
      templateCreatedBy: "misma-persona",
      submittedByUserId: "misma-persona",
      reviewedByUserId: "misma-persona",
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("tolera un reporte sin plantilla, que pudo haber sido eliminada", async () => {
    await notifyChecklistReviewed({
      supabase: supabaseFalso([]),
      organizationId: "org-1",
      templateName: "Checklist",
      templateCreatedBy: null,
      submittedByUserId: "quien-envio",
      reviewedByUserId: "quien-revisa",
    });

    expect(destinatariosDeLaLlamada()).toEqual(["quien-envio"]);
  });
});

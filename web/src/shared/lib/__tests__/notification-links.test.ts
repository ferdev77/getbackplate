import { describe, expect, it, vi, beforeEach } from "vitest";

type Payload = { title: string; body: string; url: string };
type Opciones = { source: string; organizationId: string };

const sendPushToUsers = vi.hoisted(() =>
  vi.fn(async (...args: [string[], Payload, Opciones]) => ({
    sent: args[0]?.length ?? 0,
    expired: 0,
    failed: 0,
  })),
);

vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers }));

const { sendPushPorRol } = await import("../notification-links");

/**
 * El panel de empresa y el portal del empleado son dos aplicaciones distintas:
 * una notificacion a audiencia mixta no puede llevar un solo link. Estos tests
 * fijan esa decision, que es la que se puede desarmar sin que nada falle.
 */

type Fila = Record<string, unknown>;

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
        in: () => cadena,
        maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
        data: filas,
        error: null,
      };
      return cadena;
    },
  } as never;
}

function llamar(userIds: string[], adminIds: string[]) {
  return sendPushPorRol({
    supabase: supabaseFalso(adminIds),
    organizationId: "org-1",
    userIds,
    payload: { title: "Titulo", body: "Cuerpo" },
    adminUrl: "/app/documents",
    employeeUrl: "/portal/documents",
    options: { source: "test", organizationId: "org-1" },
  });
}

/** Con que link salio cada persona. */
function urlPorDestinatario(): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const [usuarios, payload] of sendPushToUsers.mock.calls) {
    for (const usuario of usuarios ?? []) mapa[usuario] = payload.url;
  }
  return mapa;
}

beforeEach(() => sendPushToUsers.mockClear());

describe("sendPushPorRol", () => {
  it("parte el envio: cada rol recibe el link de su propia app", async () => {
    await llamar(["admin-1", "empleado-1", "empleado-2"], ["admin-1"]);

    expect(sendPushToUsers).toHaveBeenCalledTimes(2);
    expect(urlPorDestinatario()).toEqual({
      "admin-1": "/app/documents",
      "empleado-1": "/portal/documents",
      "empleado-2": "/portal/documents",
    });
  });

  it("con una sola audiencia manda un solo push", async () => {
    await llamar(["empleado-1", "empleado-2"], []);

    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    expect(sendPushToUsers.mock.calls[0]![1].url).toBe("/portal/documents");
  });

  it("si son todos admins nadie recibe el link del portal", async () => {
    await llamar(["admin-1", "admin-2"], ["admin-1", "admin-2"]);

    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    expect(sendPushToUsers.mock.calls[0]![1].url).toBe("/app/documents");
  });

  it("no repite destinatarios ni llama de gusto sin audiencia", async () => {
    await llamar(["empleado-1", "empleado-1"], []);
    expect(sendPushToUsers.mock.calls[0]![0]).toEqual(["empleado-1"]);

    sendPushToUsers.mockClear();
    await llamar([], ["admin-1"]);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("devuelve el total enviado sumando las dos audiencias", async () => {
    const enviados = await llamar(["admin-1", "empleado-1", "empleado-2"], ["admin-1"]);
    expect(enviados).toBe(3);
  });
});

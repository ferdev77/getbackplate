import { describe, expect, it, vi, beforeEach } from "vitest";

const sendPushToUsers = vi.hoisted(() =>
  vi.fn(async (usuarios: string[]) => ({ sent: usuarios.length, expired: 0, failed: 0 })),
);
const sendPushToOrg = vi.hoisted(() => vi.fn(async () => ({ sent: 1, expired: 0, failed: 0 })));
vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers, sendPushToOrg }));

type PayloadEmail = { to: string; notification: { userId?: string | null } };

const sendTransactionalEmail = vi.hoisted(() =>
  vi.fn<(payload: { to: string; notification: { userId?: string | null } }) => Promise<{ ok: boolean }>>(
    async () => ({ ok: true }),
  ),
);
vi.mock("@/infrastructure/email/client", () => ({ sendTransactionalEmail }));

const getAuthEmailByUserId = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/auth-users", () => ({ getAuthEmailByUserId }));

const createSupabaseAdminClient = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient }));

const { dispatchNotificationBroadcast } = await import("../dispatch-broadcast");

/**
 * Una difusion del superadmin puede salir por push y por email a la vez. El
 * push ya deja la fila en la campanita de cada destinatario, asi que el email
 * del mismo mensaje no debe dejar otra: se veria repetido.
 */

type Perfil = { email: string | null; user_id: string | null };

function supabaseFalso(opciones: {
  /** Organizaciones activas, para el objetivo "all". */
  organizaciones?: string[];
  /** Miembros activos de las organizaciones: a ellos les llega el push. */
  miembros?: string[];
  /** Perfiles con email de las organizaciones: a ellos les llega el mail. */
  perfiles?: Perfil[];
} = {}) {
  const organizaciones = opciones.organizaciones ?? [];
  const miembros = opciones.miembros ?? [];
  const perfiles = opciones.perfiles ?? [];

  return {
    from(tabla: string) {
      const cadena: Record<string, unknown> = {
        select: () => cadena,
        eq: () => cadena,
        in: () => cadena,
        not: () => cadena,
        then(resolver: (r: unknown) => void) {
          if (tabla === "organizations") {
            return resolver({ data: organizaciones.map((id) => ({ id })), error: null });
          }
          if (tabla === "memberships") {
            return resolver({ data: miembros.map((user_id) => ({ user_id })), error: null });
          }
          if (tabla === "organization_user_profiles") {
            return resolver({ data: perfiles, error: null });
          }
          return resolver({ data: [], error: null });
        },
      };
      return cadena;
    },
  };
}

function usar(mock: ReturnType<typeof supabaseFalso>) {
  createSupabaseAdminClient.mockReturnValue(mock as never);
}

/** El userId con el que salio el mail de cada destinatario. */
function userIdPorDestinatario() {
  return new Map(
    sendTransactionalEmail.mock.calls.map(([payload]: [PayloadEmail]) => [
      payload.to,
      payload.notification.userId,
    ]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sendTransactionalEmail.mockResolvedValue({ ok: true });
  sendPushToUsers.mockImplementation(async (usuarios: string[]) => ({
    sent: usuarios.length,
    expired: 0,
    failed: 0,
  }));
  sendPushToOrg.mockResolvedValue({ sent: 1, expired: 0, failed: 0 });
  getAuthEmailByUserId.mockResolvedValue(new Map());
});

describe("difusion a usuarios elegidos", () => {
  it("por los dos canales: el mail no repite la campanita que ya dejo el push", async () => {
    getAuthEmailByUserId.mockResolvedValue(
      new Map([
        ["u1", "ana@x.com"],
        ["u2", "luis@x.com"],
      ]),
    );
    usar(supabaseFalso());

    await dispatchNotificationBroadcast({
      channels: ["push", "email"],
      title: "Mantenimiento programado",
      body: "El sabado de 2 a 4",
      createdBy: "super-1",
      targetType: "users",
      userIds: ["u1", "u2"],
    });

    expect(sendPushToUsers).toHaveBeenCalledWith(["u1", "u2"], expect.anything(), expect.anything());

    const porDestinatario = userIdPorDestinatario();
    expect(porDestinatario.get("ana@x.com")).toBeNull();
    expect(porDestinatario.get("luis@x.com")).toBeNull();
  });

  it("solo por email: cada quien conserva su propia fila, que es su unica via", async () => {
    getAuthEmailByUserId.mockResolvedValue(new Map([["u1", "ana@x.com"]]));
    usar(supabaseFalso());

    await dispatchNotificationBroadcast({
      channels: ["email"],
      title: "Aviso",
      body: "Cuerpo",
      createdBy: "super-1",
      targetType: "users",
      userIds: ["u1"],
    });

    expect(sendPushToUsers).not.toHaveBeenCalled();
    expect(userIdPorDestinatario().get("ana@x.com")).toBe("u1");
  });
});

describe("difusion a organizaciones", () => {
  it("no repite la campanita de los miembros, pero si la arma para quien el push no alcanza", async () => {
    usar(
      supabaseFalso({
        organizaciones: ["org-1"],
        // El push va a los miembros activos.
        miembros: ["u1"],
        // u9 tiene perfil con mail pero ya no es miembro activo: el push no
        // lo alcanza, asi que el mail es su unica via y necesita su fila.
        perfiles: [
          { email: "ana@x.com", user_id: "u1" },
          { email: "ex@x.com", user_id: "u9" },
          { email: "generico@x.com", user_id: null },
        ],
      }),
    );

    await dispatchNotificationBroadcast({
      channels: ["push", "email"],
      title: "Novedades",
      body: "Cuerpo",
      createdBy: "super-1",
      targetType: "orgs",
      orgIds: ["org-1"],
    });

    const porDestinatario = userIdPorDestinatario();
    expect(porDestinatario.get("ana@x.com")).toBeNull();
    expect(porDestinatario.get("ex@x.com")).toBe("u9");
    expect(porDestinatario.get("generico@x.com")).toBeNull();
  });

  it("no manda dos mails al mismo correo aunque tenga perfil en varias organizaciones", async () => {
    usar(
      supabaseFalso({
        organizaciones: ["org-1", "org-2"],
        perfiles: [
          { email: "ana@x.com", user_id: "u1" },
          { email: "ana@x.com", user_id: "u1" },
        ],
      }),
    );

    await dispatchNotificationBroadcast({
      channels: ["email"],
      title: "Novedades",
      body: "Cuerpo",
      createdBy: "super-1",
      targetType: "orgs",
      orgIds: "all",
    });

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });
});

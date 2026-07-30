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

/** Devuelve la audiencia segun el alcance, como haria el resolvedor real. */
const resolveAudienceContacts = vi.hoisted(() =>
  vi.fn(async (input: { scope: { users: string[]; department_ids: string[] } }) => ({
    userIds: [
      ...input.scope.users,
      // Un departamento "cocina" trae a dos personas, para poder probar que
      // ampliar por grupo tambien avisa.
      ...(input.scope.department_ids.includes("cocina") ? ["cocinero-1", "cocinero-2"] : []),
    ],
    phones: [],
    emails: [],
  })),
);

vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers }));
vi.mock("@/shared/lib/audience-resolver", () => ({ resolveAudienceContacts }));

const { notifyDocumentAccessGranted } = await import("../document-audience.service");

/**
 * Cambiar los permisos de un documento o carpeta.
 *
 * La decision: avisar solo a quien *gana* acceso. Los que ya lo tenian no se
 * enteran de nada nuevo, y a los que lo pierden no tiene sentido avisarles de
 * algo que ya no pueden abrir.
 */

function base(scopeAnterior: object, scopeNuevo: object, actorUserId: string | null = "quien-edita") {
  return {
    supabase: {},
    organizationId: "org-1",
    kind: "document" as const,
    title: "Manual de apertura",
    scopeAnterior,
    scopeNuevo,
    actorUserId,
  };
}

const vacio = { locations: [], department_ids: [], position_ids: [], users: [] };

function avisados() {
  return (sendPushToUsers.mock.calls.at(-1)?.[0] ?? []).slice().sort();
}

beforeEach(() => {
  sendPushToUsers.mockClear();
});

describe("notifyDocumentAccessGranted", () => {
  it("avisa solo a quien gana acceso", async () => {
    await notifyDocumentAccessGranted(
      base({ ...vacio, users: ["ya-tenia"] }, { ...vacio, users: ["ya-tenia", "nuevo"] }),
    );

    expect(avisados()).toEqual(["nuevo"]);
  });

  it("no avisa a quien ya tenía acceso", async () => {
    await notifyDocumentAccessGranted(
      base({ ...vacio, users: ["ana", "beto"] }, { ...vacio, users: ["ana", "beto"] }),
    );

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("no avisa a quien pierde el acceso", async () => {
    // Avisar de algo que ya no se puede abrir solo confunde.
    await notifyDocumentAccessGranted(
      base({ ...vacio, users: ["ana", "beto"] }, { ...vacio, users: ["ana"] }),
    );

    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("avisa a todo un grupo que se suma", async () => {
    await notifyDocumentAccessGranted(
      base({ ...vacio, users: ["ana"] }, { ...vacio, users: ["ana"], department_ids: ["cocina"] }),
    );

    expect(avisados()).toEqual(["cocinero-1", "cocinero-2"]);
  });

  it("no le avisa a quien acaba de hacer el cambio", async () => {
    await notifyDocumentAccessGranted(
      base({ ...vacio, users: [] }, { ...vacio, users: ["quien-edita", "otro"] }),
    );

    expect(avisados()).toEqual(["otro"]);
  });

  it("distingue una carpeta de un documento en el título", async () => {
    await notifyDocumentAccessGranted({
      ...base({ ...vacio, users: [] }, { ...vacio, users: ["nuevo"] }),
      kind: "folder",
      title: "Manuales",
    });

    expect(sendPushToUsers.mock.calls.at(-1)?.[1]).toMatchObject({
      title: "Tenés acceso a una carpeta",
      body: "Manuales",
    });
  });

  it("sale con su propio origen, para poder distinguirlo del alta", async () => {
    await notifyDocumentAccessGranted(base({ ...vacio, users: [] }, { ...vacio, users: ["nuevo"] }));

    expect(sendPushToUsers.mock.calls.at(-1)?.[2]).toMatchObject({
      source: "documents_access_granted",
    });
  });
});

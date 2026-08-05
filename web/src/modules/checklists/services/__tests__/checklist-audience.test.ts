import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Que dice el aviso de "te mandaron un checklist para operar".
 *
 * Dos cosas que faltaban:
 *
 * 1. De quien viene. El aviso decia "Items: 5" y nada mas: quien lo recibia no
 *    sabia quien se lo habia mandado.
 *
 * 2. El idioma. El push salia en español y el mail del mismo evento en ingles
 *    ("New checklist created", "Created by"), asi que la misma persona recibia
 *    el mismo aviso en dos idiomas. Y el mail mostraba la direccion cruda de
 *    quien lo mando en vez de su nombre.
 */

const mocks = vi.hoisted(() => ({
  contacts: vi.fn(),
  push: vi.fn(),
  email: vi.fn(),
}));

vi.mock("@/shared/lib/audience-resolver", () => ({ resolveAudienceContacts: mocks.contacts }));
vi.mock("@/shared/lib/notification-links", () => ({ sendPushPorRol: mocks.push }));
vi.mock("@/infrastructure/email/client", () => ({ sendTransactionalEmail: mocks.email }));
vi.mock("@/infrastructure/twilio/client", () => ({ sendTwilioMessage: vi.fn() }));
vi.mock("@/infrastructure/supabase/client/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/shared/lib/custom-domains", () => ({
  resolveTenantAppUrlByOrganizationId: vi.fn(async () => "https://app.test"),
}));
vi.mock("@/shared/lib/email-branding", () => ({
  getTenantEmailBranding: vi.fn(async () => ({})),
  buildBrandedEmailSubject: (subject: string) => subject,
  resolveEmailSenderName: () => "GetBackplate",
}));
vi.mock("@/shared/lib/notification-recipients", () => ({
  userIdParaEmailSinDuplicarCampanita: () => null,
}));

const { sendChecklistAudiencePush, sendChecklistAudienceEmail } = await import(
  "../checklist-audience.service"
);

const base = {
  supabase: {} as never,
  organizationId: "org-1",
  targetScope: { locations: ["loc-a"] },
  templateName: "Apertura",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contacts.mockResolvedValue({
    emails: ["encargado@x.com"],
    phones: [],
    userIds: ["encargado"],
    userIdByEmail: { "encargado@x.com": "encargado" },
  });
  mocks.push.mockResolvedValue(1);
  mocks.email.mockResolvedValue({ ok: true });
});

describe("el push del reparto", () => {
  it("dice quién lo manda, antes del conteo", async () => {
    await sendChecklistAudiencePush({
      ...base,
      event: "created",
      itemsCount: 5,
      actorName: "Ana Pérez",
    });

    expect(mocks.push.mock.calls[0][0].payload).toEqual({
      title: "Nuevo checklist: Apertura",
      body: "Ana Pérez · 5 ítems",
    });
  });

  it("sin nombre resuelto queda solo el conteo, sin un separador suelto", async () => {
    await sendChecklistAudiencePush({
      ...base,
      event: "created",
      itemsCount: 5,
      actorName: null,
    });

    expect(mocks.push.mock.calls[0][0].payload.body).toBe("5 ítems");
  });

  it("al editar avisa que se actualizó, con quién lo editó", async () => {
    await sendChecklistAudiencePush({
      ...base,
      event: "updated",
      itemsCount: 3,
      actorName: "Ana Pérez",
    });

    expect(mocks.push.mock.calls[0][0].payload).toEqual({
      title: "Checklist actualizado: Apertura",
      body: "Ana Pérez · 3 ítems",
    });
  });

  it("no le avisa a quien acaba de mandarlo, aunque esté en el alcance que él mismo eligió", async () => {
    mocks.contacts.mockResolvedValue({
      emails: ["jefa@x.com", "encargado@x.com"],
      phones: [],
      userIds: ["jefa", "encargado"],
      userIdByEmail: { "jefa@x.com": "jefa", "encargado@x.com": "encargado" },
    });

    await sendChecklistAudiencePush({
      ...base,
      event: "created",
      itemsCount: 5,
      actorName: "Jefa",
      excludeUserId: "jefa",
    });

    expect(mocks.push.mock.calls[0][0].userIds).toEqual(["encargado"]);
  });

  it("sin nadie mas en el alcance que quien lo mando, no avisa nada", async () => {
    mocks.contacts.mockResolvedValue({
      emails: ["jefa@x.com"],
      phones: [],
      userIds: ["jefa"],
      userIdByEmail: { "jefa@x.com": "jefa" },
    });

    const enviados = await sendChecklistAudiencePush({
      ...base,
      event: "created",
      itemsCount: 5,
      actorName: "Jefa",
      excludeUserId: "jefa",
    });

    expect(enviados).toBe(0);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("el reparto automático no excluye a nadie: al creador puede tocarle operarlo", async () => {
    mocks.contacts.mockResolvedValue({
      emails: ["jefa@x.com"],
      phones: [],
      userIds: ["jefa"],
      userIdByEmail: { "jefa@x.com": "jefa" },
    });

    // El cron no manda excludeUserId, aunque sí nombre a quien creó la plantilla.
    await sendChecklistAudiencePush({
      ...base,
      event: "created",
      itemsCount: 5,
      actorName: "Jefa",
    });

    expect(mocks.push.mock.calls[0][0].userIds).toEqual(["jefa"]);
  });

});

describe("el mail del reparto", () => {
  it("va en español y nombra a la persona, no su dirección de mail", async () => {
    await sendChecklistAudienceEmail({
      ...base,
      event: "created",
      itemsCount: 5,
      actorName: "Ana Pérez",
    });

    const enviado = mocks.email.mock.calls[0][0];
    expect(enviado.subject).toBe("Nuevo checklist: Apertura");
    expect(enviado.text).toContain("Plantilla: Apertura");
    expect(enviado.text).toContain("Ítems: 5");
    expect(enviado.text).toContain("Lo creó: Ana Pérez");
    expect(enviado.html).toContain("Ver los checklists");

    // Lo que decia antes, que convivia con un push en español.
    expect(enviado.html).not.toContain("Created by");
    expect(enviado.html).not.toContain("New checklist");
  });

  it("tampoco le manda el mail a quien acaba de mandarlo", async () => {
    mocks.contacts.mockResolvedValue({
      emails: ["jefa@x.com", "encargado@x.com"],
      phones: [],
      userIds: ["jefa", "encargado"],
      userIdByEmail: { "jefa@x.com": "jefa", "encargado@x.com": "encargado" },
    });

    await sendChecklistAudienceEmail({
      ...base,
      event: "created",
      itemsCount: 5,
      actorName: "Jefa",
      excludeUserId: "jefa",
    });

    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.email.mock.calls[0][0].to).toBe("encargado@x.com");
  });

  it("sin nombre resuelto no deja el renglón colgado", async () => {
    await sendChecklistAudienceEmail({
      ...base,
      event: "created",
      itemsCount: 5,
      actorName: null,
    });

    expect(mocks.email.mock.calls[0][0].text).toContain("Lo creó: Un usuario interno");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El reparto de un aviso: lo que de verdad manda el mail y el push.
 *
 * Este archivo no tenia ningun test y es donde mas caro salio el error: en
 * produccion los avisos no le notificaron a nadie -- 2 de 2 con cero entregas --
 * porque la ruta del portal de empleado nunca las encolaba. Eso ya se corrigio,
 * pero el test de paridad solo LEE el codigo: comprueba que la llamada exista,
 * no que el reparto haga lo correcto. Si manda al destinatario equivocado, si
 * ignora el alcance o si falla en silencio, nadie se entera.
 *
 * Aca se ejecuta el reparto de punta a punta con las dependencias simuladas.
 */

// Sin reintentos: el codigo real espera 250ms y 500ms entre intentos y no hace
// falta esperarlos para comprobar la logica.
process.env.ANNOUNCEMENT_DELIVERIES_SEND_RETRIES = "0";

type PayloadEmail = { to: string; subject: string; html: string; text: string };
type PayloadPush = { title: string; body: string; url: string };
type EntradaAudiencia = { organizationId: string; scope: Record<string, string[]> };

type Audiencia = {
  emails: string[];
  phones: string[];
  userIds: string[];
  userIdByEmail: Record<string, string>;
};

const sendTransactionalEmail = vi.hoisted(() =>
  vi.fn<(payload: PayloadEmail) => Promise<{ ok: boolean; error: string | undefined }>>(
    async () => ({ ok: true, error: undefined }),
  ),
);
const sendTwilioMessage = vi.hoisted(() =>
  vi.fn<(to: string, cuerpo: string, canal: string) => Promise<{ ok: boolean }>>(
    async () => ({ ok: true }),
  ),
);
const sendPushToUsers = vi.hoisted(() =>
  vi.fn<(usuarios: string[], payload: PayloadPush, opciones?: unknown) => Promise<{ sent: number; expired: number; failed: number }>>(
    async () => ({ sent: 1, expired: 0, failed: 0 }),
  ),
);
const resolveAudienceContacts = vi.hoisted(() =>
  vi.fn<(entrada: EntradaAudiencia) => Promise<Audiencia>>(
    async () => ({ emails: [], phones: [], userIds: [], userIdByEmail: {} }),
  ),
);
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/email/client", () => ({ sendTransactionalEmail }));
vi.mock("@/infrastructure/twilio/client", () => ({ sendTwilioMessage }));
vi.mock("@/infrastructure/push/send-to-org", () => ({ sendPushToUsers }));
vi.mock("@/shared/lib/audience-resolver", () => ({ resolveAudienceContacts }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/shared/lib/email-branding", () => ({
  getTenantEmailBranding: vi.fn(async () => ({ companyName: "Juans" })),
  buildBrandedEmailSubject: (asunto: string) => asunto,
  resolveEmailSenderName: () => "Juans",
}));

const { processAnnouncementDeliveries } = await import("../deliveries");

type Entrega = {
  id: string;
  organization_id: string;
  announcement_id: string;
  channel: string;
  announcement: { title: string; body: string; target_scope: unknown } | null;
};

/** Lo que se le marco a cada entrega al terminar. */
type Marca = { ids: string[]; status: string };

function supabaseFalso(opciones: {
  encoladas?: Entrega[];
  /** El claim no toma nada: otro proceso se adelanto. */
  claimVacio?: boolean;
  errorAlBuscar?: string;
} = {}) {
  const encoladas = opciones.encoladas ?? [];
  const marcas: Marca[] = [];

  const cliente = {
    from(tabla: string) {
      let esClaim = false;
      let idsDelUpdate: string[] = [];
      let estadoDelUpdate = "";
      let filtroDeEstado: string | null = null;

      const cadena: Record<string, unknown> = {
        select: () => cadena,
        order: () => cadena,
        limit: () => cadena,
        update: (datos: { status: string }) => {
          esClaim = datos.status === "processing";
          estadoDelUpdate = datos.status;
          return cadena;
        },
        in: (_columna: string, valores: string[]) => {
          idsDelUpdate = valores;
          return cadena;
        },
        eq: (columna: string, valor: string) => {
          if (columna === "status") filtroDeEstado = valor;
          return cadena;
        },
        then(resolver: (r: unknown) => void) {
          if (tabla !== "announcement_deliveries") return resolver({ data: [], error: null });

          if (opciones.errorAlBuscar && !estadoDelUpdate) {
            return resolver({ data: null, error: { message: opciones.errorAlBuscar } });
          }

          // 1) Buscar candidatas: solo un select filtrando por encoladas.
          if (!estadoDelUpdate) {
            return resolver({ data: encoladas.map((e) => ({ id: e.id })), error: null });
          }

          // 2) Claim: update a processing. Respeta el filtro status='queued',
          //    que es lo que evita que dos procesos manden lo mismo.
          if (esClaim) {
            if (opciones.claimVacio || filtroDeEstado !== "queued") return resolver({ data: [], error: null });
            return resolver({ data: encoladas.filter((e) => idsDelUpdate.includes(e.id)), error: null });
          }

          // 3) Marcar el resultado final.
          marcas.push({ ids: idsDelUpdate, status: estadoDelUpdate });
          return resolver({ data: null, error: null });
        },
      };

      return cadena;
    },
  };

  return { cliente, marcas };
}

function entrega(extra: Partial<Entrega> = {}): Entrega {
  return {
    id: "ent-1",
    organization_id: "org-1",
    announcement_id: "av-1",
    channel: "email",
    announcement: { title: "Reunión", body: "Mañana a las 9", target_scope: {} },
    ...extra,
  };
}

function prepararAudiencia(audiencia: Partial<Awaited<ReturnType<typeof resolveAudienceContacts>>>) {
  resolveAudienceContacts.mockResolvedValue({
    emails: [], phones: [], userIds: [], userIdByEmail: {}, ...audiencia,
  } as never);
}

function usar(mock: ReturnType<typeof supabaseFalso>) {
  createSupabaseAdminClient.mockReturnValue(mock.cliente as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  sendTransactionalEmail.mockResolvedValue({ ok: true, error: undefined });
  sendTwilioMessage.mockResolvedValue({ ok: true } as never);
  sendPushToUsers.mockResolvedValue({ sent: 1, expired: 0, failed: 0 } as never);
  prepararAudiencia({});
});

describe("cuando no hay nada encolado", () => {
  it("no manda nada", async () => {
    usar(supabaseFalso({ encoladas: [] }));

    const r = await processAnnouncementDeliveries();

    expect(r).toMatchObject({ success: true, processed: 0 });
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("si la consulta falla lo dice, en vez de fingir que anduvo", async () => {
    usar(supabaseFalso({ errorAlBuscar: "la base no responde" }));

    const r = await processAnnouncementDeliveries();

    expect(r.success).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("email", () => {
  it("le llega a cada persona del alcance", async () => {
    prepararAudiencia({ emails: ["ana@x.com", "luis@x.com"], userIdByEmail: { "ana@x.com": "u1" } });
    const mock = usar(supabaseFalso({ encoladas: [entrega()] }));

    const r = await processAnnouncementDeliveries();

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(2);
    const destinatarios = sendTransactionalEmail.mock.calls.map((c) => c[0].to).sort();
    expect(destinatarios).toEqual(["ana@x.com", "luis@x.com"]);
    expect(mock.marcas).toEqual([{ ids: ["ent-1"], status: "sent" }]);
    expect(r).toMatchObject({ successCount: 1, sentContactsCount: 2 });
  });

  it("el mail lleva el titulo y el cuerpo del aviso", async () => {
    prepararAudiencia({ emails: ["ana@x.com"] });
    usar(supabaseFalso({ encoladas: [entrega()] }));

    await processAnnouncementDeliveries();

    const enviado = sendTransactionalEmail.mock.calls[0]![0];
    expect(enviado.subject).toContain("Reunión");
    expect(enviado.text).toContain("Mañana a las 9");
  });

  it("si no le corresponde a nadie, no manda y no queda fallada", async () => {
    // Un aviso cuyo alcance no alcanza a nadie no es un error de envio.
    prepararAudiencia({ emails: [] });
    const mock = usar(supabaseFalso({ encoladas: [entrega()] }));

    await processAnnouncementDeliveries();

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(mock.marcas).toEqual([{ ids: ["ent-1"], status: "sent" }]);
  });

  it("si falla para todos queda marcada como fallada", async () => {
    prepararAudiencia({ emails: ["ana@x.com"] });
    sendTransactionalEmail.mockResolvedValue({ ok: false, error: "smtp caido" });
    const mock = usar(supabaseFalso({ encoladas: [entrega()] }));

    const r = await processAnnouncementDeliveries();

    expect(mock.marcas).toEqual([{ ids: ["ent-1"], status: "failed" }]);
    expect(r).toMatchObject({ failCount: 1 });
  });

  it("si le llega aunque sea a uno, no se da por fallada", async () => {
    prepararAudiencia({ emails: ["ana@x.com", "roto@x.com"] });
    sendTransactionalEmail.mockImplementation(async (payload) =>
      payload.to === "roto@x.com"
        ? { ok: false, error: "rebotado" }
        : { ok: true, error: undefined },
    );
    const mock = usar(supabaseFalso({ encoladas: [entrega()] }));

    await processAnnouncementDeliveries();

    expect(mock.marcas).toEqual([{ ids: ["ent-1"], status: "sent" }]);
  });
});

describe("push", () => {
  it("va a los usuarios del alcance, no a toda la organizacion", async () => {
    prepararAudiencia({ userIds: ["u1", "u2"] });
    usar(supabaseFalso({ encoladas: [entrega({ channel: "push" })] }));

    await processAnnouncementDeliveries();

    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    const [usuarios, payload] = sendPushToUsers.mock.calls[0]!;
    expect(usuarios).toEqual(["u1", "u2"]);
    expect(payload.title).toBe("Reunión");
    expect(payload.url).toBe("/portal/announcements");
  });

  it("si el push falla queda marcada como fallada", async () => {
    prepararAudiencia({ userIds: ["u1"] });
    sendPushToUsers.mockRejectedValue(new Error("sin credenciales"));
    const mock = usar(supabaseFalso({ encoladas: [entrega({ channel: "push" })] }));

    await processAnnouncementDeliveries();

    expect(mock.marcas).toEqual([{ ids: ["ent-1"], status: "failed" }]);
  });

  it("no manda mail cuando el canal es push", async () => {
    prepararAudiencia({ userIds: ["u1"], emails: ["ana@x.com"] });
    usar(supabaseFalso({ encoladas: [entrega({ channel: "push" })] }));

    await processAnnouncementDeliveries();

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("sms", () => {
  it("usa los telefonos del alcance", async () => {
    prepararAudiencia({ phones: ["+15550001"] });
    usar(supabaseFalso({ encoladas: [entrega({ channel: "sms" })] }));

    await processAnnouncementDeliveries();

    expect(sendTwilioMessage).toHaveBeenCalledTimes(1);
    expect(sendTwilioMessage.mock.calls[0]![0]).toBe("+15550001");
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("el alcance del aviso llega al resolvedor", () => {
  it("le pasa las cuatro dimensiones tal como estan guardadas", async () => {
    // Si el alcance no viajara, el aviso le llegaria a gente que no debia.
    const scope = {
      locations: ["loc-a"],
      department_ids: ["dep-1"],
      position_ids: ["pos-1"],
      users: ["u9"],
    };
    prepararAudiencia({ emails: ["ana@x.com"] });
    usar(supabaseFalso({
      encoladas: [entrega({ announcement: { title: "T", body: "B", target_scope: scope } })],
    }));

    await processAnnouncementDeliveries();

    expect(resolveAudienceContacts).toHaveBeenCalledTimes(1);
    const arg = resolveAudienceContacts.mock.calls[0]![0];
    expect(arg.organizationId).toBe("org-1");
    expect(arg.scope).toEqual(scope);
  });

  it("un alcance vacio se resuelve como toda la organizacion, no como nadie", async () => {
    prepararAudiencia({ emails: ["ana@x.com"] });
    usar(supabaseFalso({ encoladas: [entrega({ announcement: { title: "T", body: "B", target_scope: {} } })] }));

    await processAnnouncementDeliveries();

    const arg = resolveAudienceContacts.mock.calls[0]![0];
    expect(arg.scope).toEqual({ locations: [], department_ids: [], position_ids: [], users: [] });
  });
});

describe("no manda dos veces lo mismo", () => {
  it("varias entregas del mismo aviso y canal se mandan una sola vez", async () => {
    prepararAudiencia({ emails: ["ana@x.com"] });
    const mock = usar(supabaseFalso({
      encoladas: [entrega({ id: "ent-1" }), entrega({ id: "ent-2" })],
    }));

    await processAnnouncementDeliveries();

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(mock.marcas).toEqual([{ ids: ["ent-1", "ent-2"], status: "sent" }]);
  });

  it("si otro proceso ya las tomo, no manda nada", async () => {
    // El claim filtra por status='queued': el segundo proceso no toma ninguna.
    prepararAudiencia({ emails: ["ana@x.com"] });
    usar(supabaseFalso({ encoladas: [entrega()], claimVacio: true }));

    const r = await processAnnouncementDeliveries();

    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(r).toMatchObject({ processed: 0 });
  });

  it("canales distintos del mismo aviso se mandan por separado", async () => {
    prepararAudiencia({ emails: ["ana@x.com"], userIds: ["u1"] });
    usar(supabaseFalso({
      encoladas: [entrega({ id: "ent-1", channel: "email" }), entrega({ id: "ent-2", channel: "push" })],
    }));

    await processAnnouncementDeliveries();

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
  });
});

describe("un aviso que ya no existe", () => {
  it("no rompe el lote: se marca fallada y sigue", async () => {
    prepararAudiencia({ emails: ["ana@x.com"] });
    const mock = usar(supabaseFalso({
      encoladas: [
        entrega({ id: "ent-1", announcement_id: "borrado", announcement: null }),
        entrega({ id: "ent-2", announcement_id: "av-2" }),
      ],
    }));

    await processAnnouncementDeliveries();

    expect(mock.marcas).toContainEqual({ ids: ["ent-1"], status: "failed" });
    expect(mock.marcas).toContainEqual({ ids: ["ent-2"], status: "sent" });
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
  });
});

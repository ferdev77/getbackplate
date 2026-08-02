import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Alta y edicion de un aviso, el camino que comparten los dos portales.
 *
 * Existe porque el portal de empleado tenia su propia copia a medias: guardaba
 * el aviso pero no encolaba las entregas ni armaba el reparto periodico. En
 * produccion todos los avisos eran de empleados, asi que ninguno notifico a
 * nadie. Se unificaron los dos caminos en este servicio; estos tests fijan lo
 * que tiene que pasar cada vez que se guarda un aviso.
 */

const processAnnouncementDeliveries = vi.hoisted(() =>
  vi.fn(async () => ({ success: true as boolean, sentContactsCount: 0 as number | undefined })),
);
vi.mock("@/modules/announcements/services/deliveries", () => ({ processAnnouncementDeliveries }));

const { upsertAnnouncement } = await import("../announcement-upsert.service");

type Operacion = { tabla: string; tipo: string; datos?: unknown; filtros: Record<string, unknown> };

function supabaseFalso(opciones: {
  /** El aviso que se quiere editar existe. */
  avisoExiste?: boolean;
  /** Ya hay un reparto periodico armado. */
  jobExistente?: { id: string } | null;
  errorAlGuardar?: string;
  errorAlEncolar?: string;
} = {}) {
  const operaciones: Operacion[] = [];

  const cliente = {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      let tipo = "select";
      let datos: unknown;

      const cadena: Record<string, unknown> = {
        select: () => cadena,
        insert: (valores: unknown) => { tipo = "insert"; datos = valores; operaciones.push({ tabla, tipo, datos, filtros }); return cadena; },
        update: (valores: unknown) => { tipo = "update"; datos = valores; operaciones.push({ tabla, tipo, datos, filtros }); return cadena; },
        delete: () => { tipo = "delete"; operaciones.push({ tabla, tipo, filtros }); return cadena; },
        eq: (columna: string, valor: unknown) => { filtros[columna] = valor; return cadena; },
        maybeSingle: async () => {
          if (tabla === "announcements") {
            return { data: opciones.avisoExiste === false ? null : { id: "av-1" }, error: null };
          }
          if (tabla === "scheduled_jobs") {
            return { data: opciones.jobExistente ?? null, error: null };
          }
          return { data: null, error: null };
        },
        single: async () => {
          if (opciones.errorAlGuardar) return { data: null, error: { message: opciones.errorAlGuardar } };
          return { data: { id: "av-1" }, error: null };
        },
        then(resolver: (r: unknown) => void) {
          if (tabla === "announcement_deliveries" && opciones.errorAlEncolar) {
            return resolver({ data: null, error: { message: opciones.errorAlEncolar } });
          }
          return resolver({ data: null, error: null });
        },
      };

      return cadena;
    },
  };

  return { cliente: cliente as never, operaciones };
}

const BASE = {
  organizationId: "org-1",
  createdBy: "u1",
  announcementId: null,
  title: "Reunión",
  body: "Mañana a las 9",
  kind: "general",
  isFeatured: false,
  expiresAt: null,
  scope: { locations: ["loc-a"], department_ids: [], position_ids: [], users: [] },
  deliveryChannels: ["email"],
};

function operacionesDe(ops: Operacion[], tabla: string, tipo?: string) {
  return ops.filter((o) => o.tabla === tabla && (!tipo || o.tipo === tipo));
}

beforeEach(() => {
  vi.clearAllMocks();
  processAnnouncementDeliveries.mockResolvedValue({ success: true, sentContactsCount: 0 });
});

describe("guardar un aviso", () => {
  it("lo crea con el alcance tal como se eligio", async () => {
    const { cliente, operaciones } = supabaseFalso();

    const r = await upsertAnnouncement({ supabase: cliente, ...BASE });

    expect(r.ok).toBe(true);
    const alta = operacionesDe(operaciones, "announcements", "insert")[0];
    expect(alta.datos).toMatchObject({
      organization_id: "org-1",
      created_by: "u1",
      title: "Reunión",
      target_scope: BASE.scope,
    });
  });

  it("al editar no crea uno nuevo", async () => {
    const { cliente, operaciones } = supabaseFalso({ avisoExiste: true });

    await upsertAnnouncement({ supabase: cliente, ...BASE, announcementId: "av-1" });

    expect(operacionesDe(operaciones, "announcements", "insert")).toHaveLength(0);
    expect(operacionesDe(operaciones, "announcements", "update")).toHaveLength(1);
  });

  it("no deja editar un aviso que no existe", async () => {
    const { cliente, operaciones } = supabaseFalso({ avisoExiste: false });

    const r = await upsertAnnouncement({ supabase: cliente, ...BASE, announcementId: "fantasma" });

    expect(r.ok).toBe(false);
    expect(operacionesDe(operaciones, "announcements", "update")).toHaveLength(0);
  });

  it("si no se pudo guardar, no encola ninguna entrega", async () => {
    const { cliente, operaciones } = supabaseFalso({ errorAlGuardar: "la base fallo" });

    const r = await upsertAnnouncement({ supabase: cliente, ...BASE });

    expect(r.ok).toBe(false);
    expect(operacionesDe(operaciones, "announcement_deliveries")).toHaveLength(0);
    expect(processAnnouncementDeliveries).not.toHaveBeenCalled();
  });
});

describe("las entregas se encolan (el bug que dejo a todos sin notificar)", () => {
  it("encola una entrega por canal elegido", async () => {
    const { cliente, operaciones } = supabaseFalso();

    await upsertAnnouncement({ supabase: cliente, ...BASE, deliveryChannels: ["email", "push"] });

    const encoladas = operacionesDe(operaciones, "announcement_deliveries", "insert")[0];
    expect(encoladas.datos).toEqual([
      { organization_id: "org-1", announcement_id: "av-1", channel: "email", status: "queued" },
      { organization_id: "org-1", announcement_id: "av-1", channel: "push", status: "queued" },
    ]);
  });

  it("despues de encolar dispara el reparto", async () => {
    const { cliente } = supabaseFalso();

    await upsertAnnouncement({ supabase: cliente, ...BASE });

    expect(processAnnouncementDeliveries).toHaveBeenCalledTimes(1);
  });

  it("devuelve a cuantas personas les llego", async () => {
    processAnnouncementDeliveries.mockResolvedValue({ success: true, sentContactsCount: 7 });
    const { cliente } = supabaseFalso();

    const r = await upsertAnnouncement({ supabase: cliente, ...BASE });

    expect(r).toMatchObject({ ok: true, sentContactsCount: 7 });
  });

  it("sin canales elegidos no encola ni reparte", async () => {
    const { cliente, operaciones } = supabaseFalso();

    const r = await upsertAnnouncement({ supabase: cliente, ...BASE, deliveryChannels: [] });

    expect(r.ok).toBe(true);
    expect(operacionesDe(operaciones, "announcement_deliveries")).toHaveLength(0);
    expect(processAnnouncementDeliveries).not.toHaveBeenCalled();
  });

  it("si no se pudo encolar lo avisa, en vez de decir que salio todo bien", async () => {
    const { cliente } = supabaseFalso({ errorAlEncolar: "tabla llena" });

    const r = await upsertAnnouncement({ supabase: cliente, ...BASE });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("no se pudo encolar");
  });
});

describe("el reparto periodico", () => {
  const recurrente = { isRecurring: true, recurrenceType: "weekly", customDays: [1, 3], channels: ["email"] };

  it("se crea cuando el aviso es periodico", async () => {
    const { cliente, operaciones } = supabaseFalso({ jobExistente: null });

    await upsertAnnouncement({ supabase: cliente, ...BASE, recurrence: recurrente });

    const alta = operacionesDe(operaciones, "scheduled_jobs", "insert")[0];
    expect(alta.datos).toMatchObject({
      job_type: "announcement_delivery",
      target_id: "av-1",
      recurrence_type: "weekly",
      custom_days: [1, 3],
      metadata: { channels: ["email"] },
    });
  });

  it("si ya existe se actualiza en vez de duplicarse", async () => {
    const { cliente, operaciones } = supabaseFalso({ jobExistente: { id: "job-1" } });

    await upsertAnnouncement({ supabase: cliente, ...BASE, recurrence: recurrente });

    expect(operacionesDe(operaciones, "scheduled_jobs", "insert")).toHaveLength(0);
    expect(operacionesDe(operaciones, "scheduled_jobs", "update")).toHaveLength(1);
  });

  it("si le sacan la periodicidad, el reparto se borra", async () => {
    // Sin esto el cron seguiria repartiendo un aviso que ya no se repite.
    const { cliente, operaciones } = supabaseFalso({ jobExistente: { id: "job-1" } });

    await upsertAnnouncement({
      supabase: cliente, ...BASE,
      recurrence: { ...recurrente, isRecurring: false },
    });

    expect(operacionesDe(operaciones, "scheduled_jobs", "delete")).toHaveLength(1);
    expect(operacionesDe(operaciones, "scheduled_jobs", "insert")).toHaveLength(0);
  });

  it("un aviso sin periodicidad no deja ningun reparto armado", async () => {
    const { cliente, operaciones } = supabaseFalso();

    await upsertAnnouncement({ supabase: cliente, ...BASE });

    expect(operacionesDe(operaciones, "scheduled_jobs", "insert")).toHaveLength(0);
    expect(operacionesDe(operaciones, "scheduled_jobs", "delete")).toHaveLength(1);
  });
});

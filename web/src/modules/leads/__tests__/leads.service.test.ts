import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Los leads: alta, aviso a los superadmins y recuperacion de los que se
 * perdieron.
 *
 * No tenia ningun test. Lo delicado es que el alta sea idempotente: la
 * reconciliacion vuelve a llamar a createLead sobre referidos que ya tienen
 * lead, y si eso insertara en vez de hacer upsert, cada corrida duplicaria
 * todos los leads de las ultimas dos semanas.
 */

type PayloadPush = { title: string; body: string; url: string };

const notifySuperadmins = vi.hoisted(() =>
  vi.fn<(payload: PayloadPush, opciones?: unknown) => Promise<{ sent: number; expired: number; failed: number }>>(
    async () => ({ sent: 1, expired: 0, failed: 0 }),
  ),
);
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());

vi.mock("@/infrastructure/push/notify-superadmins", () => ({ notifySuperadmins }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient }));

const { createLead, notifyNewLead, reconcileOrphanReferralLeads } = await import("../leads.service");

type Operacion = { tabla: string; tipo: "insert" | "upsert"; datos: unknown; opciones?: unknown };

function supabaseFalso(opciones: {
  filas?: Record<string, unknown[]>;
  errorAlEscribir?: string;
  errorAlLeer?: Record<string, string>;
} = {}) {
  const operaciones: Operacion[] = [];
  const filas = opciones.filas ?? {};

  const cliente = {
    from(tabla: string) {
      const cadena: Record<string, unknown> = {
        select: () => cadena,
        eq: () => cadena,
        in: () => cadena,
        gte: () => cadena,
        insert: (datos: unknown) => {
          operaciones.push({ tabla, tipo: "insert", datos });
          return cadena;
        },
        upsert: (datos: unknown, opts: unknown) => {
          operaciones.push({ tabla, tipo: "upsert", datos, opciones: opts });
          return cadena;
        },
        then(resolver: (r: unknown) => void) {
          if (opciones.errorAlEscribir && operaciones.some((o) => o.tabla === tabla)) {
            return resolver({ data: null, error: { message: opciones.errorAlEscribir } });
          }
          const errorLectura = opciones.errorAlLeer?.[tabla];
          if (errorLectura) return resolver({ data: null, error: { message: errorLectura } });
          return resolver({ data: filas[tabla] ?? [], error: null });
        },
      };
      return cadena;
    },
  };

  createSupabaseAdminClient.mockReturnValue(cliente as never);
  return { operaciones };
}

beforeEach(() => {
  vi.clearAllMocks();
  notifySuperadmins.mockResolvedValue({ sent: 1, expired: 0, failed: 0 });
});

describe("createLead", () => {
  const BASE = { source: "seat_request" as const, contactName: "Ana", contactEmail: "ana@x.com" };

  it("rechaza un origen que no existe", async () => {
    supabaseFalso();
    await expect(
      createLead({ ...BASE, source: "inventado" as never }),
    ).rejects.toThrow("Invalid lead source");
  });

  it("sin id de origen inserta", async () => {
    const { operaciones } = supabaseFalso();

    await createLead(BASE);

    expect(operaciones[0]).toMatchObject({ tabla: "superadmin_leads", tipo: "insert" });
  });

  it("con id de origen hace upsert, para no duplicar al reconciliar", async () => {
    // Este es el punto: la reconciliacion vuelve a pasar por los mismos
    // referidos. Si esto insertara, duplicaria todo en cada corrida.
    const { operaciones } = supabaseFalso();

    await createLead({ ...BASE, sourceRecordId: "ref-1" });

    expect(operaciones[0]).toMatchObject({
      tabla: "superadmin_leads",
      tipo: "upsert",
      opciones: { onConflict: "source,source_record_id" },
    });
  });

  it("completa los campos que faltan en vez de dejarlos indefinidos", async () => {
    const { operaciones } = supabaseFalso();

    await createLead(BASE);

    expect(operaciones[0].datos).toMatchObject({
      contact_phone: null,
      company_name: null,
      source_record_id: null,
      metadata: {},
    });
  });

  it("si la base falla, lo propaga", async () => {
    supabaseFalso({ errorAlEscribir: "tabla llena" });

    await expect(createLead(BASE)).rejects.toThrow(/Failed to create lead/);
  });
});

describe("notifyNewLead", () => {
  const LEAD = {
    source: "seat_request" as const,
    contactName: "Ana",
    contactEmail: "ana@x.com",
    companyName: "Tacos SA",
  };

  it("delega en notifySuperadmins -- avisa a todos, no solo a quien tiene push activo", async () => {
    await notifyNewLead(LEAD);

    expect(notifySuperadmins).toHaveBeenCalledTimes(1);
  });

  it("si falla no revienta el alta del lead", async () => {
    // Es fire-and-forget: el lead ya se guardo, el aviso es secundario.
    notifySuperadmins.mockRejectedValueOnce(new Error("sin permiso"));

    await expect(notifyNewLead(LEAD)).resolves.toBeUndefined();
  });

  it("el mensaje dice de dónde viene y quién es", async () => {
    await notifyNewLead(LEAD);

    const payload = notifySuperadmins.mock.calls[0]![0];
    expect(payload.body).toContain("Seat request");
    expect(payload.body).toContain("Tacos SA");
    expect(payload.body).toContain("ana@x.com");
    expect(payload.url).toBe("/superadmin/leads");
  });
});

describe("reconcileOrphanReferralLeads", () => {
  it("vuelve a dar de alta los referidos de la ventana", async () => {
    const { operaciones } = supabaseFalso({
      filas: {
        qbo_public_vendor_referrals: [
          { id: "pub-1", referrer_name: "Ana", referrer_email: "ana@x.com", vendor_company: "Tacos", vendor_contact_name: "Luis", vendor_email: "luis@x.com" },
        ],
        qbo_vendor_referrals: [
          { id: "priv-1", organization_id: "org-1", sync_config_customer_id: "c1", referrer_branch_name: "Long Beach", vendor_company: "Sillas", vendor_contact_name: "Eva", vendor_email: "eva@x.com", vendor_phone: "+1555" },
        ],
      },
    });

    const r = await reconcileOrphanReferralLeads();

    expect(r).toMatchObject({ ok: true, publicReferralsChecked: 1, privateReferralsChecked: 1 });
    const altas = operaciones.filter((o) => o.tabla === "superadmin_leads");
    expect(altas).toHaveLength(2);
    // Todas por upsert: correr esto dos veces no puede duplicar nada.
    expect(altas.every((o) => o.tipo === "upsert")).toBe(true);
  });

  it("sin referidos no da de alta nada", async () => {
    const { operaciones } = supabaseFalso({ filas: {} });

    const r = await reconcileOrphanReferralLeads();

    expect(r.ok).toBe(true);
    expect(operaciones.filter((o) => o.tabla === "superadmin_leads")).toHaveLength(0);
  });

  it("si una fuente falla lo reporta y sigue con la otra", async () => {
    const { operaciones } = supabaseFalso({
      errorAlLeer: { qbo_public_vendor_referrals: "sin permiso" },
      filas: {
        qbo_vendor_referrals: [
          { id: "priv-1", organization_id: "org-1", vendor_contact_name: "Eva", vendor_email: "eva@x.com" },
        ],
      },
    });

    const r = await reconcileOrphanReferralLeads();

    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("public_referral"))).toBe(true);
    expect(r.privateReferralsChecked).toBe(1);
    expect(operaciones.filter((o) => o.tabla === "superadmin_leads")).toHaveLength(1);
  });
});

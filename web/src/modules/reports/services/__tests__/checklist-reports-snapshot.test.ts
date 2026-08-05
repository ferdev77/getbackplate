import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createSignedUrls = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrls }) } }),
}));

const {
  colorForUser,
  firmarEvidencias,
  formatDateLabel,
  initials,
  relativeFromNow,
  resolveChecklistHistoryItemMeta,
  shortName,
} = await import("../checklist-reports-snapshot");

/**
 * Como se lee un reporte de checklists.
 *
 * El modulo no tenia ningun test. Lo que se prueba aca es la parte pura -- la
 * que arma las etiquetas que ve la persona -- porque es donde estan los bordes
 * que se rompen sin avisar: el corte de "Hoy" a la medianoche, un nombre vacio,
 * una fecha invalida. Un error ahi no borra datos, pero muestra numeros y
 * fechas que no son.
 *
 * La consulta que arma el resumen (buildChecklistReportsSnapshot) sigue sin
 * cubrir: es de solo lectura y su valor esta en la agregacion contra la base.
 * La excepcion es firmarEvidencias, que si esta abajo: ahi vivio un bug real.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("firmarEvidencias", () => {
  beforeEach(() => {
    createSignedUrls.mockReset();
  });

  it("devuelve enlaces firmados, no la URL pública del bucket", async () => {
    // El bucket es privado: una URL /object/public/ responde 400 y la foto se
    // ve rota. Este es el bug que se arreglo.
    createSignedUrls.mockResolvedValue({
      data: [{ path: "org/sub/item/a.png", signedUrl: "https://x.test/a.png?token=abc" }],
    });

    const urls = await firmarEvidencias(new Map([["item-1", ["org/sub/item/a.png"]]]));

    expect(urls.get("item-1")).toEqual(["https://x.test/a.png?token=abc"]);
    expect(createSignedUrls).toHaveBeenCalledWith(["org/sub/item/a.png"], 60 * 60 * 24);
  });

  it("firma de a 50 para no pedir todo junto", async () => {
    const paths = Array.from({ length: 120 }, (_, i) => `org/sub/item/${i}.png`);
    createSignedUrls.mockResolvedValue({ data: [] });

    await firmarEvidencias(new Map([["item-1", paths]]));

    expect(createSignedUrls).toHaveBeenCalledTimes(3);
    expect(createSignedUrls.mock.calls[0][0]).toHaveLength(50);
    expect(createSignedUrls.mock.calls[2][0]).toHaveLength(20);
  });

  it("sin adjuntos no le pide nada al storage", async () => {
    const urls = await firmarEvidencias(new Map());

    expect(urls.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("una foto que no se pudo firmar no rompe el resto del reporte", async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: "org/sub/item/a.png", signedUrl: "https://x.test/a.png?token=abc" }],
    });

    const urls = await firmarEvidencias(
      new Map([["item-1", ["org/sub/item/a.png", "org/sub/item/perdida.png"]]]),
    );

    expect(urls.get("item-1")).toEqual(["https://x.test/a.png?token=abc"]);
  });
});

describe("initials", () => {
  it("toma la inicial del nombre y del apellido", () => {
    expect(initials("Ana Laura")).toBe("AL");
  });

  it("con un solo nombre devuelve una letra", () => {
    expect(initials("Angelo")).toBe("A");
  });

  it("ignora los espacios de más", () => {
    expect(initials("  Tavo   Garcia  ")).toBe("TG");
  });

  it("solo usa las dos primeras palabras", () => {
    expect(initials("José Luis Narváez Pérez")).toBe("JL");
  });

  it("sin nombre no queda vacío", () => {
    expect(initials("")).toBe("EM");
    expect(initials("   ")).toBe("EM");
  });
});

describe("shortName", () => {
  it("deja el nombre y la inicial del apellido", () => {
    expect(shortName("Ana Laura")).toBe("Ana L.");
  });

  it("con un solo nombre lo deja tal cual", () => {
    expect(shortName("Angelo")).toBe("Angelo");
  });

  it("sin nombre muestra algo legible en vez de vacío", () => {
    expect(shortName("")).toBe("Empleado");
  });
});

describe("formatDateLabel", () => {
  const hoyCero = new Date("2026-08-02T00:00:00");

  it("lo de hoy dice Hoy", () => {
    expect(formatDateLabel("2026-08-02T09:30:00", hoyCero)).toBe("Hoy");
  });

  it("justo la medianoche ya es hoy", () => {
    // El borde: a las 00:00 arranca el dia, no sigue siendo ayer.
    expect(formatDateLabel("2026-08-02T00:00:00", hoyCero)).toBe("Hoy");
  });

  it("un minuto antes de medianoche es ayer", () => {
    expect(formatDateLabel("2026-08-01T23:59:00", hoyCero)).toBe("Ayer");
  });

  it("lo de anteayer muestra la fecha", () => {
    const etiqueta = formatDateLabel("2026-07-28T10:00:00", hoyCero);
    expect(etiqueta).not.toBe("Hoy");
    expect(etiqueta).not.toBe("Ayer");
    expect(etiqueta).toMatch(/\d{2}\/\d{2}/);
  });

  it("sin fecha o con una fecha rota no rompe", () => {
    expect(formatDateLabel(null, hoyCero)).toBe("Sin fecha");
    expect(formatDateLabel("no es una fecha", hoyCero)).toBe("Sin fecha");
  });
});

describe("relativeFromNow", () => {
  it("hace minutos cuando es reciente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00"));
    expect(relativeFromNow("2026-08-02T11:30:00")).toBe("hace 30m");
  });

  it("pasa a horas después de una hora", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00"));
    expect(relativeFromNow("2026-08-02T09:00:00")).toBe("hace 3h");
  });

  it("una fecha futura no muestra tiempo negativo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00"));
    expect(relativeFromNow("2026-08-02T18:00:00")).toBe("hace 0m");
  });

  it("sin fecha devuelve vacío", () => {
    expect(relativeFromNow(null)).toBe("");
    expect(relativeFromNow("cualquier cosa")).toBe("");
  });
});

describe("colorForUser", () => {
  it("la misma persona siempre tiene el mismo color", () => {
    expect(colorForUser("u1")).toBe(colorForUser("u1"));
  });

  it("siempre devuelve un color de la paleta", () => {
    for (const id of ["u1", "u2", "u3", "", "aaaaaaaa-bbbb-cccc"]) {
      expect(colorForUser(id)).toBeTruthy();
      expect(typeof colorForUser(id)).toBe("string");
    }
  });
});

describe("resolveChecklistHistoryItemMeta", () => {
  const live = {
    sectionId: "live-section",
    sectionName: "Live section",
    sectionOrder: 9,
    itemOrder: 8,
    label: "Live label",
  };

  it("uses frozen structure after template rows are deleted", () => {
    expect(resolveChecklistHistoryItemMeta({
      sectionId: "frozen-section",
      sectionName: "Opening",
      sectionOrder: 1,
      itemOrder: 2,
      itemLabel: "Check freezer",
    }, undefined)).toEqual({
      sectionKey: "frozen-section",
      sectionName: "Opening",
      sectionOrder: 1,
      itemOrder: 2,
      label: "Check freezer",
    });
  });

  it("prefers snapshots and falls back to live metadata for legacy rows", () => {
    expect(resolveChecklistHistoryItemMeta({
      sectionId: null,
      sectionName: null,
      sectionOrder: null,
      itemOrder: null,
      itemLabel: "Frozen label",
    }, live)).toEqual({
      sectionKey: "live-section",
      sectionName: "Live section",
      sectionOrder: 9,
      itemOrder: 8,
      label: "Frozen label",
    });
  });
});

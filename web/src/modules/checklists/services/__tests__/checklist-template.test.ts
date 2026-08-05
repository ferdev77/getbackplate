import { describe, it, expect } from "vitest";
import {
  contarItemsDeLaPlantilla,
  decideChecklistSectionUpdate,
  normalizePriority,
} from "../checklist-template.service";

/**
 * Supabase de mentira que responde las dos consultas del conteo: las secciones
 * de la plantilla y cuantos items cuelgan de ellas.
 */
function supabaseFalso(opciones: { sections: string[]; items: number }) {
  const llamadas: Array<{ tabla: string; filtros: Record<string, unknown> }> = [];

  const cliente = {
    llamadas,
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      llamadas.push({ tabla, filtros });

      // La consulta de conteo encadena .select(count).eq().in() y recién ahí
      // resuelve; la de secciones resuelve al await, después de los .eq().
      const contador = {
        eq: () => contador,
        in: () => Promise.resolve({ count: opciones.items, error: null }),
      };

      const cadena = {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) =>
          opts?.count ? contador : cadena,
        eq: () => cadena,
        then: (resolve: (valor: { data: Array<{ id: string }> }) => unknown) =>
          resolve({ data: opciones.sections.map((id) => ({ id })) }),
      };

      return cadena;
    },
  };

  return cliente as never;
}

describe("normalizePriority", () => {
  it("accepts low", () => {
    expect(normalizePriority("low")).toBe("low");
  });

  it("accepts medium", () => {
    expect(normalizePriority("medium")).toBe("medium");
  });

  it("accepts high", () => {
    expect(normalizePriority("high")).toBe("high");
  });

  it("normalizes uppercase", () => {
    expect(normalizePriority("HIGH")).toBe("high");
    expect(normalizePriority("LOW")).toBe("low");
  });

  it("trims whitespace before comparing", () => {
    expect(normalizePriority("  high  ")).toBe("high");
  });

  it("defaults to medium for unknown values", () => {
    expect(normalizePriority("urgent")).toBe("medium");
    expect(normalizePriority("")).toBe("medium");
    expect(normalizePriority("critical")).toBe("medium");
  });
});

describe("contarItemsDeLaPlantilla", () => {
  it("cuenta los ítems que cuelgan de las secciones de la plantilla", async () => {
    const total = await contarItemsDeLaPlantilla({
      supabase: supabaseFalso({ sections: ["sec-1", "sec-2"], items: 7 }),
      organizationId: "org-1",
      templateId: "tpl-1",
    });

    expect(total).toBe(7);
  });

  it("una plantilla sin secciones da cero, sin ir a buscar ítems", async () => {
    const supabase = supabaseFalso({ sections: [], items: 99 });
    const total = await contarItemsDeLaPlantilla({
      supabase,
      organizationId: "org-1",
      templateId: "tpl-1",
    });

    expect(total).toBe(0);
    expect((supabase as unknown as { llamadas: Array<{ tabla: string }> }).llamadas).toEqual([
      { tabla: "checklist_template_sections", filtros: {} },
    ]);
  });
});

describe("decideChecklistSectionUpdate", () => {
  it("defers a structural edit when the current cycle has responses and a future run", () => {
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: false,
      responsesInCurrentCycle: 2,
      recurrenceType: "daily",
      isActive: true,
    })).toBe("defer");
  });

  it("rejects a structural edit when there is no future cycle", () => {
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: false,
      responsesInCurrentCycle: 1,
      recurrenceType: "none",
      isActive: true,
    })).toBe("reject");
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: false,
      responsesInCurrentCycle: 1,
      recurrenceType: "daily",
      isActive: false,
    })).toBe("reject");
  });

  it("applies text edits and structural edits without current responses immediately", () => {
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: true,
      responsesInCurrentCycle: 3,
      recurrenceType: "daily",
      isActive: true,
    })).toBe("immediate");
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: false,
      responsesInCurrentCycle: 0,
      recurrenceType: "daily",
      isActive: true,
    })).toBe("immediate");
  });
});

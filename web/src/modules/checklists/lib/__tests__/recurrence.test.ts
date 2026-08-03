import { describe, expect, it } from "vitest";

import { etiquetaDeFrecuencia, frecuenciaDelChecklist } from "../recurrence";

/**
 * La frecuencia sale del reparto real, no del campo suelto.
 *
 * El caso que motiva esto: en produccion habia tres checklists activos que la
 * lista mostraba como "daily" y que no se repartieron nunca durante un mes.
 * repeat_every tiene DEFAULT 'daily', asi que decia "daily" aunque nadie
 * hubiera programado nada, y el cron -- que mira solo scheduled_jobs -- no
 * tenia que repartir. La pantalla afirmaba una cosa y el sistema hacia otra,
 * sin manera de notarlo.
 */

describe("frecuenciaDelChecklist", () => {
  it("sin reparto no se repite", () => {
    expect(frecuenciaDelChecklist(null)).toBe("none");
    expect(frecuenciaDelChecklist(undefined)).toBe("none");
  });

  it("toma la frecuencia del reparto", () => {
    expect(frecuenciaDelChecklist({ recurrence_type: "daily" })).toBe("daily");
    expect(frecuenciaDelChecklist({ recurrence_type: "weekly" })).toBe("weekly");
    expect(frecuenciaDelChecklist({ recurrence_type: "monthly" })).toBe("monthly");
    expect(frecuenciaDelChecklist({ recurrence_type: "yearly" })).toBe("yearly");
    expect(frecuenciaDelChecklist({ recurrence_type: "custom_days" })).toBe("custom_days");
  });

  it("un reparto con el tipo vacio no se repite", () => {
    expect(frecuenciaDelChecklist({ recurrence_type: "" })).toBe("none");
    expect(frecuenciaDelChecklist({ recurrence_type: "   " })).toBe("none");
    expect(frecuenciaDelChecklist({ recurrence_type: null })).toBe("none");
  });

  it("un tipo desconocido no se inventa una repeticion", () => {
    expect(frecuenciaDelChecklist({ recurrence_type: "cada tanto" })).toBe("none");
  });
});

describe("etiquetaDeFrecuencia", () => {
  it("sin reparto lo dice en vez de mostrar el campo suelto", () => {
    // Este es el punto: antes decia "daily" y no repartia nada.
    expect(etiquetaDeFrecuencia(null)).toBe("Sin repetición");
  });

  it("muestra la frecuencia en español, no el valor crudo", () => {
    expect(etiquetaDeFrecuencia({ recurrence_type: "daily" })).toBe("Diaria");
    expect(etiquetaDeFrecuencia({ recurrence_type: "weekly" })).toBe("Semanal");
    expect(etiquetaDeFrecuencia({ recurrence_type: "monthly" })).toBe("Mensual");
    expect(etiquetaDeFrecuencia({ recurrence_type: "yearly" })).toBe("Anual");
    expect(etiquetaDeFrecuencia({ recurrence_type: "custom_days" })).toBe("Días específicos");
  });
});

import { describe, expect, it } from "vitest";

import { syncChecklistScheduledJob } from "../checklist-template.service";

/**
 * El reparto programado de un checklist.
 *
 * Esto no tenia test y se rompio de verdad: la ruta del portal de empleado
 * guardaba repeat_every como texto y nunca creaba el scheduled_job, asi que el
 * checklist decia "Diaria" y no se repartia nunca. Verificado con datos: en dev
 * y prod, ningun checklist creado por un empleado tenia reparto.
 */

type Operacion =
  | { tipo: "update"; datos: Record<string, unknown>; id: string }
  | { tipo: "upsert"; datos: Record<string, unknown>; onConflict: string }
  | { tipo: "delete"; filtros: Record<string, string> };

/** Mock que registra lo que se le pide a scheduled_jobs. */
function supabaseFalso(jobExistente: { id: string } | null, writeError: { message: string } | null = null) {
  const operaciones: Operacion[] = [];

  function encadenable() {
    const filtros: Record<string, string> = {};
    const cadena = {
      select: () => cadena,
      eq: (columna: string, valor: string) => {
        filtros[columna] = valor;
        return cadena;
      },
      maybeSingle: async () => ({ data: jobExistente, error: null }),
      _filtros: filtros,
    };
    return cadena;
  }

  const cliente = {
    from: () => ({
      select: () => encadenable().select(),
      update: (datos: Record<string, unknown>) => {
        const c = encadenable();
        return {
          eq: (columna: string, valor: string) => {
            operaciones.push({ tipo: "update", datos, id: valor });
            return c.eq(columna, valor);
          },
        };
      },
      upsert: async (datos: Record<string, unknown>, options: { onConflict: string }) => {
        operaciones.push({ tipo: "upsert", datos, onConflict: options.onConflict });
        return { error: writeError };
      },
      delete: () => {
        const filtros: Record<string, string> = {};
        const cadena = {
          eq: (columna: string, valor: string) => {
            filtros[columna] = valor;
            operaciones.push({ tipo: "delete", filtros });
            return cadena;
          },
        };
        return cadena;
      },
    }),
  };

  return { cliente, operaciones };
}

type ClienteServicio = Parameters<typeof syncChecklistScheduledJob>[0]["supabase"];

async function sincronizar(opciones: {
  jobExistente?: { id: string } | null;
  recurrenceType?: string;
  customDays?: number[];
  isActive?: boolean;
}) {
  const { cliente, operaciones } = supabaseFalso(opciones.jobExistente ?? null);
  await syncChecklistScheduledJob({
    supabase: cliente as unknown as ClienteServicio,
    organizationId: "org-1",
    templateId: "tpl-1",
    recurrenceType: opciones.recurrenceType ?? "daily",
    customDays: opciones.customDays ?? [],
    isActive: opciones.isActive ?? true,
  });
  return operaciones;
}

describe("syncChecklistScheduledJob", () => {
  it("crea el reparto cuando el checklist es activo y tiene frecuencia", async () => {
    // El caso que fallaba: sin esto el checklist decia "Diaria" y no repartia.
    const ops = await sincronizar({ jobExistente: null });

    expect(ops).toHaveLength(1);
    expect(ops[0].tipo).toBe("upsert");
    const insert = ops[0] as Extract<Operacion, { tipo: "upsert" }>;
    expect(insert.datos.job_type).toBe("checklist_generator");
    expect(insert.datos.target_id).toBe("tpl-1");
    expect(insert.datos.organization_id).toBe("org-1");
    expect(insert.datos.recurrence_type).toBe("daily");
    expect(typeof insert.datos.next_run_at).toBe("string");
  });

  it("actualiza el reparto que ya existe en vez de duplicarlo", async () => {
    const ops = await sincronizar({ jobExistente: { id: "job-1" }, recurrenceType: "weekly", customDays: [1, 3] });

    expect(ops).toHaveLength(1);
    expect(ops[0].tipo).toBe("upsert");
    const update = ops[0] as Extract<Operacion, { tipo: "upsert" }>;
    expect(update.datos.recurrence_type).toBe("weekly");
    expect(update.datos.custom_days).toEqual([1, 3]);
    expect(update.onConflict).toBe("organization_id,job_type,target_id");
  });

  it("borra el reparto cuando le sacan la frecuencia", async () => {
    const ops = await sincronizar({ jobExistente: { id: "job-1" }, recurrenceType: "none" });

    expect(ops.some((op) => op.tipo === "delete")).toBe(true);
    expect(ops.some((op) => op.tipo === "upsert" || op.tipo === "update")).toBe(false);
  });

  it("borra el reparto cuando el checklist pasa a borrador", async () => {
    // Un borrador no se reparte, aunque tenga frecuencia elegida.
    const ops = await sincronizar({ jobExistente: { id: "job-1" }, isActive: false });

    expect(ops.some((op) => op.tipo === "delete")).toBe(true);
  });

  it("no crea nada si no hay frecuencia y tampoco habia reparto", async () => {
    const ops = await sincronizar({ jobExistente: null, recurrenceType: "none" });

    expect(ops.some((op) => op.tipo === "upsert" || op.tipo === "update")).toBe(false);
  });

  it("no crea nada si el checklist es borrador y no habia reparto", async () => {
    const ops = await sincronizar({ jobExistente: null, isActive: false });

    expect(ops.some((op) => op.tipo === "upsert" || op.tipo === "update")).toBe(false);
  });

  it("propaga un error al crear el reparto", async () => {
    const { cliente } = supabaseFalso(null, { message: "scheduled write failed" });
    const result = await syncChecklistScheduledJob({
      supabase: cliente as unknown as ClienteServicio,
      organizationId: "org-1",
      templateId: "tpl-1",
      recurrenceType: "daily",
      customDays: [],
      isActive: true,
    });

    expect(result).toEqual({ ok: false, message: "scheduled write failed" });
  });
});

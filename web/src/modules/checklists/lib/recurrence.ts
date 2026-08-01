/**
 * Cada cuanto se repite un checklist: de donde sale el dato de verdad.
 *
 * Hay dos lugares que dicen la frecuencia y no siempre coinciden:
 *
 *   checklist_templates.repeat_every   texto suelto, con DEFAULT 'daily'. Nadie
 *                                      lo lee para repartir nada.
 *   scheduled_jobs                     el reparto real. El cron
 *                                      (process-recurrence) mira SOLO esto.
 *
 * Como repeat_every viene en 'daily' por defecto, un checklist sin reparto
 * igual mostraba "daily" en la lista. Paso de verdad: tres checklists de un
 * cliente decian "daily" y no se repartieron nunca durante un mes, y no habia
 * forma de notarlo desde la pantalla.
 *
 * La regla es una sola: si no hay reparto programado, no se repite. Asi lo que
 * se ve es lo que el sistema hace, y un desfase queda a la vista en vez de
 * esconderse.
 */

import { createChecklistsTranslator } from "@/modules/checklists/checklists.i18n";

export type TipoDeFrecuencia = "none" | "daily" | "weekly" | "monthly";

/** Lo que se le muestra a la persona, igual que en el selector de recurrencia. */
export const ETIQUETA_DE_FRECUENCIA: Record<TipoDeFrecuencia, string> = {
  none: "Sin repetición",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
};

const TIPOS: TipoDeFrecuencia[] = ["none", "daily", "weekly", "monthly"];

/**
 * La frecuencia real de un checklist.
 *
 * Sin reparto programado la respuesta es "none", tenga repeat_every lo que
 * tenga: el cron no lo va a repartir.
 */
export function frecuenciaDelChecklist(
  scheduledJob: { recurrence_type?: string | null } | null | undefined,
): TipoDeFrecuencia {
  const tipo = scheduledJob?.recurrence_type?.trim();
  if (!tipo) return "none";
  return (TIPOS as string[]).includes(tipo) ? (tipo as TipoDeFrecuencia) : "none";
}

/**
 * La frecuencia real, ya lista para mostrar.
 *
 * El texto sale del diccionario del modulo (checklists.i18n.ts). Hoy ninguna
 * pantalla pasa locale porque el modulo solo esta habilitado en tenants de
 * plataforma, que son en español; cuando haga falta, se pasa y ya esta
 * traducido.
 */
export function etiquetaDeFrecuencia(
  scheduledJob: { recurrence_type?: string | null } | null | undefined,
  locale?: "es" | "en",
): string {
  return createChecklistsTranslator(locale)(
    ETIQUETA_DE_FRECUENCIA[frecuenciaDelChecklist(scheduledJob)],
  );
}

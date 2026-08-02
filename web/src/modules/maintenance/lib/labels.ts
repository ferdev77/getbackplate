import type { MaintenanceStatus } from "@/modules/maintenance/types";

/**
 * Como se nombran en español los estados y las prioridades.
 *
 * Vive aparte porque lo necesitan dos lugares que antes no lo compartian: la
 * pantalla de mantenimiento y los avisos (push y campanita). Los avisos
 * interpolaban el valor crudo de la base, asi que a un cliente de plataforma le
 * llegaba "Paso a resolved" y "Prioridad high" en vez de "Resuelta" y "Alta".
 *
 * Si manda un valor que no esta en la tabla, se devuelve tal cual: es preferible
 * mostrar algo raro a mostrar un hueco.
 */

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  draft: "Borrador",
  submitted: "Enviada",
  visit_scheduled: "Visita programada",
  in_progress: "En progreso",
  needs_parts: "Requiere repuesto",
  needs_followup: "Requiere otra visita",
  resolved: "Resuelta",
  cancelled: "Cancelada",
};

export const MAINTENANCE_PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export function estadoEnPalabras(status: string | null | undefined) {
  if (!status) return "";
  return MAINTENANCE_STATUS_LABELS[status as MaintenanceStatus] ?? status;
}

export function prioridadEnPalabras(priority: string | null | undefined) {
  if (!priority) return "";
  return MAINTENANCE_PRIORITY_LABELS[priority] ?? priority;
}

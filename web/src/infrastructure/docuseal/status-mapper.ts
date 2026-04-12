/**
 * status-mapper.ts
 * Fuente única de verdad para mapear el status crudo de DocuSeal
 * al status interno de la app.
 *
 * NO duplicar esta lógica en otros archivos.
 * Importar desde: @/infrastructure/docuseal/status-mapper
 */

export type DocusealInternalStatus =
  | "requested"
  | "viewed"
  | "completed"
  | "declined"
  | "expired"
  | "failed";

/**
 * Mapea el status crudo de DocuSeal (o event_type) al status interno.
 *
 * DocuSeal puede enviar:
 *  - Strings directos: "completed", "declined", "expired", "pending", "sent", "opened", "viewed"
 *  - Event types con puntos: "submission.completed", "form.viewed"
 *  - Null/undefined cuando el campo no está presente
 */
export function mapDocusealStatus(
  value: string | null | undefined,
): DocusealInternalStatus {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();

  // Extraer la parte final si viene con punto (e.g. "submission.completed" → "completed")
  const status = raw.includes(".") ? (raw.split(".").pop() ?? raw) : raw;

  if (status === "completed") return "completed";
  if (status === "declined") return "declined";
  if (status === "expired") return "expired";

  // "viewed" y "opened" son el mismo concepto (el empleado abrió el formulario)
  if (status === "viewed" || status === "opened") return "viewed";

  // Estados que indican que la solicitud está activa pero sin acción del empleado aún
  if (
    status === "pending" ||
    status === "sent" ||
    status === "in_progress" ||
    status === "started" ||
    status === "created"
  ) {
    return "requested";
  }

  return "failed";
}

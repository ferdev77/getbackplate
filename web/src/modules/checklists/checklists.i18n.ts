/**
 * Diccionario español → inglés del módulo de checklists.
 *
 * Misma convención que company-shell.i18n.ts, settings.i18n.ts y
 * qbo-r365.i18n.ts: el español es la clave y se usa vía t("texto en español").
 * Si el locale es "en" devuelve la traducción; si no está en el diccionario,
 * devuelve la clave tal cual, así nunca queda un hueco vacío en pantalla.
 *
 * Quién ve inglés lo decide resolveUserLocale: los planes de integración son
 * inglés por contrato y las empresas solo de plataforma ven español mexicano.
 *
 * Este diccionario nació porque siete mensajes del servicio estaban escritos
 * en inglés a mano, así que un cliente de plataforma leía "Unable to delete
 * checklist" y no había forma de traducirlo sin reescribirlo.
 */
export const CHECKLISTS_EN: Record<string, string> = {
  // ── Validaciones al guardar ───────────────────────────────────
  "Ingresa un nombre para el checklist": "Enter a name for the checklist",
  "Agrega al menos un ítem": "Add at least one item",
  "La locación base no pertenece a esta organización":
    "The base location does not belong to this organization",
  "El departamento base no pertenece a esta organización":
    "The base department does not belong to this organization",
  "No se encontró el checklist que se quiere editar": "The checklist you are trying to edit was not found",

  // ── Errores al guardar ────────────────────────────────────────
  "No se pudo crear el checklist": "Unable to create the checklist",
  "No se pudo verificar el estado del checklist": "Unable to check the checklist status",
  "No se pudieron guardar los cambios pendientes": "Unable to save the pending changes",
  "No se pudo actualizar el reparto del checklist": "Unable to update the checklist schedule",
  "No se pudieron reemplazar los ítems del checklist": "Unable to replace the checklist items",
  "No se pudieron reemplazar las secciones del checklist": "Unable to replace the checklist sections",
  "El checklist se guardó, pero falló una sección": "The checklist was saved, but a section failed",
  "El checklist se guardó, pero fallaron los ítems": "The checklist was saved, but the items failed",
  "El checklist recibió una respuesta mientras se editaba. Vuelve a intentarlo para aplicar los cambios de forma segura.":
    "The checklist changed while you were editing it. Try again to apply the changes safely.",
  "No se pueden cambiar los ítems: este checklist ya tiene {n} {respuestas} y no tiene una frecuencia definida, así que no hay un próximo reparto donde aplicarlos sin mezclar los resultados. Puedes duplicarlo como un checklist nuevo o asignarle una frecuencia y editarlo después.":
    "The items cannot be changed: this checklist already has {n} {respuestas} and no frequency set, so there is no next run to apply them to without mixing the results. You can duplicate it as a new checklist, or set a frequency and edit it afterwards.",

  "Algunas locaciones seleccionadas no son válidas": "Some selected scope locations are invalid",
  "Algunos departamentos seleccionados no son válidos": "Some selected scope departments are invalid",
  "Algunos puestos seleccionados no son válidos": "Some selected scope positions are invalid",
  "Algunos usuarios seleccionados no son válidos": "Some selected users are invalid",

  // ── Borrado ───────────────────────────────────────────────────
  "No se encontró el checklist": "Checklist not found",
  "No se pudo verificar el historial del checklist": "Unable to check the checklist history",
  "No se pudieron borrar los ítems": "Unable to delete the items",
  "No se pudieron borrar las secciones": "Unable to delete the sections",
  "No se pudo borrar el checklist": "Unable to delete the checklist",
  "Checklist eliminado.": "Checklist deleted.",
  // {n} y {respuestas} se reemplazan en el servicio: el orden de las palabras
  // cambia entre idiomas, asi que la frase se traduce entera y no por partes.
  "Se conservan {n} {respuestas} en el historial.": "{n} {respuestas} were kept in the history.",
  "respuesta": "response",
  "respuestas": "responses",

  // ── Frecuencia (modules/checklists/lib/recurrence.ts) ─────────
  "Sin repetición": "No repeat",
  "Diaria": "Daily",
  "Semanal": "Weekly",
  "Mensual": "Monthly",
  "Anual": "Yearly",
  "Días específicos": "Specific days",
};

export function createChecklistsTranslator(locale: "es" | "en" | undefined) {
  return function t(spanish: string): string {
    return locale === "en" ? (CHECKLISTS_EN[spanish] ?? spanish) : spanish;
  };
}

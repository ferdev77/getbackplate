/**
 * Diccionario español → inglés de los avisos (push y campanita).
 *
 * Misma convención que checklists.i18n.ts, settings.i18n.ts y los demás: el
 * español es la clave y se usa vía t("texto en español"). Si el locale es "en"
 * devuelve la traducción; si no está en el diccionario, devuelve la clave tal
 * cual, así nunca queda un aviso vacío.
 *
 * Quién ve inglés lo decide resolveUserLocale, con el idioma de la empresa: los
 * planes de integración son inglés por contrato y el resto ve español. No se
 * mira preferencia por persona a propósito -- el portal del empleado, que es
 * quien recibe la mayoría de estos avisos, no tiene dónde elegirla.
 *
 * Este diccionario nació porque los avisos de proveedores, documentos de
 * empleado y cambio de puesto se escribieron directo en inglés, y caían en
 * empresas que reciben todo lo demás en español: la persona veía "New vendor
 * added" entre "Nuevo checklist" y "Nueva solicitud de mantenimiento".
 *
 * Los textos con datos adentro llevan marcadores entre llaves y se completan
 * después de traducir, para que la clave siga siendo un texto fijo.
 */
export const NOTIFICATIONS_EN: Record<string, string> = {
  // ── Proveedores ───────────────────────────────────────────────
  "Nuevo proveedor": "New vendor added",
  "Proveedor actualizado": "Vendor updated",
  "Proveedor desactivado": "Vendor deactivated",
  "Proveedor eliminado": "Vendor deleted",

  // ── Documentos de empleado ────────────────────────────────────
  "Te pidieron un documento": "New document requested",
  'Te pidieron "{documento}".': '"{documento}" was requested from you.',

  "Documento aprobado": "Document approved",
  "Documento rechazado": "Document rejected",
  'Se aprobó "{documento}".': '"{documento}" was approved.',
  'Se rechazó "{documento}".': '"{documento}" was rejected.',
  '"{documento}": {comentario}': '"{documento}": {comentario}',

  "Nuevo documento en tu legajo": "New document added to your file",
  'Se agregó "{documento}" a tu legajo.': '"{documento}" was added to your employee file.',

  "Hay un documento para revisar": "Document submitted for review",
  '{persona} subió "{documento}".': '{persona} uploaded "{documento}".',

  // ── Puesto y departamento ─────────────────────────────────────
  "Cambió tu puesto": "Your role was updated",
  "Puesto: {puesto}": "Position: {puesto}",
  "Departamento: {departamento}": "Department: {departamento}",
};

export function createNotificationsTranslator(locale: "es" | "en" | undefined) {
  return function t(spanish: string, valores?: Record<string, string>): string {
    const texto = locale === "en" ? (NOTIFICATIONS_EN[spanish] ?? spanish) : spanish;
    if (!valores) return texto;

    return Object.entries(valores).reduce(
      (acumulado, [clave, valor]) => acumulado.split(`{${clave}}`).join(valor),
      texto,
    );
  };
}

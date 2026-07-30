/**
 * Formato unico de las secciones de un checklist.
 *
 * Cada item lleva el id de la plantilla cuando ya existia (`id`) o `null` cuando
 * es nuevo. Ese id es lo que permite distinguir con exactitud un renombre de un
 * alta o una baja: sin el, la unica pista era la cantidad de items, y cambiar un
 * item por otro distinto manteniendo la cantidad se leia como renombre.
 *
 * Se acepta tambien la forma vieja (items como texto suelto) porque quedan
 * `pending_sections` guardados con ese formato y porque la API es publica.
 */

export type ChecklistSectionItem = {
  /** Id del item en checklist_template_items, o null si es nuevo. */
  id: string | null;
  text: string;
};

export type ChecklistSection = {
  name: string;
  items: ChecklistSectionItem[];
};

const MAX_SECTIONS = 20;

function readItem(raw: unknown): ChecklistSectionItem | null {
  if (typeof raw === "string") {
    const text = raw.trim();
    return text ? { id: null, text } : null;
  }

  if (typeof raw === "object" && raw !== null) {
    const row = raw as { id?: unknown; text?: unknown; label?: unknown };
    const source = typeof row.text === "string" ? row.text : typeof row.label === "string" ? row.label : "";
    const text = source.trim();
    if (!text) return null;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
    return { id, text };
  }

  return null;
}

/** Normaliza cualquiera de las dos formas a `ChecklistSection[]`. */
export function parseChecklistSections(raw: unknown): ChecklistSection[] {
  const source = typeof raw === "string" ? safeJson(raw) : raw;
  if (!Array.isArray(source)) return [];

  return source
    .map((section) => {
      const row = (typeof section === "object" && section !== null ? section : {}) as {
        name?: unknown;
        items?: unknown;
      };
      const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : "General";
      const items = Array.isArray(row.items)
        ? row.items.map(readItem).filter((item): item is ChecklistSectionItem => item !== null)
        : [];
      return { name, items };
    })
    .filter((section) => section.items.length > 0)
    .slice(0, MAX_SECTIONS);
}

function safeJson(raw: string) {
  const value = raw.trim();
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Todos los textos, en orden, para el campo plano `items`. */
export function flattenChecklistSectionTexts(sections: ChecklistSection[]) {
  return sections.flatMap((section) => section.items.map((item) => item.text));
}

/**
 * Comparacion exacta entre lo guardado y lo que llega del formulario.
 *
 * Es "solo texto" cuando no viene ningun item nuevo, no falta ninguno de los
 * que ya existian, y las secciones siguen siendo las mismas en nombre y en
 * cantidad. Cualquier alta o baja rompe una de esas tres condiciones.
 */
export function isTextOnlyChecklistEdit(input: {
  previousSections: Array<{ name: string; itemIds: string[] }>;
  nextSections: ChecklistSection[];
}) {
  const { previousSections, nextSections } = input;
  if (previousSections.length === 0) return false;
  if (previousSections.length !== nextSections.length) return false;

  const sameStructure = previousSections.every(
    (section, index) =>
      section.name === nextSections[index].name &&
      section.itemIds.length === nextSections[index].items.length,
  );
  if (!sameStructure) return false;

  const submittedIds = new Set<string>();
  for (const section of nextSections) {
    for (const item of section.items) {
      // Un item sin id es nuevo: es un alta, no un renombre.
      if (!item.id) return false;
      submittedIds.add(item.id);
    }
  }

  const previousIds = previousSections.flatMap((section) => section.itemIds);
  if (previousIds.length !== submittedIds.size) return false;
  return previousIds.every((id) => submittedIds.has(id));
}

/**
 * Las etiquetas de una seccion, en orden.
 *
 * Existe para que nadie vuelva a escribir `label: item` sobre un item que es un
 * objeto: al recorrer strings, pasar el objeto entero deja de ser posible. Es el
 * error que se colo al cambiar el formato de los items, y que ni el compilador
 * detecto porque el cliente admin no tipa el insert.
 */
export function sectionItemLabels(section: ChecklistSection): string[] {
  return section.items.map((item) => item.text);
}

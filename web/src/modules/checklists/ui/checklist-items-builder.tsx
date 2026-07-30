"use client";

import { ListChecks, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { TooltipLabel } from "@/shared/ui/tooltip";

type SectionInput = {
  name: string;
  /**
   * Texto suelto para un checklist nuevo; con `{ id, label }` cuando se esta
   * editando, para que el id real del item viaje de vuelta y el servidor pueda
   * distinguir un renombre de un alta (ver isTextOnlyChecklistEdit).
   */
  items: Array<string | { id: string | null; label: string }>;
};

type ChecklistItemsBuilderProps = {
  initialSections: SectionInput[];
};

type LocalSection = {
  id: string;
  name: string;
  /** `key` es solo para React; `id` es el del item en la plantilla, o null. */
  items: Array<{ key: string; id: string | null; text: string }>;
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ChecklistItemsBuilder({ initialSections }: ChecklistItemsBuilderProps) {
  const [sections, setSections] = useState<LocalSection[]>(() => {
    const source = initialSections.length
      ? initialSections
      : [{ name: "General", items: [""] }];

    return source.map((section) => ({
      id: makeId("sec"),
      name: section.name || "General",
      items: (section.items.length ? section.items : [""]).map((item) => ({
        key: makeId("item"),
        id: typeof item === "string" ? null : item.id,
        text: typeof item === "string" ? item : item.label,
      })),
    }));
  });

  const flattenedItems = useMemo(
    () =>
      sections
        .flatMap((section) => section.items)
        .map((item) => item.text.trim())
        .filter(Boolean),
    [sections],
  );

  const serializedSections = useMemo(() => {
    return JSON.stringify(
      sections
        .map((section) => ({
          name: section.name.trim() || "General",
          items: section.items
            .map((item) => ({ id: item.id, text: item.text.trim() }))
            .filter((item) => item.text !== ""),
        }))
        .filter((section) => section.items.length > 0),
    );
  }, [sections]);

  function addSection() {
    setSections((prev) => [
      ...prev,
      {
        id: makeId("sec"),
        name: `Seccion ${prev.length + 1}`,
        items: [{ key: makeId("item"), id: null, text: "" }],
      },
    ]);
  }

  function removeSection(sectionId: string) {
    setSections((prev) => (prev.length > 1 ? prev.filter((section) => section.id !== sectionId) : prev));
  }

  function updateSectionName(sectionId: string, value: string) {
    setSections((prev) =>
      prev.map((section) => (section.id === sectionId ? { ...section, name: value } : section)),
    );
  }

  function addItem(sectionId: string) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? { ...section, items: [...section.items, { key: makeId("item"), id: null, text: "" }] }
          : section,
      ),
    );
  }

  function removeItem(sectionId: string, itemKey: string) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        if (section.items.length <= 1) return section;
        return { ...section, items: section.items.filter((item) => item.key !== itemKey) };
      }),
    );
  }

  function updateItem(sectionId: string, itemKey: string, value: string) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.key === itemKey ? { ...item, text: value } : item,
              ),
            }
          : section,
      ),
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.id} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
          <div className="mb-2 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-[var(--gbp-muted)]" />
            <input
              value={section.name}
              onChange={(event) => updateSectionName(section.id, event.target.value)}
              className="h-8 flex-1 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]"
              placeholder="Nombre de sección"
            />
            <button
              type="button"
              onClick={() => removeSection(section.id)}
              className="group/tooltip relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
            >
              <X className="h-4 w-4" />
              <TooltipLabel label="Eliminar sección" />
            </button>
          </div>

          <div className="space-y-1.5">
            {section.items.map((item) => (
              <div key={item.key} className="flex items-center gap-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2.5 py-2">
                <span className="text-xs text-[var(--gbp-muted)]">⠿</span>
                <input type="checkbox" disabled className="h-3.5 w-3.5 accent-[var(--gbp-accent)]" />
                <input
                  value={item.text}
                  onChange={(event) => updateItem(section.id, item.key, event.target.value)}
                  className="h-8 flex-1 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]"
                  placeholder="Descripcion del item..."
                />
                <button
                  type="button"
                  onClick={() => removeItem(section.id, item.key)}
                  className="group/tooltip relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                >
                  <X className="h-4 w-4" />
                  <TooltipLabel label="Eliminar item" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => addItem(section.id)}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar item
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addSection}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar sección
      </button>

      <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs text-[var(--gbp-text2)]">
        Vista previa: {flattenedItems.length} item(s) listos para guardar.
      </div>

      <input type="hidden" name="sections_payload" value={serializedSections} />
      <textarea name="items" value={flattenedItems.join("\n")} readOnly className="hidden" />
    </div>
  );
}

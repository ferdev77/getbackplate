"use client";

import { ListChecks, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

type SectionInput = {
  name: string;
  items: string[];
};

type ChecklistItemsBuilderProps = {
  initialSections: SectionInput[];
};

type LocalSection = {
  id: string;
  name: string;
  items: Array<{ id: string; text: string }>;
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
      items: (section.items.length ? section.items : [""]).map((text) => ({
        id: makeId("item"),
        text,
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
          items: section.items.map((item) => item.text.trim()).filter(Boolean),
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
        items: [{ id: makeId("item"), text: "" }],
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
          ? { ...section, items: [...section.items, { id: makeId("item"), text: "" }] }
          : section,
      ),
    );
  }

  function removeItem(sectionId: string, itemId: string) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        if (section.items.length <= 1) return section;
        return { ...section, items: section.items.filter((item) => item.id !== itemId) };
      }),
    );
  }

  function updateItem(sectionId: string, itemId: string, value: string) {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, text: value } : item,
              ),
            }
          : section,
      ),
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.id} className="rounded-xl border border-[#ece4df] bg-[#fffdfa] p-3">
          <div className="mb-2 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-[#b4aaa4]" />
            <input
              value={section.name}
              onChange={(event) => updateSectionName(section.id, event.target.value)}
              className="h-8 flex-1 rounded-lg border border-[#ddd3ce] bg-white px-3 text-sm"
              placeholder="Nombre de seccion"
            />
            <button
              type="button"
              onClick={() => removeSection(section.id)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#eaded8] bg-white text-[#8f847d] hover:bg-[#f8f3f1]"
              title="Eliminar seccion"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            {section.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-[#f0e8e3] bg-white px-2.5 py-2">
                <span className="text-xs text-[#c3b9b3]">⠿</span>
                <input type="checkbox" disabled className="h-3.5 w-3.5 accent-[#c0392b]" />
                <input
                  value={item.text}
                  onChange={(event) => updateItem(section.id, item.id, event.target.value)}
                  className="h-8 flex-1 rounded-lg border border-[#ddd3ce] bg-white px-3 text-sm"
                  placeholder="Descripcion del item..."
                />
                <button
                  type="button"
                  onClick={() => removeItem(section.id, item.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#eaded8] bg-white text-[#8f847d] hover:bg-[#f8f3f1]"
                  title="Eliminar item"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => addItem(section.id)}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[#e8ddd8] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#5b524d] hover:bg-[#f8f3f1]"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar item
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addSection}
        className="inline-flex items-center gap-1 rounded-lg border border-[#e8ddd8] bg-white px-3 py-2 text-xs font-semibold text-[#5b524d] hover:bg-[#f8f3f1]"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar seccion
      </button>

      <div className="rounded-lg border border-[#eee7e2] bg-[#faf7f5] px-3 py-2 text-xs text-[#7d736d]">
        Vista previa: {flattenedItems.length} item(s) listos para guardar.
      </div>

      <input type="hidden" name="sections_payload" value={serializedSections} />
      <textarea name="items" value={flattenedItems.join("\n")} readOnly className="hidden" />
    </div>
  );
}

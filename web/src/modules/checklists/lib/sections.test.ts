import { describe, expect, it } from "vitest";

import {
  flattenChecklistSectionTexts,
  isTextOnlyChecklistEdit,
  parseChecklistSections,
  sectionItemLabels,
} from "@/modules/checklists/lib/sections";

describe("parseChecklistSections", () => {
  it("lee la forma nueva, con el id de cada item", () => {
    const sections = parseChecklistSections(
      JSON.stringify([{ name: "Cámaras", items: [{ id: "it-1", text: "Revisar temperatura" }] }]),
    );
    expect(sections).toEqual([{ name: "Cámaras", items: [{ id: "it-1", text: "Revisar temperatura" }] }]);
  });

  it("lee la forma vieja, con items como texto suelto", () => {
    // Quedan pending_sections guardados asi, y la API es publica.
    const sections = parseChecklistSections(JSON.stringify([{ name: "Cámaras", items: ["Revisar temperatura"] }]));
    expect(sections).toEqual([{ name: "Cámaras", items: [{ id: null, text: "Revisar temperatura" }] }]);
  });

  it("acepta `label` ademas de `text`", () => {
    const sections = parseChecklistSections([{ name: "A", items: [{ id: "it-1", label: "Uno" }] }]);
    expect(sections[0].items[0]).toEqual({ id: "it-1", text: "Uno" });
  });

  it("descarta items vacios y secciones que quedan sin items", () => {
    const sections = parseChecklistSections([
      { name: "A", items: ["", "   ", { id: "it-1", text: "  " }] },
      { name: "B", items: ["Vale"] },
    ]);
    expect(sections).toEqual([{ name: "B", items: [{ id: null, text: "Vale" }] }]);
  });

  it("nombra General a la seccion sin nombre", () => {
    expect(parseChecklistSections([{ items: ["Uno"] }])[0].name).toBe("General");
  });

  it("devuelve vacio ante un JSON invalido o un tipo inesperado", () => {
    expect(parseChecklistSections("{no es json")).toEqual([]);
    expect(parseChecklistSections("")).toEqual([]);
    expect(parseChecklistSections(null)).toEqual([]);
    expect(parseChecklistSections(42)).toEqual([]);
  });

  it("corta en 20 secciones", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `S${i}`, items: ["x"] }));
    expect(parseChecklistSections(many)).toHaveLength(20);
  });

  it("un id vacio cuenta como item nuevo", () => {
    expect(parseChecklistSections([{ name: "A", items: [{ id: "   ", text: "Uno" }] }])[0].items[0].id).toBeNull();
  });
});

describe("flattenChecklistSectionTexts", () => {
  it("devuelve los textos en orden", () => {
    const sections = parseChecklistSections([
      { name: "A", items: ["Uno", "Dos"] },
      { name: "B", items: ["Tres"] },
    ]);
    expect(flattenChecklistSectionTexts(sections)).toEqual(["Uno", "Dos", "Tres"]);
  });
});

describe("isTextOnlyChecklistEdit", () => {
  const previo = [{ name: "Cámaras", itemIds: ["it-1", "it-2"] }];

  it("renombrar un item es solo texto", () => {
    const result = isTextOnlyChecklistEdit({
      previousSections: previo,
      nextSections: [
        {
          name: "Cámaras",
          items: [
            { id: "it-1", text: "Revisar EXTINTORES" },
            { id: "it-2", text: "Controlar stock" },
          ],
        },
      ],
    });
    expect(result).toBe(true);
  });

  it("renombrar la seccion no es solo texto", () => {
    // El reporte agrupa por seccion, asi que el cambio se difiere.
    const result = isTextOnlyChecklistEdit({
      previousSections: previo,
      nextSections: [
        {
          name: "Heladeras",
          items: [
            { id: "it-1", text: "a" },
            { id: "it-2", text: "b" },
          ],
        },
      ],
    });
    expect(result).toBe(false);
  });

  it("agregar un item no es solo texto", () => {
    const result = isTextOnlyChecklistEdit({
      previousSections: previo,
      nextSections: [
        {
          name: "Cámaras",
          items: [
            { id: "it-1", text: "a" },
            { id: "it-2", text: "b" },
            { id: null, text: "nuevo" },
          ],
        },
      ],
    });
    expect(result).toBe(false);
  });

  it("quitar un item no es solo texto", () => {
    const result = isTextOnlyChecklistEdit({
      previousSections: previo,
      nextSections: [{ name: "Cámaras", items: [{ id: "it-1", text: "a" }] }],
    });
    expect(result).toBe(false);
  });

  it("cambiar un item por otro nuevo manteniendo la cantidad no es solo texto", () => {
    // Este es el caso que la comparacion por cantidades leia mal como renombre:
    // ahora el item nuevo no trae id y se detecta.
    const result = isTextOnlyChecklistEdit({
      previousSections: previo,
      nextSections: [
        {
          name: "Cámaras",
          items: [
            { id: "it-1", text: "a" },
            { id: null, text: "otro distinto" },
          ],
        },
      ],
    });
    expect(result).toBe(false);
  });

  it("mover un item a otra seccion no es solo texto", () => {
    const result = isTextOnlyChecklistEdit({
      previousSections: [
        { name: "A", itemIds: ["it-1", "it-2"] },
        { name: "B", itemIds: ["it-3"] },
      ],
      nextSections: [
        { name: "A", items: [{ id: "it-1", text: "a" }] },
        {
          name: "B",
          items: [
            { id: "it-3", text: "c" },
            { id: "it-2", text: "b" },
          ],
        },
      ],
    });
    expect(result).toBe(false);
  });

  it("un id repetido no puede tapar una baja", () => {
    // Dos items apuntando al mismo id dejarian el conjunto con un elemento menos
    // que la cantidad anterior: se difiere.
    const result = isTextOnlyChecklistEdit({
      previousSections: previo,
      nextSections: [
        {
          name: "Cámaras",
          items: [
            { id: "it-1", text: "a" },
            { id: "it-1", text: "a otra vez" },
          ],
        },
      ],
    });
    expect(result).toBe(false);
  });

  it("una plantilla sin secciones previas nunca es solo texto", () => {
    const result = isTextOnlyChecklistEdit({
      previousSections: [],
      nextSections: [{ name: "A", items: [{ id: "it-1", text: "a" }] }],
    });
    expect(result).toBe(false);
  });

  it("agregar una seccion no es solo texto", () => {
    const result = isTextOnlyChecklistEdit({
      previousSections: previo,
      nextSections: [
        {
          name: "Cámaras",
          items: [
            { id: "it-1", text: "a" },
            { id: "it-2", text: "b" },
          ],
        },
        { name: "Nueva", items: [{ id: null, text: "x" }] },
      ],
    });
    expect(result).toBe(false);
  });
});

describe("sectionItemLabels", () => {
  it("devuelve texto, nunca el item entero", () => {
    // Este es el caso que se rompio en produccion de codigo: al cambiar el
    // formato de los items, un lugar siguio guardando `label: item` y el objeto
    // entero terminaba en la columna de texto. Recorriendo etiquetas ya no se
    // puede escribir mal.
    const labels = sectionItemLabels({
      name: "Cámaras",
      items: [
        { id: "it-1", text: "Revisar temperatura" },
        { id: null, text: "Controlar stock" },
      ],
    });

    expect(labels).toEqual(["Revisar temperatura", "Controlar stock"]);
    for (const label of labels) {
      expect(typeof label).toBe("string");
    }
  });

  it("respeta el orden", () => {
    const labels = sectionItemLabels({
      name: "A",
      items: [
        { id: null, text: "primero" },
        { id: null, text: "segundo" },
        { id: null, text: "tercero" },
      ],
    });
    expect(labels).toEqual(["primero", "segundo", "tercero"]);
  });

  it("una seccion sin items no aporta etiquetas", () => {
    expect(sectionItemLabels({ name: "Vacía", items: [] })).toEqual([]);
  });
});

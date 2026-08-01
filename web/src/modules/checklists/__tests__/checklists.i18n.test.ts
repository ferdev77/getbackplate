import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CHECKLISTS_EN, createChecklistsTranslator } from "../checklists.i18n";

/**
 * El diccionario del modulo de checklists.
 *
 * Existe porque siete mensajes estaban escritos en ingles a mano dentro del
 * servicio, asi que un cliente de plataforma leia "Unable to delete checklist"
 * y no habia forma de traducirlo sin reescribirlo. Ahora el español es la clave
 * y el ingles sale de aca.
 */

describe("createChecklistsTranslator", () => {
  it("en español devuelve el texto tal cual", () => {
    const t = createChecklistsTranslator("es");
    expect(t("No se pudo borrar el checklist")).toBe("No se pudo borrar el checklist");
  });

  it("en inglés traduce los mensajes del servicio", () => {
    const t = createChecklistsTranslator("en");
    expect(t("No se pudo borrar el checklist")).toBe("Unable to delete the checklist");
    expect(t("Poné un nombre para el checklist")).toBe("Enter a name for the checklist");
    expect(t("Checklist eliminado.")).toBe("Checklist deleted.");
  });

  it("sin locale se comporta como español", () => {
    expect(createChecklistsTranslator(undefined)("Diaria")).toBe("Diaria");
  });

  it("un texto que no está en el diccionario no desaparece", () => {
    // Preferible mostrar español en una pantalla en inglés que un hueco vacío.
    expect(createChecklistsTranslator("en")("Texto todavía sin traducir")).toBe(
      "Texto todavía sin traducir",
    );
  });

  it("traduce las frecuencias", () => {
    const t = createChecklistsTranslator("en");
    expect(t("Sin repetición")).toBe("No repeat");
    expect(t("Diaria")).toBe("Daily");
    expect(t("Semanal")).toBe("Weekly");
    expect(t("Mensual")).toBe("Monthly");
  });

  it("la frase con cantidad conserva sus dos huecos", () => {
    // Se traduce entera porque el orden de las palabras cambia entre idiomas.
    const traducida = CHECKLISTS_EN["Se conservan {n} {respuestas} en el historial."];
    expect(traducida).toContain("{n}");
    expect(traducida).toContain("{respuestas}");
  });
});

/**
 * Guardia: todo texto que el servicio le muestra a la persona tiene que pasar
 * por el traductor y estar en el diccionario. Sin esto, alcanza con que alguien
 * escriba un mensaje suelto para que vuelva el problema original.
 */
describe("el servicio no tiene mensajes fuera del diccionario", () => {
  // __tests__ -> checklists
  const SERVICIO = path.join(
    __dirname,
    "..",
    "services",
    "checklist-template.service.ts",
  );

  it("cada mensaje al usuario usa t() y está traducido", () => {
    const contenido = readFileSync(SERVICIO, "utf8");

    // Los textos que se le devuelven a la persona, con o sin comillas: se
    // buscan tanto "..." como `...`, que es justo lo que se habia escapado.
    const sueltos: string[] = [];
    for (const m of contenido.matchAll(/message:\s*(?:"([^"]{4,})"|`([^`]{4,})`)/g)) {
      const texto = m[1] ?? m[2] ?? "";
      if (!texto.includes("t(")) sueltos.push(texto);
    }

    expect(
      sueltos,
      "Estos mensajes no pasan por el traductor. Escribilos en español, pasalos " +
        "por t() y sumalos a CHECKLISTS_EN:\n  " + sueltos.join("\n  "),
    ).toEqual([]);

    const claves: string[] = [];
    for (const m of contenido.matchAll(/\bt\("([^"]+)"\)/g)) claves.push(m[1]);

    expect(claves.length, "el servicio dejo de usar el traductor").toBeGreaterThan(10);

    const faltan = claves.filter((clave) => !(clave in CHECKLISTS_EN));
    expect(
      faltan,
      "Estas claves se traducen en el servicio pero no están en CHECKLISTS_EN, " +
        "asi que en inglés se verían en español:\n  " + faltan.join("\n  "),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { NOTIFICATIONS_EN, createNotificationsTranslator } from "../notifications.i18n";

describe("createNotificationsTranslator", () => {
  it("en español devuelve la clave tal cual", () => {
    const t = createNotificationsTranslator("es");
    expect(t("Nuevo proveedor")).toBe("Nuevo proveedor");
  });

  it("en inglés devuelve la traducción", () => {
    const t = createNotificationsTranslator("en");
    expect(t("Nuevo proveedor")).toBe("New vendor added");
    expect(t("Cambió tu puesto")).toBe("Your role was updated");
  });

  it("sin locale se comporta como español", () => {
    const t = createNotificationsTranslator(undefined);
    expect(t("Documento aprobado")).toBe("Documento aprobado");
  });

  it("un texto que no está en el diccionario sale tal cual, sin dejar el aviso vacío", () => {
    const t = createNotificationsTranslator("en");
    expect(t("Un aviso que nadie tradujo todavía")).toBe("Un aviso que nadie tradujo todavía");
  });

  it("completa los datos después de traducir, en los dos idiomas", () => {
    expect(
      createNotificationsTranslator("es")('Te pidieron "{documento}".', { documento: "Contrato" }),
    ).toBe('Te pidieron "Contrato".');

    expect(
      createNotificationsTranslator("en")('Te pidieron "{documento}".', { documento: "Contrato" }),
    ).toBe('"Contrato" was requested from you.');
  });

  it("reemplaza el mismo marcador todas las veces que aparezca", () => {
    const t = createNotificationsTranslator("es");
    expect(t("{persona} y {persona}", { persona: "Ana" })).toBe("Ana y Ana");
  });

  it("un dato que no se pasó queda como marcador, no rompe", () => {
    const t = createNotificationsTranslator("es");
    expect(t("Puesto: {puesto}")).toBe("Puesto: {puesto}");
  });
});

describe("el diccionario", () => {
  it("no tiene traducciones vacías", () => {
    const vacias = Object.entries(NOTIFICATIONS_EN)
      .filter(([, ingles]) => !ingles.trim())
      .map(([clave]) => clave);

    expect(vacias).toEqual([]);
  });

  it("los marcadores de la clave existen igual en la traducción", () => {
    const marcadores = (texto: string) => (texto.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

    const desparejas = Object.entries(NOTIFICATIONS_EN)
      .filter(([es, en]) => JSON.stringify(marcadores(es)) !== JSON.stringify(marcadores(en)))
      .map(([es]) => es);

    expect(
      desparejas,
      "Estas traducciones perdieron o cambiaron un marcador {dato}, asi que el aviso " +
        "en ingles sale con el hueco sin completar:\n  " + desparejas.join("\n  "),
    ).toEqual([]);
  });
});

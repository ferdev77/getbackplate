import { describe, expect, it } from "vitest";
import { createTranslator } from "./qbo-r365.i18n";

describe("QuickBooks integration branding", () => {
  it("normalizes unregistered names without changing registered names", () => {
    const t = createTranslator("es");

    expect(t("Conectar QuickBooks")).toBe("Conectar QuickBooks® Online");
    expect(t("QuickBooks® Online")).toBe("QuickBooks® Online");
  });
});

describe("QuickBooks integration English copy", () => {
  const t = createTranslator("en");

  it("uses the required dashboard title and CSV tax header", () => {
    expect(t("Integración QuickBooks → R365")).toBe("QuickBooks® Online → R365 Integration");
    expect(t("Impuesto")).toBe("Tax");
  });

  it("translates dashboard fallback errors", () => {
    expect(t("Error al crear")).toBe("Error creating connection");
    expect(t("Error al guardar")).toBe("Error saving changes");
    expect(t("No se pudo generar la previsualización")).toBe("Could not generate the preview");
    expect(t("Renueva")).toBe("Renews");
  });
});

import { describe, expect, it } from "vitest";
import { SECTIONS } from "./company-shell.config";
import { createTranslator } from "./company-shell.i18n";
import { MODULE_LABELS } from "./company-shell-utils";

describe("company shell QuickBooks branding", () => {
  it("does not duplicate the registered product name", () => {
    expect(createTranslator("es")("Integración QuickBooks® Online")).toBe("Integración QuickBooks® Online");
  });

  it("translates the exact QuickBooks sidebar key", () => {
    const sidebarLabel = SECTIONS.flatMap((section) => section.items)
      .find((item) => item.moduleCode === "qbo_r365")?.label;

    expect(sidebarLabel).toBe("Integración QuickBooks® Online");
    expect(MODULE_LABELS.qbo_r365).toBe(sidebarLabel);
    expect(createTranslator("en")(sidebarLabel!)).toBe("QuickBooks® Online Integration");
  });

  it("translates integration plan and add-on labels", () => {
    const t = createTranslator("en");

    expect(t("Seleccionado")).toBe("Selected");
    expect(t("Actual")).toBe("Current");
    expect(t("a medida")).toBe("custom");
    expect(t("/mes")).toBe("/mo");
    expect(t("Activo")).toBe("Active");
    expect(t("Cambiar plan")).toBe("Change plan");
    expect(t("Ver planes")).toBe("View plans");
  });
});

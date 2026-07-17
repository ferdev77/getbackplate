import { describe, expect, it } from "vitest";
import { createTranslator } from "./company-shell.i18n";

describe("company shell QuickBooks branding", () => {
  it("does not duplicate the registered product name", () => {
    expect(createTranslator("es")("Integración QuickBooks® Online")).toBe("Integración QuickBooks® Online");
  });
});

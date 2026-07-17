import { describe, expect, it } from "vitest";
import { createTranslator } from "./qbo-r365.i18n";

describe("QuickBooks integration branding", () => {
  it("normalizes unregistered names without changing registered names", () => {
    const t = createTranslator("es");

    expect(t("Conectar QuickBooks")).toBe("Conectar QuickBooks® Online");
    expect(t("QuickBooks® Online")).toBe("QuickBooks® Online");
  });
});

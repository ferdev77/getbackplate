import { describe, it, expect } from "vitest";
import { resolveHistoryCustomerName } from "../lib/resolve-customer-name";

describe("resolveHistoryCustomerName", () => {
  const configs = [
    { id: "cfg-1", qboCustomerName: "Kumori Central Kitchen" },
    { id: "cfg-2", qboCustomerName: "Otro Restaurante" },
  ];

  // ─── Caso principal del bug: sync con vendor de R365 guardado por backfill ───

  it("sync + config coincidente → qboCustomerName del config, no el vendor de R365", () => {
    const item = { importSource: "sync", syncConfigId: "cfg-1", customerName: "PRODEL DISTRIBUTION INC" };
    const result = resolveHistoryCustomerName(item, configs);
    expect(result).toBe("Kumori Central Kitchen");
    expect(result).not.toBe("PRODEL DISTRIBUTION INC");
  });

  it("sync + segundo config → nombre correcto del config correspondiente", () => {
    const item = { importSource: "sync", syncConfigId: "cfg-2", customerName: "PRODEL DISTRIBUTION INC" };
    expect(resolveHistoryCustomerName(item, configs)).toBe("Otro Restaurante");
  });

  // ─── Fallbacks para sync ──────────────────────────────────────────────────────

  it("sync + syncConfigId sin match en configs → fallback a customerName del item", () => {
    const item = { importSource: "sync", syncConfigId: "cfg-99", customerName: "Cliente Fallback" };
    expect(resolveHistoryCustomerName(item, configs)).toBe("Cliente Fallback");
  });

  it("sync + syncConfigId null → customerName del item", () => {
    const item = { importSource: "sync", syncConfigId: null, customerName: "Cliente X" };
    expect(resolveHistoryCustomerName(item, configs)).toBe("Cliente X");
  });

  it("sync + config coincidente + customerName null → qboCustomerName del config", () => {
    const item = { importSource: "sync", syncConfigId: "cfg-2", customerName: null };
    expect(resolveHistoryCustomerName(item, configs)).toBe("Otro Restaurante");
  });

  // ─── Webhook: usa customerName directamente, ignora configs ──────────────────

  it("webhook → customerName del item, no aplica override del config", () => {
    const item = { importSource: "webhook", syncConfigId: "cfg-1", customerName: "Kumori Central Kitchen" };
    const wrongConfigs = [{ id: "cfg-1", qboCustomerName: "NOMBRE INCORRECTO" }];
    expect(resolveHistoryCustomerName(item, wrongConfigs)).toBe("Kumori Central Kitchen");
  });

  it("webhook + customerName null → '-'", () => {
    const item = { importSource: "webhook", syncConfigId: null, customerName: null };
    expect(resolveHistoryCustomerName(item, [])).toBe("-");
  });

  // ─── Manual: usa customerName directamente ────────────────────────────────────

  it("manual → customerName del item", () => {
    const item = { importSource: "manual", syncConfigId: null, customerName: "Cliente Manual" };
    expect(resolveHistoryCustomerName(item, [])).toBe("Cliente Manual");
  });

  it("manual + customerName null → '-'", () => {
    const item = { importSource: "manual", syncConfigId: null, customerName: null };
    expect(resolveHistoryCustomerName(item, [])).toBe("-");
  });

  // ─── Lista de configs vacía ───────────────────────────────────────────────────

  it("sync + configs vacíos → fallback a customerName", () => {
    const item = { importSource: "sync", syncConfigId: "cfg-1", customerName: "Algún cliente" };
    expect(resolveHistoryCustomerName(item, [])).toBe("Algún cliente");
  });

  it("sync + configs vacíos + customerName null → '-'", () => {
    const item = { importSource: "sync", syncConfigId: "cfg-1", customerName: null };
    expect(resolveHistoryCustomerName(item, [])).toBe("-");
  });
});

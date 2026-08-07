import { describe, expect, it } from "vitest";
import { qboCustomerRefSchema, resolveCustomerR365Location } from "../types";

describe("manual R365 customer location", () => {
  it("accepts and trims a manual location in the selected customer payload", () => {
    expect(qboCustomerRefSchema.parse({
      id: "customer-1",
      name: "Review Restaurant",
      r365Location: " 1900100 ",
      r365LocationSource: "manual",
    })).toEqual({
      id: "customer-1",
      name: "Review Restaurant",
      r365Location: "1900100",
      r365LocationSource: "manual",
    });
  });

  it("rejects manual locations that are not exactly 7 numeric digits", () => {
    expect(qboCustomerRefSchema.safeParse({
      id: "customer-1",
      name: "Review Restaurant",
      r365Location: "A",
      r365LocationSource: "manual",
    }).success).toBe(false);
    expect(qboCustomerRefSchema.safeParse({
      id: "customer-1",
      name: "Review Restaurant",
      r365Location: "123456",
      r365LocationSource: "manual",
    }).success).toBe(false);
  });

  it("keeps alphanumeric locations returned directly by QuickBooks", () => {
    expect(qboCustomerRefSchema.safeParse({
      id: "customer-1",
      name: "Review Restaurant",
      r365Location: "INTUIT-REVIEW",
      r365LocationSource: "qbo",
    }).success).toBe(true);
  });

  it("prefers QuickBooks Account Number and falls back to the manual value", () => {
    expect(resolveCustomerR365Location("QBO-100", "1900100")).toBe("QBO-100");
    expect(resolveCustomerR365Location(null, " 1900100 ")).toBe("1900100");
    expect(resolveCustomerR365Location(undefined, "")).toBeNull();
  });
});

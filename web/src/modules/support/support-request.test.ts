import { describe, expect, it } from "vitest";
import { escapeSupportText, supportRequestSchema } from "./support-request";

describe("supportRequestSchema", () => {
  it("normalizes a valid deletion request", () => {
    const result = supportRequestSchema.parse({
      requestType: "deletion",
      name: "Jane Owner",
      email: "JANE@EXAMPLE.COM",
      company: "Example Foods",
      details: "Please delete the integration data for our company.",
      website: "",
    });
    expect(result.email).toBe("jane@example.com");
  });

  it("rejects short request details", () => {
    expect(supportRequestSchema.safeParse({
      requestType: "support",
      name: "Jane Owner",
      email: "jane@example.com",
      details: "Help",
      website: "",
    }).success).toBe(false);
  });

  it("preserves a populated honeypot for the API abuse guard", () => {
    const result = supportRequestSchema.parse({
      requestType: "support",
      name: "Jane Owner",
      email: "jane@example.com",
      details: "This is a sufficiently detailed support request.",
      website: "spam.example",
    });
    expect(result.website).toBe("spam.example");
  });
});

describe("escapeSupportText", () => {
  it("escapes user content before rendering internal email HTML", () => {
    expect(escapeSupportText('<script>alert("x")</script>')).not.toContain("<script>");
  });
});

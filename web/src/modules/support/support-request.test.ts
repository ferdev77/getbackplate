import { describe, expect, it } from "vitest";
import { escapeSupportText, resolveSupportRequester, supportIdentityMatchesForm, supportRequestSchema } from "./support-request";

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

describe("resolveSupportRequester", () => {
  const input = supportRequestSchema.parse({
    requestType: "support",
    name: "Spoofed Name",
    email: "spoofed@example.com",
    company: "Spoofed Company",
    details: "A sufficiently detailed support request for testing.",
    website: "",
  });

  it("keeps form identity for public requests", () => {
    expect(resolveSupportRequester(input, null)).toMatchObject({
      name: "Spoofed Name",
      email: "spoofed@example.com",
      organizationId: null,
      identitySource: "public",
    });
  });

  it("overrides browser identity with authenticated server identity", () => {
    expect(resolveSupportRequester(input, {
      userId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      name: "Verified Admin",
      email: "ADMIN@EXAMPLE.COM",
      company: "Verified Company",
    })).toMatchObject({
      name: "Verified Admin",
      email: "admin@example.com",
      company: "Verified Company",
      organizationId: "22222222-2222-4222-8222-222222222222",
      userId: "11111111-1111-4111-8111-111111111111",
      identitySource: "authenticated",
    });
  });

  it("rejects a form rendered for a different active organization", () => {
    const renderedInput = {
      ...input,
      identityOrganizationId: "33333333-3333-4333-8333-333333333333",
      identityUserId: "11111111-1111-4111-8111-111111111111",
    };
    expect(supportIdentityMatchesForm(renderedInput, {
      userId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      name: "Verified Admin",
      email: "admin@example.com",
      company: "Verified Company",
    })).toBe(false);
  });

  it("rejects a form rendered for another admin in the same organization", () => {
    const renderedInput = {
      ...input,
      identityOrganizationId: "22222222-2222-4222-8222-222222222222",
      identityUserId: "33333333-3333-4333-8333-333333333333",
    };
    expect(supportIdentityMatchesForm(renderedInput, {
      userId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      name: "Verified Admin",
      email: "admin@example.com",
      company: "Verified Company",
    })).toBe(false);
  });
});

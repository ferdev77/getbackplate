import { describe, expect, it } from "vitest";
import { isDevelopmentSupabaseProject, resolveQboApiBaseUrl } from "../qbo-environment";

const devUrl = "https://uubdslmtfxwraszinpao.supabase.co";
const prodUrl = "https://mfhyemwypuzsqjqxtbjf.supabase.co";

describe("resolveQboApiBaseUrl", () => {
  it("forces sandbox for the development Supabase project", () => {
    expect(resolveQboApiBaseUrl({ NEXT_PUBLIC_SUPABASE_URL: devUrl })).toBe(
      "https://sandbox-quickbooks.api.intuit.com",
    );
    expect(resolveQboApiBaseUrl({
      NEXT_PUBLIC_SUPABASE_URL: devUrl,
      QBO_ENVIRONMENT: "production",
    })).toBe("https://sandbox-quickbooks.api.intuit.com");
  });

  it("preserves production behavior for the production project", () => {
    expect(resolveQboApiBaseUrl({ NEXT_PUBLIC_SUPABASE_URL: prodUrl })).toBe(
      "https://quickbooks.api.intuit.com",
    );
    expect(resolveQboApiBaseUrl({
      NEXT_PUBLIC_SUPABASE_URL: prodUrl,
      QBO_ENVIRONMENT: "sandbox",
    })).toBe("https://sandbox-quickbooks.api.intuit.com");
  });

  it("preserves legacy behavior for unknown installations", () => {
    expect(resolveQboApiBaseUrl({})).toBe("https://quickbooks.api.intuit.com");
  });

  it("allows custom mock URLs and normalizes trailing slashes", () => {
    expect(resolveQboApiBaseUrl({
      NEXT_PUBLIC_SUPABASE_URL: devUrl,
      QBO_API_BASE_URL: " https://qbo-mock.internal/api/// ",
    })).toBe("https://qbo-mock.internal/api");
  });

  it("rejects an explicit production Accounting URL in dev", () => {
    expect(() => resolveQboApiBaseUrl({
      NEXT_PUBLIC_SUPABASE_URL: devUrl,
      QBO_API_BASE_URL: "https://quickbooks.api.intuit.com/",
    })).toThrow("Supabase dev cannot use the production QuickBooks Accounting API");
  });

  it("rejects malformed custom URLs", () => {
    expect(() => resolveQboApiBaseUrl({ QBO_API_BASE_URL: "not-a-url" })).toThrow(
      "QBO_API_BASE_URL must be a valid absolute URL",
    );
  });
});

describe("isDevelopmentSupabaseProject", () => {
  it("matches only the exact development project hostname", () => {
    expect(isDevelopmentSupabaseProject(devUrl)).toBe(true);
    expect(isDevelopmentSupabaseProject(prodUrl)).toBe(false);
    expect(isDevelopmentSupabaseProject(`https://${devUrl}.evil.test`)).toBe(false);
    expect(isDevelopmentSupabaseProject("invalid")).toBe(false);
  });
});

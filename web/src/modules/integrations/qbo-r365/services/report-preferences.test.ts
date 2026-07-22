import { afterEach, describe, expect, it } from "vitest";
import {
  createQboReportPreferenceToken,
  verifyQboReportPreferenceToken,
} from "./report-preference-token";
import {
  normalizeQboReportRecipientEmail,
  shouldSendQboReport,
} from "./report-preferences.service";
import {
  getInitialQboReportFrequency,
  getQboReportPreferenceConfirmation,
} from "./report-preference-ui";

const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const NONCE = "22222222-2222-4222-8222-222222222222";

describe("QBO report preference tokens", () => {
  afterEach(() => delete process.env.QBO_REPORT_PREFERENCES_TOKEN_SECRET);

  it("round-trips only opaque subscription identifiers", () => {
    process.env.QBO_REPORT_PREFERENCES_TOKEN_SECRET = "a-dedicated-test-secret";
    const token = createQboReportPreferenceToken({ id: SUBSCRIPTION_ID, tokenNonce: NONCE });

    expect(token).not.toContain("recipient@example.com");
    expect(verifyQboReportPreferenceToken(token)).toEqual({
      version: 1,
      subscriptionId: SUBSCRIPTION_ID,
      nonce: NONCE,
    });
  });

  it("rejects payload and signature tampering with the generic error", () => {
    process.env.QBO_REPORT_PREFERENCES_TOKEN_SECRET = "a-dedicated-test-secret";
    const token = createQboReportPreferenceToken({ id: SUBSCRIPTION_ID, tokenNonce: NONCE });
    const [payload, signature] = token.split(".");

    expect(() => verifyQboReportPreferenceToken(`${payload}x.${signature}`))
      .toThrow("This preferences link is invalid");
    expect(() => verifyQboReportPreferenceToken(`${payload}.${signature?.slice(0, -1)}x`))
      .toThrow("This preferences link is invalid");
    expect(() => verifyQboReportPreferenceToken(`${payload}.${signature}.`))
      .toThrow("This preferences link is invalid");
  });
});

describe("QBO report preference behavior", () => {
  it("normalizes identity email without changing an existing cadence", () => {
    expect(normalizeQboReportRecipientEmail(" Owner@Example.COM ")).toBe("owner@example.com");
    expect(shouldSendQboReport("weekly", "weekly")).toBe(true);
    expect(shouldSendQboReport("monthly", "weekly")).toBe(false);
    expect(shouldSendQboReport("off", "monthly")).toBe(false);
  });

  it("preselects off for unsubscribe GETs without changing persisted state", () => {
    const persisted = "weekly" as const;
    expect(getInitialQboReportFrequency(persisted, true)).toBe("off");
    expect(persisted).toBe("weekly");
    expect(getQboReportPreferenceConfirmation("off")).toContain("turned off");
  });
});

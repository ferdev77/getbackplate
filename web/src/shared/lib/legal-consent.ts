import type Stripe from "stripe";

type LegalConsentKind = "platform" | "integration";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.getbackplate.com").replace(/\/$/, "");
}

const LEGAL_VERSION = "2026.07.23";

/**
 * Stripe Checkout solo permite UN checkbox de consentimiento por sesion
 * (`consent_collection.terms_of_service`), asi que para Integracion los 3
 * documentos (EULA, Privacy, MSA) van juntos en el mismo mensaje.
 */
function buildConsentMessage(kind: LegalConsentKind): string {
  const base = appUrl();
  if (kind === "platform") {
    return `I agree to the [End-User License Agreement](${base}/legal/platform/terms) and [Privacy Policy](${base}/legal/platform/privacy).`;
  }
  return `I agree to the [End-User License Agreement](${base}/legal/integration/terms), [Privacy Policy](${base}/legal/integration/privacy), and [Master Services Agreement](${base}/legal/integration/msa).`;
}

export function buildTermsConsentParams(
  kind: LegalConsentKind,
): Pick<Stripe.Checkout.SessionCreateParams, "consent_collection" | "custom_text"> {
  return {
    consent_collection: { terms_of_service: "required" },
    custom_text: { terms_of_service_acceptance: { message: buildConsentMessage(kind) } },
  };
}

export function legalConsentMetadata(): { legalVersion: string } {
  return { legalVersion: LEGAL_VERSION };
}

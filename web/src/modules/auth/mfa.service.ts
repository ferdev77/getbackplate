import "server-only";

import { createHash, randomInt } from "crypto";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { isModuleEnabledForOrganization } from "@/shared/lib/tenant-modules";
import { sendEmail } from "@/shared/lib/brevo";
import {
  buildBrandedEmailSubject,
  getDefaultEmailBranding,
  getTenantEmailBranding,
} from "@/shared/lib/email-branding";
import { mfaCodeTemplate } from "@/shared/lib/email-templates/mfa-code";
import { logAuthEvent } from "@/shared/lib/audit";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 45;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function generateSixDigitCode() {
  // randomInt is cryptographically secure (uses the platform CSPRNG).
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * MFA es obligatorio para cualquier organizacion con el modulo qbo_r365
 * activo (Intuit exige MFA en cuentas administrativas). Para el resto,
 * el propio usuario lo puede activar como opcional desde Ajustes.
 */
export async function isEmailMfaRequired(input: {
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const mandatory = await isModuleEnabledForOrganization(input.organizationId, "qbo_r365");
  if (mandatory) return true;

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("user_preferences")
    .select("two_factor_enabled")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .maybeSingle();

  return Boolean(data?.two_factor_enabled);
}

/**
 * Genera un codigo de 6 digitos, lo guarda con hash (nunca en texto plano)
 * y lo manda por email. Cualquier desafio previo sin consumir para este
 * organización queda invalidado (evita que un código viejo siga siendo válido).
 */
export async function createEmailMfaChallenge(input: {
  userId: string;
  organizationId: string;
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string; retryAfterSeconds?: number }> {
  const admin = createSupabaseAdminClient();

  const { data: recent } = await admin
    .from("company_mfa_challenges")
    .select("created_at")
    .eq("user_id", input.userId)
    .eq("organization_id", input.organizationId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    const secondsSinceLast = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        error: "Wait a few seconds before requesting another code.",
        retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLast),
      };
    }
  }

  // Invalida cualquier desafío previo sin usar: solo el más nuevo es válido.
  await admin
    .from("company_mfa_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .eq("organization_id", input.organizationId)
    .is("consumed_at", null);

  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const { data: challenge, error: insertError } = await admin
    .from("company_mfa_challenges")
    .insert({
      user_id: input.userId,
      organization_id: input.organizationId,
      code_hash: hashCode(code),
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError) {
    return { ok: false, error: "Your verification code could not be generated." };
  }

  const branding = input.organizationId
    ? await getTenantEmailBranding(input.organizationId).catch(() => getDefaultEmailBranding())
    : getDefaultEmailBranding();

  const emailResult = await sendEmail({
    to: [{ email: input.email }],
    subject: buildBrandedEmailSubject("Your verification code", branding),
    htmlContent: mfaCodeTemplate({ code, branding, ttlMinutes: CODE_TTL_MINUTES }),
    notification: {
      source: "auth.mfa_challenge",
      organizationId: input.organizationId,
    },
  });

  if (!emailResult.ok) {
    // An unsent code must not force the user to wait through the resend cooldown.
    await admin.from("company_mfa_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);
    return { ok: false, error: "Your verification code could not be sent by email." };
  }

  return { ok: true };
}

export async function verifyEmailMfaChallenge(input: {
  userId: string;
  organizationId: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();

  const { data: challenge } = await admin
    .from("company_mfa_challenges")
    .select("id, code_hash, attempts, expires_at, consumed_at")
    .eq("user_id", input.userId)
    .eq("organization_id", input.organizationId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge) {
    return { ok: false, error: "There is no pending code. Request a new one." };
  }

  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "The code has expired. Request a new one." };
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "You have exceeded the maximum number of attempts. Request a new code." };
  }

  const providedHash = hashCode(input.code.trim());

  if (providedHash !== challenge.code_hash) {
    await admin
      .from("company_mfa_challenges")
      .update({ attempts: challenge.attempts + 1 })
      .eq("id", challenge.id);

    await logAuthEvent({
      action: "login.mfa_failed",
      outcome: "denied",
      organizationId: input.organizationId,
      severity: "medium",
      metadata: { attempts: challenge.attempts + 1 },
    });

    const remaining = MAX_ATTEMPTS - (challenge.attempts + 1);
    return {
      ok: false,
      error: remaining > 0
        ? `Incorrect code. You have ${remaining} attempts remaining.`
        : "Incorrect code. You have exceeded the maximum number of attempts. Request a new code.",
    };
  }

  await admin
    .from("company_mfa_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id);

  await logAuthEvent({
    action: "login.mfa_verified",
    outcome: "success",
    organizationId: input.organizationId,
    severity: "low",
  });

  return { ok: true };
}

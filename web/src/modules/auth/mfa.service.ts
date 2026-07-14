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
 * usuario queda invalidado (evita que un codigo viejo siga siendo valido).
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
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    const secondsSinceLast = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        error: "Esperá unos segundos antes de pedir otro código.",
        retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLast),
      };
    }
  }

  // Invalida cualquier desafío previo sin usar: solo el más nuevo es válido.
  await admin
    .from("company_mfa_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", input.userId)
    .is("consumed_at", null);

  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await admin.from("company_mfa_challenges").insert({
    user_id: input.userId,
    organization_id: input.organizationId,
    code_hash: hashCode(code),
    expires_at: expiresAt,
  });

  if (insertError) {
    return { ok: false, error: "No se pudo generar el código de verificación." };
  }

  const branding = input.organizationId
    ? await getTenantEmailBranding(input.organizationId).catch(() => getDefaultEmailBranding())
    : getDefaultEmailBranding();

  const emailResult = await sendEmail({
    to: [{ email: input.email }],
    subject: buildBrandedEmailSubject("Tu código de verificación", branding),
    htmlContent: mfaCodeTemplate({ code, branding, ttlMinutes: CODE_TTL_MINUTES }),
    notification: {
      source: "auth.mfa_challenge",
      organizationId: input.organizationId,
    },
  });

  if (!emailResult.ok) {
    return { ok: false, error: "No se pudo enviar el código por email." };
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
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge) {
    return { ok: false, error: "No hay un código pendiente. Pedí uno nuevo." };
  }

  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "El código venció. Pedí uno nuevo." };
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Superaste el máximo de intentos. Pedí un código nuevo." };
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
        ? `Código incorrecto. Te quedan ${remaining} intentos.`
        : "Código incorrecto. Superaste el máximo de intentos, pedí uno nuevo.",
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

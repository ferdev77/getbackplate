import "server-only";

import { cookies } from "next/headers";
import {
  createMfaVerificationToken,
  verifyMfaVerificationToken,
} from "@/shared/lib/mfa-verification-token";

export const MFA_VERIFIED_COOKIE = "gb_mfa_verified";
const MFA_VERIFIED_COOKIE_MAX_AGE = 60 * 60 * 12;

function getSigningSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
}

// La firma vincula la verificacion al usuario y evita aceptar cookies manipuladas.
export async function markMfaVerifiedForUser(userId: string) {
  const secret = getSigningSecret();
  if (!secret) throw new Error("MFA verification signing secret is not configured.");
  const store = await cookies();
  store.set(MFA_VERIFIED_COOKIE, createMfaVerificationToken({ userId, secret }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MFA_VERIFIED_COOKIE_MAX_AGE,
  });
}

export async function isMfaVerifiedForUser(userId: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(MFA_VERIFIED_COOKIE)?.value;
  const secret = getSigningSecret();
  if (!token || !secret) return false;
  return verifyMfaVerificationToken({
    token,
    userId,
    secret,
    maxAgeSeconds: MFA_VERIFIED_COOKIE_MAX_AGE,
  });
}

export async function clearMfaVerifiedCookie() {
  const store = await cookies();
  store.delete(MFA_VERIFIED_COOKIE);
}

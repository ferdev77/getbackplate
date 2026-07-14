import "server-only";

import { cookies } from "next/headers";

export const MFA_VERIFIED_COOKIE = "gb_mfa_verified";
const MFA_VERIFIED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * El valor guardado es el user_id, no un simple "1" -- así, si dos
 * usuarios distintos comparten navegador (uno cierra sesión y otro
 * entra), la cookie del primero nunca cuenta como válida para el
 * segundo.
 */
export async function markMfaVerifiedForUser(userId: string) {
  const store = await cookies();
  store.set(MFA_VERIFIED_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MFA_VERIFIED_COOKIE_MAX_AGE,
  });
}

export async function isMfaVerifiedForUser(userId: string): Promise<boolean> {
  const store = await cookies();
  return store.get(MFA_VERIFIED_COOKIE)?.value === userId;
}

export async function clearMfaVerifiedCookie() {
  const store = await cookies();
  store.delete(MFA_VERIFIED_COOKIE);
}

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getRequestOrigin } from "@/shared/lib/app-url";
import { normalizeOrganizationId } from "@/shared/lib/tenant-selection-shared";
import {
  normalizeRequestHost,
  resolveOrganizationIdFromReadyAuthDomain,
} from "@/shared/lib/custom-domains";
import { resolvePostLoginRedirect, PostLoginRoutingError } from "@/modules/auth/post-login-routing";
import { clearMfaVerifiedCookie } from "@/shared/lib/mfa-verification";
import { logAuthEvent } from "@/shared/lib/audit";
import { AUDIT_REASON_CODES } from "@/shared/lib/audit-taxonomy";

/**
 * Inicio de sesion con Google sin salir del dominio del cliente.
 *
 * El camino de /api/auth/google/start manda al usuario a Google y este vuelve
 * al dominio canonico, porque Google solo admite volver a uno. Desde un dominio
 * propio eso obliga a un rodeo: salto al canonico, vuelta con un token puente y
 * traspaso de la sesion. Ocho pasos y dos formularios invisibles.
 *
 * Aca Google entrega el id_token en la misma pagina, dentro de una ventana
 * emergente, y la sesion se crea directamente en el dominio del cliente. Sin
 * rodeo no hacen falta ni el relay ni el puente.
 *
 * Lo que NO cambia: la pantalla de Google sigue mostrando el nombre de la
 * aplicacion registrada en Google Cloud, que es una sola. Lo que cambia es que
 * el usuario nunca abandona la pagina de su empresa.
 *
 * El nonce viaja en dos formas a proposito: a Google se le da el hash y aca
 * llega el valor original, para que Supabase pueda hashearlo y comparar. Es lo
 * que impide reutilizar un id_token robado.
 */

const MAX_CREDENTIAL_LENGTH = 8192;

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const credential = typeof body?.credential === "string" ? body.credential : "";
  const nonce = typeof body?.nonce === "string" ? body.nonce : "";
  const organizationHint = normalizeOrganizationId(
    typeof body?.org === "string" ? body.org : null,
  );
  const billingTrack = body?.desde === "integracion" ? "integration" : "platform";

  if (!credential || credential.length > MAX_CREDENTIAL_LENGTH) {
    return fail("Missing Google credential.");
  }
  // El nonce lo genera el navegador: 32 bytes en base64url.
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
    return fail("Invalid sign-in nonce.");
  }

  // Este camino existe para los dominios propios. Se acepta tambien el canonico
  // para poder probarlo, pero nunca un host desconocido: si alguien apunta su
  // dominio a la app, no puede usarlo para abrir sesiones.
  const requestHost = normalizeRequestHost(new URL(getRequestOrigin(request)).hostname);
  const domainOrganizationId = requestHost
    ? await resolveOrganizationIdFromReadyAuthDomain(requestHost)
    : null;
  const isCanonicalHost =
    normalizeRequestHost(new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname || "") === requestHost;

  if (!domainOrganizationId && !isCanonicalHost) {
    return fail("This domain is not ready for sign-in.", 403);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
    nonce,
  });

  if (error || !data.user) {
    await logAuthEvent({
      action: "login.failed",
      outcome: "denied",
      severity: "low",
      reasonCode: AUDIT_REASON_CODES.INVALID_CREDENTIALS,
      metadata: { provider: "google", stage: "popup_id_token", reason: error?.message ?? "no_user" },
    });
    return fail("Your Google account could not be validated.", 401);
  }

  // Sesion nueva: la verificacion de segundo factor vuelve a pedirse.
  await clearMfaVerifiedCookie();

  const effectiveHint = domainOrganizationId ?? organizationHint;

  try {
    const redirectTo = await resolvePostLoginRedirect({
      userId: data.user.id,
      email: data.user.email ?? null,
      organizationIdHint: effectiveHint,
      companyDashboardPath: `/app/dashboard?billingTrack=${billingTrack}`,
      provider: "google",
    });
    return NextResponse.json({ redirectTo }, { headers: { "Cache-Control": "no-store" } });
  } catch (routingError) {
    // El ruteo decide tambien quien NO entra. Si rechaza, la sesion recien
    // creada no puede quedar viva.
    await supabase.auth.signOut();
    if (routingError instanceof PostLoginRoutingError) {
      return fail(routingError.message, 403);
    }
    return fail("Unable to complete sign-in.", 500);
  }
}

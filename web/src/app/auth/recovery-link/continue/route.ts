import { NextResponse } from "next/server";

import { buildRecoveryCallbackUrl, normalizeRecoveryTokenHash } from "@/shared/lib/recovery-link";

function buildInvalidRedirect(request: Request, organizationHint: string) {
  const fallback = new URL("/auth/recovery-link", request.url);
  fallback.searchParams.set(
    "error",
    "El enlace de recuperacion expiro o no es valido. Solicita uno nuevo.",
  );
  if (organizationHint) {
    fallback.searchParams.set("org", organizationHint);
  }
  return NextResponse.redirect(fallback, { status: 303 });
}

function continueRecovery(request: Request, encoded: string, organizationHint: string) {
  const requestUrl = new URL(request.url);
  const callbackUrl = buildRecoveryCallbackUrl({
    appUrl: requestUrl.origin,
    tokenHash: encoded,
    organizationIdHint: organizationHint,
  });

  if (!callbackUrl) {
    return buildInvalidRedirect(request, organizationHint);
  }

  return NextResponse.redirect(callbackUrl, { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const encoded = normalizeRecoveryTokenHash(formData.get("t")?.toString()) ?? "";
  const organizationHint = String(formData.get("org") ?? "").trim();
  return continueRecovery(request, encoded, organizationHint);
}

import { NextResponse } from "next/server";

import { parseAndValidateRecoveryActionLink } from "@/shared/lib/recovery-link";

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
  const actionLink = parseAndValidateRecoveryActionLink(encoded);

  if (!actionLink) {
    return buildInvalidRedirect(request, organizationHint);
  }

  return NextResponse.redirect(actionLink, { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const encoded = String(formData.get("k") ?? "").trim();
  const organizationHint = String(formData.get("org") ?? "").trim();
  return continueRecovery(request, encoded, organizationHint);
}

import { NextResponse } from "next/server";

import { parseAndValidateRecoveryActionLink } from "@/shared/lib/recovery-link";

export async function POST(request: Request) {
  const formData = await request.formData();
  const encoded = String(formData.get("k") ?? "").trim();
  const organizationHint = String(formData.get("org") ?? "").trim();
  const actionLink = parseAndValidateRecoveryActionLink(encoded);

  if (!actionLink) {
    const fallback = new URL("/auth/forgot-password", request.url);
    fallback.searchParams.set(
      "error",
      "El enlace de recuperacion expiro o no es valido. Solicita uno nuevo.",
    );
    if (organizationHint) {
      fallback.searchParams.set("org", organizationHint);
    }
    return NextResponse.redirect(fallback, { status: 303 });
  }

  return NextResponse.redirect(actionLink, { status: 303 });
}

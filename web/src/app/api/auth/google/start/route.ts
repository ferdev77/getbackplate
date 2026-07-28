import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getCanonicalAppUrl, getRequestOrigin } from "@/shared/lib/app-url";
import { normalizeOrganizationId } from "@/shared/lib/tenant-selection-shared";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationHint = normalizeOrganizationId(url.searchParams.get("org"));
  const billingTrack = url.searchParams.get("desde") === "integracion" ? "integracion" : "plataforma";

  const origin = process.env.NODE_ENV === "production"
    ? new URL(getCanonicalAppUrl()).origin
    : getRequestOrigin(request);

  const callbackUrl = new URL("/auth/callback", origin);
  if (organizationHint) callbackUrl.searchParams.set("org", organizationHint);
  callbackUrl.searchParams.set("desde", billingTrack);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    const loginError = new URL("/auth/login", origin);
    loginError.searchParams.set("error", "Unable to start sign-in with Google. Please try again.");
    if (organizationHint) loginError.searchParams.set("org", organizationHint);
    return NextResponse.redirect(loginError);
  }

  return NextResponse.redirect(data.url);
}

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { clearMfaVerifiedCookie } from "@/shared/lib/mfa-verification";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const loginPath = data.user?.app_metadata?.intuit_sso_only === true
    ? "/auth/login?desde=integracion"
    : "/auth/login";
  await supabase.auth.signOut();
  await clearMfaVerifiedCookie();

  const url = new URL(request.url);
  return NextResponse.redirect(new URL(loginPath, url.origin));
}

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const org = requestUrl.searchParams.get("org");
  const next = requestUrl.searchParams.get("next") ?? "/";

  const supabase = await createSupabaseServerClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash && type) {
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "recovery" | "invite" | "email",
    });
  }

  const redirectUrl = new URL(next, requestUrl.origin);
  if (org && !redirectUrl.searchParams.has("org") && redirectUrl.pathname.startsWith("/app/")) {
    redirectUrl.searchParams.set("org", org);
  }

  return NextResponse.redirect(redirectUrl);
}

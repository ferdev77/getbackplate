import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";

type CallbackType = "magiclink" | "recovery" | "invite" | "email";

export async function GET(
  request: Request,
  context: { params: Promise<{ orgId: string }> },
) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const { orgId } = await context.params;

  const supabase = await createSupabaseServerClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash && type) {
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as CallbackType,
    });
  }

  const redirectUrl = new URL("/app/dashboard", requestUrl.origin);
  if (orgId) {
    redirectUrl.searchParams.set("org", orgId);
  }

  return NextResponse.redirect(redirectUrl);
}

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { clearMfaVerifiedCookie } from "@/shared/lib/mfa-verification";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  await clearMfaVerifiedCookie();

  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/auth/login", url.origin));
}

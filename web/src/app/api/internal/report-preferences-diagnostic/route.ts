import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET?.trim()}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.QBO_REPORT_PREFERENCES_TOKEN_SECRET?.trim() ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("qbo_report_subscriptions")
    .select("id")
    .eq("recipient_email", "alberdimoreno0@gmail.com")
    .eq("target_type", "organization")
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    secretFingerprint: createHash("sha256").update(secret).digest("hex").slice(0, 12),
    secretLength: secret.length,
    supabaseFingerprint: createHash("sha256").update(supabaseUrl).digest("hex").slice(0, 12),
    subscriptionFound: Boolean(data),
    subscriptionError: error?.message ?? null,
  });
}

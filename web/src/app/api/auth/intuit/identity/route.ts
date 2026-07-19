import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { logAuditEvent } from "@/shared/lib/audit";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: identity, error } = await admin
    .from("external_auth_identities")
    .select("email_at_link, created_at, last_login_at")
    .eq("provider", "intuit")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load Intuit identity." }, { status: 500 });
  return NextResponse.json({
    linked: Boolean(identity),
    email: identity?.email_at_link ?? null,
    canUnlink: Boolean(identity) && data.user.app_metadata?.intuit_sso_only !== true,
  });
}

export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (data.user.app_metadata?.intuit_sso_only === true) {
    return NextResponse.json({ error: "Set a password before unlinking Intuit." }, { status: 409 });
  }
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("external_auth_identities")
    .delete()
    .eq("provider", "intuit")
    .eq("user_id", data.user.id);
  if (error) return NextResponse.json({ error: "Unable to unlink Intuit." }, { status: 500 });
  await logAuditEvent({
    action: "auth.identity.unlinked",
    entityType: "external_auth_identity",
    actorId: data.user.id,
    eventDomain: "auth",
    outcome: "success",
    metadata: { provider: "intuit" },
  });
  return NextResponse.json({ ok: true });
}

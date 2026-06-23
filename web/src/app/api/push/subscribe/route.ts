import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { isCurrentUserSuperadmin } from "@/modules/memberships/queries";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { endpoint, keys, orgId, userAgent, notifyIntegrationAlerts } = body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    orgId?: string;
    userAgent?: string;
    notifyIntegrationAlerts?: boolean;
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
  }

  // notify_integration_alerts expone eventos de TODAS las organizaciones — solo
  // un superadmin puede activarlo en su propia suscripción.
  const canSetIntegrationAlerts = notifyIntegrationAlerts !== undefined && (await isCurrentUserSuperadmin());

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      org_id: orgId ?? null,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      is_active: true,
      user_agent: userAgent ?? null,
      updated_at: new Date().toISOString(),
      ...(canSetIntegrationAlerts ? { notify_integration_alerts: notifyIntegrationAlerts } : {}),
    },
    { onConflict: "user_id,endpoint" }
  );

  if (error) {
    console.error("[push/subscribe] Error:", error);
    return NextResponse.json({ error: "Error al guardar suscripción" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

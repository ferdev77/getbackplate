import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { getCurrentUser } from "@/modules/memberships/queries";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export async function DELETE() {
  try {
    await requireSuperadmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .update({ notify_integration_alerts: false, updated_at: new Date().toISOString() })
    .eq("user_id", currentUser.id);

  if (error) return NextResponse.json({ error: "Error desactivando alertas" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { getCurrentUser } from "@/modules/memberships/queries";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export async function DELETE() {
  try {
    await requireSuperadmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", currentUser.id);

  if (error) return NextResponse.json({ error: "Unable to disable notifications" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { getCurrentUser } from "@/modules/memberships/queries";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperadmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const currentUser = await getCurrentUser().catch(() => null);

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("push_scheduled_sends")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: currentUser?.email ?? "superadmin",
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) return NextResponse.json({ error: "Error cancelando el envío" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

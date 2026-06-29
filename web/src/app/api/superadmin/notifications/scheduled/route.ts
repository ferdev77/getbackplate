import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export async function GET() {
  try {
    await requireSuperadmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("notification_broadcasts")
    .select("id, created_at, created_by, channels, title, body, image_url, action_url, target_type, target_all, org_ids, user_ids, scheduled_at, status")
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Error leyendo envíos programados" }, { status: 500 });

  return NextResponse.json({ scheduled: data ?? [] });
}

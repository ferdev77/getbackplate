import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "10") || 10, 1), 50);
  const cursor = searchParams.get("cursor");

  let query = supabase
    .from("notifications")
    .select("id, channel, title, body, action_url, source, created_at, read_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: items, error } = await query;

  if (error) {
    console.error("[notifications/list] Error:", error);
    return NextResponse.json({ error: "Error al leer notificaciones" }, { status: 500 });
  }

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({ items: items ?? [], unreadCount: unreadCount ?? 0 });
}

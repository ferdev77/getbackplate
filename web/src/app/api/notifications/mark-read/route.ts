import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { id?: string; all?: boolean } | null;

  if (body?.all) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("[notifications/mark-read] Error:", error);
      return NextResponse.json({ error: "Error al marcar notificaciones" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!body?.id) {
    return NextResponse.json({ error: "id o all son requeridos" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", body.id);

  if (error) {
    console.error("[notifications/mark-read] Error:", error);
    return NextResponse.json({ error: "Error al marcar notificación" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

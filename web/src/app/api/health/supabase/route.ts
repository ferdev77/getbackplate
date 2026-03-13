import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { hasPublicSupabaseEnv } from "@/shared/lib/env";

export async function GET() {
  if (!hasPublicSupabaseEnv()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Faltan variables de Supabase en entorno (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).",
      },
      { status: 500 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.getSession();

    if (error) {
      return NextResponse.json(
        { ok: false, message: "Conexion creada pero auth fallo", error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, message: "Supabase conectado correctamente" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "Error al crear cliente de Supabase",
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 },
    );
  }
}

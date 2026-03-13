import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { assertPublicSupabaseEnv, env } from "@/shared/lib/env";

export async function createSupabaseServerClient() {
  assertPublicSupabaseEnv();

  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}

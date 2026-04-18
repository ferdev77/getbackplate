"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";

export function GlobalRealtimeListener() {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/portal")) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    
    const channel = supabase
      .channel("global_public_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
        },
        () => {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }
          timerRef.current = setTimeout(() => {
            router.refresh();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pathname, router]);

  return null;
}

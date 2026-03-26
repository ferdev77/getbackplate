"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";

export function RealtimeFeedbackListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    
    const channel = supabase
      .channel("changes_feedback")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "feedback_messages",
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}

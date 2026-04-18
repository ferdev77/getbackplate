"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";

type EmployeeChecklistRealtimeRefreshProps = {
  organizationId: string;
  userId: string;
};

const CHECKLIST_REFRESH_POLL_MS = 3000;

export function EmployeeChecklistRealtimeRefresh({
  organizationId,
  userId,
}: EmployeeChecklistRealtimeRefreshProps) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    function scheduleRefresh() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        router.refresh();
      }, 350);
    }

    const orgFilter = `organization_id=eq.${organizationId}`;

    const channel = supabase
      .channel(`employee-checklist-live-${organizationId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_submissions",
          filter: orgFilter,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_templates",
          filter: orgFilter,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scheduled_jobs",
          filter: orgFilter,
        },
        scheduleRefresh,
      )
      .subscribe();

    function triggerRefresh() {
      scheduleRefresh();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    }

    const pollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      scheduleRefresh();
    }, CHECKLIST_REFRESH_POLL_MS);

    window.addEventListener("focus", triggerRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearInterval(pollTimer);
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [organizationId, router, userId]);

  return null;
}

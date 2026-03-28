"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";

type EmployeeChecklistRealtimeRefreshProps = {
  organizationId: string;
  userId: string;
};

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

    const ownSubmissionsFilter = `organization_id=eq.${organizationId},submitted_by=eq.${userId}`;
    const orgFilter = `organization_id=eq.${organizationId}`;

    const channel = supabase
      .channel(`employee-checklist-live-${organizationId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_submissions",
          filter: ownSubmissionsFilter,
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

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [organizationId, router, userId]);

  return null;
}

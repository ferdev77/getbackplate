"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";

export function SuperadminRealtimeListener() {
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

    const channel = supabase
      .channel("superadmin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "organizations" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "plans" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "module_catalog" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "organization_modules" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "organization_limits" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_modules" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_messages" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "memberships" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "branches" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}

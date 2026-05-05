import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { runQboR365Sync } from "@/modules/integrations/qbo-r365/service";

type SyncConfigCronRow = {
  id: string;
  organization_id: string;
  schedule_interval: "hourly" | "daily" | "weekly";
  last_run_at: string | null;
};

type CronResult = {
  syncConfigId: string;
  organizationId: string;
  status: "completed" | "failed" | "skipped";
  attempts: number;
  error?: string;
};

const INTERVAL_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export async function GET(request: Request) {
  return processCron(request);
}

export async function POST(request: Request) {
  return processCron(request);
}

async function processCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: rows, error } = await admin
      .from("qbo_r365_sync_configs")
      .select("id, organization_id, schedule_interval, last_run_at")
      .eq("status", "active")
      .neq("schedule_interval", "manual")
      .limit(200);

    if (error) throw new Error(error.message);

    const configs = (rows ?? []) as SyncConfigCronRow[];
    const now = Date.now();
    const results: CronResult[] = [];

    for (const config of configs) {
      const intervalMs = INTERVAL_MS[config.schedule_interval];
      const lastRun = config.last_run_at ? Date.parse(config.last_run_at) : 0;
      const elapsed = now - lastRun;

      if (elapsed < intervalMs) {
        results.push({ syncConfigId: config.id, organizationId: config.organization_id, status: "skipped", attempts: 0 });
        continue;
      }

      let completed = false;
      let lastError = "";
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await runQboR365Sync({
            organizationId: config.organization_id,
            actorId: null,
            triggerSource: attempt === 1 ? "scheduled" : "retry",
            syncConfigId: config.id,
          });

          results.push({ syncConfigId: config.id, organizationId: config.organization_id, status: "completed", attempts: attempt });
          completed = true;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "sync_failed";
        }
      }

      if (!completed) {
        results.push({ syncConfigId: config.id, organizationId: config.organization_id, status: "failed", attempts: maxAttempts, error: lastError });
      }
    }

    return NextResponse.json(
      {
        success: true,
        processed: configs.length,
        completed: results.filter((r) => r.status === "completed").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}

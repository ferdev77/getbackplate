import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { runQboR365Sync } from "@/modules/integrations/qbo-r365/service";

type IntegrationSettingRow = {
  organization_id: string;
  max_retry_attempts: number;
};

type CronResult = {
  organizationId: string;
  status: "completed" | "failed" | "skipped";
  attempts: number;
  error?: string;
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
      .from("integration_settings")
      .select("organization_id, max_retry_attempts")
      .eq("is_enabled", true)
      .limit(200);

    if (error) {
      throw new Error(error.message);
    }

    const settings = (rows ?? []) as IntegrationSettingRow[];
    const results: CronResult[] = [];

    for (const row of settings) {
      const maxAttempts = Math.max(1, Math.min((row.max_retry_attempts ?? 0) + 1, 5));
      let completed = false;
      let lastError = "";

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await runQboR365Sync({
            organizationId: row.organization_id,
            actorId: null,
            triggerSource: attempt === 1 ? "scheduled" : "retry",
            dryRun: false,
          });

          results.push({
            organizationId: row.organization_id,
            status: "completed",
            attempts: attempt,
          });
          completed = true;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "sync_failed";
        }
      }

      if (!completed) {
        results.push({
          organizationId: row.organization_id,
          status: "failed",
          attempts: maxAttempts,
          error: lastError,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        processed: settings.length,
        completed: results.filter((r) => r.status === "completed").length,
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

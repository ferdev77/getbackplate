import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { calculateNextRunAt, RecurrenceType } from "@/shared/lib/cron-utils";
import { processAnnouncementDeliveries } from "@/modules/announcements/services/deliveries";

type JobError = { id: string; error: string };

type ScheduledJob = {
  id: string;
  organization_id: string;
  job_type: string;
  target_id: string;
  metadata: Record<string, unknown> | null;
  recurrence_type: string;
  cron_expression: string | null;
  custom_days: number[] | null;
  next_run_at: string;
};

export async function POST(req: Request) {
  return await processRecurrence(req);
}

export async function GET(req: Request) {
  // Vercel Cron jobs trigger makes a GET by default based on configuration, sometimes POST
  return await processRecurrence(req);
}

async function processRecurrence(req: Request) {
  try {
    // 1. Authenticate the request via Authorization Header
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    if (!supabaseAdmin) {
      throw new Error("Missing Supabase Admin keys");
    }

    // 2. Fetch all scheduled jobs that are active and whose next_run_at <= now()
    const nowIso = new Date().toISOString();
    const { data: jobs, error: fetchError } = await supabaseAdmin
      .from("scheduled_jobs")
      .select("id, organization_id, job_type, target_id, metadata, recurrence_type, cron_expression, custom_days, next_run_at")
      .eq("is_active", true)
      .lte("next_run_at", nowIso)
      .order("next_run_at", { ascending: true })
      .limit(100);

    if (fetchError) {
      console.error("Error fetching scheduled jobs:", fetchError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "No jobs to process" }, { status: 200 });
    }

    let processedCount = 0;
    let pushDeliveriesToProcess = false;
    const errors: JobError[] = [];

    // 3. Process each job
    for (const job of (jobs ?? []) as ScheduledJob[]) {
      try {
        const nextRun = calculateNextRunAt(
          job.recurrence_type as RecurrenceType,
          job.cron_expression,
          job.custom_days,
        );
        const runStartedAt = new Date().toISOString();

        const { data: claimedRows, error: claimError } = await supabaseAdmin
          .from("scheduled_jobs")
          .update({
            last_run_at: runStartedAt,
            next_run_at: nextRun.toISOString(),
          })
          .eq("organization_id", job.organization_id)
          .eq("id", job.id)
          .eq("is_active", true)
          .eq("next_run_at", job.next_run_at)
          .select("id")
          .limit(1);

        if (claimError) {
          throw new Error(`Failed to claim job: ${claimError.message}`);
        }

        if (!claimedRows || claimedRows.length === 0) {
          continue;
        }

        console.info(`Processing job ${job.id} of type ${job.job_type}`);
        
        if (job.job_type === 'checklist_generator') {
           const { data: template } = await supabaseAdmin
             .from('checklist_templates')
             .select('name, target_scope, is_active, branch_id, department_id, organization_id')
             .eq('organization_id', job.organization_id)
             .eq('id', job.target_id)
             .maybeSingle();

           if (template && template.is_active) {
              const targetScope =
                template.target_scope && typeof template.target_scope === "object"
                  ? (template.target_scope as Record<string, unknown>)
                  : {};
              const notifyVia = targetScope?.notify_via || 'none';
              const notifyChannels = Array.isArray(targetScope?.notify_channels)
                ? targetScope.notify_channels
                : [];

             const audienceInput = {
               supabase: supabaseAdmin,
               organizationId: template.organization_id,
               targetScope: targetScope,
               templateBranchId: template.branch_id,
               templateDepartmentId: template.department_id,
             };

             if (notifyVia !== 'none') {
               try {
                 // Import dynamico para no afectar ruta principal si falla
                 const { sendChecklistAudienceEmail, sendChecklistAudienceTwilio } = await import('@/modules/checklists/services/checklist-audience.service');
                 
                  if (notifyChannels.includes("email") || notifyVia === "email" || notifyVia === "all") {
                   await sendChecklistAudienceEmail({
                     ...audienceInput,
                     templateName: template.name,
                     event: "created",
                     itemsCount: 0,
                     actorEmail: "Sistema (Recurrencia)",
                   });
                 }
                 if (notifyChannels.includes("whatsapp") || notifyVia === "whatsapp" || notifyVia === "all") {
                   await sendChecklistAudienceTwilio({
                     ...audienceInput,
                     channel: "whatsapp",
                     templateName: template.name,
                     itemsCount: 0,
                     actorEmail: "Sistema (Recurrencia)",
                   });
                 }
                 if (notifyChannels.includes("sms") || notifyVia === "sms") {
                   await sendChecklistAudienceTwilio({
                     ...audienceInput,
                     channel: "sms",
                     templateName: template.name,
                     itemsCount: 0,
                     actorEmail: "Sistema (Recurrencia)",
                   });
                 }
               } catch (notiError) {
                 console.error(`Failed to send recurrence notifications for checklist ${job.target_id}:`, notiError);
               }
             }
           }
         } else if (job.job_type === 'announcement_delivery') {
            const channels = Array.isArray(job.metadata?.channels)
              ? (job.metadata.channels as string[])
              : ["email"];
           
           const { error: insertError } = await supabaseAdmin
             .from("announcement_deliveries")
             .insert(
               channels.map((channel: string) => ({
                 organization_id: job.organization_id,
                 announcement_id: job.target_id,
                 channel,
                 status: "queued",
               }))
             );
           
           if (insertError) {
             throw new Error(`Failed to queue deliveries: ${insertError.message}`);
           }
           
           pushDeliveriesToProcess = true;
        }

        processedCount++;
       } catch (err: unknown) {
         console.error(`Error processing job ${job.id}:`, err);
         errors.push({ id: job.id, error: err instanceof Error ? err.message : "Unknown error" });
       }
     }

    if (pushDeliveriesToProcess) {
       // Fire and forget or await the execution of processAnnouncementDeliveries
       const deliveryResult = await processAnnouncementDeliveries();
       console.info("processAnnouncementDeliveries triggered from cron:", deliveryResult);
    }

    return NextResponse.json({ 
      success: true, 
      processed: processedCount,
      errors: errors.length > 0 ? errors : undefined
    }, { status: 200 });

  } catch (error: unknown) {
    console.error("Unhandled error in process-recurrence route:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

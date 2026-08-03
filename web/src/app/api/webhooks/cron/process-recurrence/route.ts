import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { calculateNextRunAt, RecurrenceType } from "@/shared/lib/cron-utils";
import { processAnnouncementDeliveries } from "@/modules/announcements/services/deliveries";
import { applyPendingChecklistSections } from "@/modules/checklists/services/checklist-template.service";
import { parseChecklistSections } from "@/modules/checklists/lib/sections";
import { normalizeChecklistNotificationChannels } from "@/modules/checklists/lib/notification-channels";
import { processAnnouncementRecurrenceJob } from "@/modules/announcements/services/announcement-recurrence.service";

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
  schedule_revision: number;
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
      .select("id, organization_id, job_type, target_id, metadata, recurrence_type, cron_expression, custom_days, next_run_at, schedule_revision")
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
      const processingToken = crypto.randomUUID();
      try {
        const nextRun = calculateNextRunAt(
          job.recurrence_type as RecurrenceType,
          job.cron_expression,
          job.custom_days,
        );
        const runStartedAt = new Date().toISOString();

        const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_scheduled_job", {
          p_organization_id: job.organization_id,
          p_job_id: job.id,
          p_expected_next_run_at: job.next_run_at,
          p_processing_token: processingToken,
        });

        if (claimError) {
          throw new Error(`Failed to claim job: ${claimError.message}`);
        }

        if (!claimed) {
          continue;
        }

        console.info(`Processing job ${job.id} of type ${job.job_type}`);
        let jobRemoved = false;
        
        if (job.job_type === 'checklist_generator') {
           const { data: template } = await supabaseAdmin
             .from('checklist_templates')
             .select('name, target_scope, is_active, branch_id, department_id, organization_id, pending_sections')
             .eq('organization_id', job.organization_id)
             .eq('id', job.target_id)
             .maybeSingle();

             if (!template || !template.is_active) {
               const { error: deleteError } = await supabaseAdmin
                 .from("scheduled_jobs")
                 .delete()
                 .eq("organization_id", job.organization_id)
                 .eq("id", job.id)
                 .eq("processing_token", processingToken);
               if (deleteError) throw new Error(`Failed to remove orphan checklist job: ${deleteError.message}`);
               jobRemoved = true;
             }

            // Arranca una vuelta nueva: es el momento de aplicar los items que
           // quedaron pendientes por haberse editado con la vuelta anterior ya
           // en curso (ver upsertChecklistTemplate). Se aplica ANTES de avisar,
           // para que quien reciba el recordatorio ya vea la lista nueva.
           if (template?.pending_sections) {
             // parseChecklistSections acepta la forma vieja (items como texto) y
             // la nueva (items con id), asi que los pendientes ya guardados antes
             // del cambio siguen aplicandose.
             const sections = parseChecklistSections(template.pending_sections);

             const applied = await applyPendingChecklistSections({
               supabase: supabaseAdmin,
               organizationId: job.organization_id,
               templateId: job.target_id,
               sections,
             });

              if (!applied.ok) {
                throw new Error(`No se pudieron aplicar los items pendientes: ${applied.message}`);
              }
           }

           if (template && template.is_active) {
              const targetScope =
                template.target_scope && typeof template.target_scope === "object"
                  ? (template.target_scope as Record<string, unknown>)
                  : {};
               const notifyChannels = normalizeChecklistNotificationChannels(targetScope);

              const audienceInput = {
                supabase: supabaseAdmin,
                organizationId: template.organization_id,
                targetScope: targetScope,
                templateBranchId: template.branch_id,
                // Deja el envio atribuido a su plantilla y marcado como reparto
                // automatico: es lo que separa esta vuelta del aviso del alta en
                // el historial, que salen con el mismo titulo.
                templateId: job.target_id,
                origen: "recurrencia" as const,
              };

             try {
               // Import dynamico para no afectar ruta principal si falla
               const { sendChecklistAudienceEmail, sendChecklistAudiencePush } = await import('@/modules/checklists/services/checklist-audience.service');

               // El push es siempre activo (igual que en la creacion manual), no depende de notify_via.
               // Deja ademas la fila in_app de la campanita para todo el alcance,
               // haya o no suscripcion push: son los dos canales obligatorios.
               await sendChecklistAudiencePush({
                 ...audienceInput,
                 templateName: template.name,
                 event: "created",
                 itemsCount: 0,
               });

               // Email es el unico canal opcional. SMS esta discontinuado: si el
               // template guardado trae 'sms', normalizeChecklistNotificationChannels
               // ya lo descarto y aca nunca llega (ver notification-channels.ts).
               if (notifyChannels.includes("email")) {
                 await sendChecklistAudienceEmail({
                   ...audienceInput,
                   templateName: template.name,
                   event: "created",
                   itemsCount: 0,
                   actorEmail: "Sistema (Recurrencia)",
                 });
               }
             } catch (notiError) {
               console.error(`Failed to send recurrence notifications for checklist ${job.target_id}:`, notiError);
             }
           }
         } else if (job.job_type === 'announcement_delivery') {
            const recurrenceResult = await processAnnouncementRecurrenceJob({
              supabase: supabaseAdmin,
               job: { ...job, processing_token: processingToken },
              nextRun,
              now: new Date(runStartedAt),
             });
             pushDeliveriesToProcess ||= recurrenceResult.queued;
             jobRemoved = recurrenceResult.removed;
          }

        if (!jobRemoved) {
          const { data: completed, error: completeError } = await supabaseAdmin.rpc("complete_scheduled_job", {
            p_organization_id: job.organization_id,
            p_job_id: job.id,
            p_processing_token: processingToken,
            p_expected_revision: job.schedule_revision,
            p_next_run_at: nextRun.toISOString(),
            p_last_run_at: runStartedAt,
          });
          if (completeError) {
            throw new Error(`Failed to complete job: ${completeError.message}`);
          }
          if (!completed) {
            console.info(`Schedule ${job.id} changed while its claimed occurrence was running; preserving the newer schedule.`);
          }
        }

        processedCount++;
       } catch (err: unknown) {
         const { error: releaseError } = await supabaseAdmin.rpc("release_scheduled_job", {
           p_organization_id: job.organization_id,
           p_job_id: job.id,
           p_processing_token: processingToken,
         });
         if (releaseError) {
           console.error(`Error releasing job ${job.id}:`, releaseError);
         }
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

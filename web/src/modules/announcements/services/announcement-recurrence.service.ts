import type { SupabaseClient } from "@supabase/supabase-js";

// Canales oficiales del producto. SMS esta discontinuado: los scheduled_jobs
// creados antes del corte siguen teniendo "sms" en metadata.channels, y este
// filtro es lo que impide que vuelvan a encolar un envio en cada vuelta. No
// agregar "sms" de nuevo: la metadata vieja no se migro a proposito.
const DELIVERY_CHANNELS = new Set(["email", "in_app", "push"]);

export type AnnouncementRecurrenceJob = {
  id: string;
  organization_id: string;
  target_id: string;
  metadata: Record<string, unknown> | null;
  processing_token?: string;
};

export async function processAnnouncementRecurrenceJob(params: {
  supabase: SupabaseClient;
  job: AnnouncementRecurrenceJob;
  nextRun: Date;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const { data: announcement, error } = await params.supabase
    .from("announcements")
    .select("publish_at, expires_at")
    .eq("organization_id", params.job.organization_id)
    .eq("id", params.job.target_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load announcement: ${error.message}`);
  }

  if (!announcement) {
    await deleteJob(params.supabase, params.job);
    return { queued: false, removed: true, reason: "missing" as const };
  }

  const publishAt = announcement.publish_at ? new Date(announcement.publish_at) : null;
  const expiresAt = announcement.expires_at ? new Date(announcement.expires_at) : null;

  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    await deleteJob(params.supabase, params.job);
    return { queued: false, removed: true, reason: "expired" as const };
  }

  if (publishAt && publishAt.getTime() > now.getTime()) {
    return { queued: false, removed: false, reason: "unpublished" as const };
  }

  const configuredChannels = Array.isArray(params.job.metadata?.channels)
    ? params.job.metadata.channels.filter(
        (channel): channel is string => typeof channel === "string" && DELIVERY_CHANNELS.has(channel),
      )
    : ["email"];
  const channels = [...new Set(configuredChannels)];

  if (channels.length > 0) {
    const { error: insertError } = await params.supabase.from("announcement_deliveries").insert(
      channels.map((channel) => ({
        organization_id: params.job.organization_id,
        announcement_id: params.job.target_id,
        channel,
        status: "queued",
      })),
    );

    if (insertError) {
      throw new Error(`Failed to queue deliveries: ${insertError.message}`);
    }
  }

  const isLastRun = Boolean(expiresAt && params.nextRun.getTime() >= expiresAt.getTime());
  if (isLastRun) {
    await deleteJob(params.supabase, params.job);
  }

  return {
    queued: channels.length > 0,
    removed: isLastRun,
    reason: isLastRun ? "last_run" as const : "queued" as const,
  };
}

async function deleteJob(
  supabase: SupabaseClient,
  job: Pick<AnnouncementRecurrenceJob, "id" | "organization_id" | "processing_token">,
) {
  const { error } = await supabase
    .from("scheduled_jobs")
    .delete()
    .eq("organization_id", job.organization_id)
    .eq("id", job.id)
    .eq("processing_token", job.processing_token ?? "");

  if (error) {
    throw new Error(`Failed to remove announcement job: ${error.message}`);
  }
}

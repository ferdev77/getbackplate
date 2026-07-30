import type { SupabaseClient } from "@supabase/supabase-js";

import { processAnnouncementDeliveries } from "@/modules/announcements/services/deliveries";
import { calculateNextRunAt, RecurrenceType } from "@/shared/lib/cron-utils";

/**
 * Alta y edicion de un aviso, para los dos portales.
 *
 * Vive aparte porque el portal de empleado tiene su propia ruta y venia con su
 * propia copia a medias: guardaba el aviso pero nunca encolaba las entregas ni
 * armaba el reparto periodico, asi que un aviso creado por un empleado no
 * notificaba a nadie.
 *
 * Lo propio de cada rol -- que locaciones puede alcanzar, a quien puede agregar,
 * que puede editar -- se resuelve antes de llamar a esto.
 */

export type AnnouncementScopePayload = {
  locations: string[];
  department_ids: string[];
  position_ids: string[];
  users: string[];
};

export type UpsertAnnouncementInput = {
  supabase: SupabaseClient;
  organizationId: string;
  createdBy: string | null;
  /** null para crear. */
  announcementId: string | null;
  title: string;
  body: string;
  kind: string;
  isFeatured: boolean;
  expiresAt: string | null;
  scope: AnnouncementScopePayload;
  /** Canales que se encolan ahora (push, email, sms). */
  deliveryChannels: string[];
  recurrence?: {
    isRecurring: boolean;
    recurrenceType: string;
    customDays: number[];
    /** Canales que usara cada reparto periodico. */
    channels: string[];
  };
};

export type UpsertAnnouncementResult =
  | { ok: true; announcementId: string; sentContactsCount: number }
  | { ok: false; message: string };

export async function upsertAnnouncement(
  input: UpsertAnnouncementInput,
): Promise<UpsertAnnouncementResult> {
  const { supabase, organizationId, announcementId } = input;

  if (announcementId) {
    const { data: existing } = await supabase
      .from("announcements")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", announcementId)
      .maybeSingle();

    if (!existing) {
      return { ok: false, message: "No se encontró el aviso que se quiere editar" };
    }
  }

  const payload = {
    branch_id: null,
    title: input.title,
    body: input.body,
    kind: input.kind,
    is_featured: input.isFeatured,
    expires_at: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    // La unica fuente de verdad del alcance es target_scope (ver
    // README_SCOPE_GOLDEN_RULE.md).
    target_scope: input.scope,
  };

  const mutation = announcementId
    ? await supabase
        .from("announcements")
        .update(payload)
        .eq("organization_id", organizationId)
        .eq("id", announcementId)
        .select("id")
        .single()
    : await supabase
        .from("announcements")
        .insert({
          organization_id: organizationId,
          created_by: input.createdBy,
          publish_at: new Date().toISOString(),
          ...payload,
        })
        .select("id")
        .single();

  const { data: announcement, error } = mutation;
  if (error || !announcement) {
    return { ok: false, message: `No se pudo guardar el aviso: ${error?.message ?? "error"}` };
  }

  let sentContactsCount = 0;

  if (input.deliveryChannels.length > 0) {
    const { error: deliveriesError } = await supabase.from("announcement_deliveries").insert(
      input.deliveryChannels.map((channel) => ({
        organization_id: organizationId,
        announcement_id: announcement.id,
        channel,
        status: "queued",
      })),
    );

    if (deliveriesError) {
      return {
        ok: false,
        message: `El aviso se guardó, pero la notificación no se pudo encolar: ${deliveriesError.message}`,
      };
    }

    const deliveryResult = await processAnnouncementDeliveries();
    if (deliveryResult.success && typeof deliveryResult.sentContactsCount === "number") {
      sentContactsCount = deliveryResult.sentContactsCount;
    }
  }

  await syncAnnouncementScheduledJob({
    supabase,
    organizationId,
    announcementId: announcement.id,
    recurrence: input.recurrence,
  });

  return { ok: true, announcementId: announcement.id, sentContactsCount };
}

/** Deja el reparto periodico del aviso en sincronia con lo elegido. */
async function syncAnnouncementScheduledJob(params: {
  supabase: SupabaseClient;
  organizationId: string;
  announcementId: string;
  recurrence?: UpsertAnnouncementInput["recurrence"];
}) {
  const { supabase, organizationId, announcementId, recurrence } = params;

  if (!recurrence?.isRecurring) {
    // Si le sacaron la periodicidad, el reparto no debe seguir existiendo.
    await supabase
      .from("scheduled_jobs")
      .delete()
      .eq("organization_id", organizationId)
      .eq("job_type", "announcement_delivery")
      .eq("target_id", announcementId);
    return;
  }

  const nextRun = calculateNextRunAt(
    recurrence.recurrenceType as RecurrenceType,
    null,
    recurrence.customDays,
  );

  const { data: existingJob } = await supabase
    .from("scheduled_jobs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("job_type", "announcement_delivery")
    .eq("target_id", announcementId)
    .maybeSingle();

  if (existingJob) {
    await supabase
      .from("scheduled_jobs")
      .update({
        recurrence_type: recurrence.recurrenceType,
        custom_days: recurrence.customDays,
        next_run_at: nextRun.toISOString(),
        metadata: { channels: recurrence.channels },
      })
      .eq("id", existingJob.id);
    return;
  }

  await supabase.from("scheduled_jobs").insert({
    organization_id: organizationId,
    job_type: "announcement_delivery",
    target_id: announcementId,
    recurrence_type: recurrence.recurrenceType,
    custom_days: recurrence.customDays,
    next_run_at: nextRun.toISOString(),
    metadata: { channels: recurrence.channels },
  });
}

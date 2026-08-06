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
  const now = new Date();
  const normalizedExpiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : null;
  const nextRun = input.recurrence?.isRecurring
    ? calculateNextRunAt(
        input.recurrence.recurrenceType as RecurrenceType,
        null,
        input.recurrence.customDays,
        now,
      )
    : null;
  const expiresAt = normalizedExpiresAt ? new Date(normalizedExpiresAt) : null;
  const shouldRun = Boolean(
    input.recurrence?.isRecurring
    && nextRun
    && (!expiresAt || (expiresAt.getTime() > now.getTime() && nextRun.getTime() < expiresAt.getTime())),
  );
  const { data: savedAnnouncementId, error } = await supabase.rpc("save_announcement_transaction", {
    p_organization_id: organizationId,
    p_announcement_id: announcementId,
    p_created_by: input.createdBy,
    p_title: input.title,
    p_body: input.body,
    p_kind: input.kind,
    p_is_featured: input.isFeatured,
    p_expires_at: normalizedExpiresAt,
    p_publish_at: now.toISOString(),
    // La unica fuente de verdad del alcance es target_scope.
    p_target_scope: input.scope,
    p_should_run: shouldRun,
    p_recurrence_type: input.recurrence?.recurrenceType ?? "none",
    p_custom_days: input.recurrence?.customDays ?? [],
    p_next_run_at: shouldRun && nextRun ? nextRun.toISOString() : null,
    p_schedule_metadata: { channels: input.recurrence?.channels ?? [] },
  });

  if (error || typeof savedAnnouncementId !== "string") {
    if (error?.message === "announcement_not_found") {
      return { ok: false, message: "No se encontró el aviso que se quiere editar" };
    }
    if (error?.code === "40001") {
      return { ok: false, message: "El aviso se está repartiendo en este momento. Vuelve a intentarlo en unos minutos." };
    }
    return { ok: false, message: `No se pudo guardar el aviso: ${error?.message ?? "error"}` };
  }

  let sentContactsCount = 0;

  const isActive = !normalizedExpiresAt || new Date(normalizedExpiresAt).getTime() > now.getTime();

  // La notificacion inmediata pertenece a la publicacion. Una edicion solo
  // cambia lo que se ve y, si corresponde, la configuracion futura.
  if (!announcementId && isActive && input.deliveryChannels.length > 0) {
    const { error: deliveriesError } = await supabase.from("announcement_deliveries").insert(
      input.deliveryChannels.map((channel) => ({
        organization_id: organizationId,
        announcement_id: savedAnnouncementId,
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

  if (announcementId && !isActive) {
    await supabase
      .from("announcement_deliveries")
      .update({ status: "expired" })
      .eq("organization_id", organizationId)
      .eq("announcement_id", savedAnnouncementId)
      .eq("status", "queued");
  }

  return { ok: true, announcementId: savedAnnouncementId, sentContactsCount };
}

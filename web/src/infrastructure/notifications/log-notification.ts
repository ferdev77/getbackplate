import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export type LogNotificationInput = {
  channel: "email" | "push" | "in_app";
  userId?: string | null;
  organizationId?: string | null;
  title: string;
  body: string;
  actionUrl?: string | null;
  source: string;
  sourceId?: string | null;
  recipientEmail?: string | null;
  status: "sent" | "failed";
  createdBy?: string | null;
  metadata?: Record<string, unknown>;
};

export async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("get_user_id_by_email", { lookup_email: email });
  if (error) return null;
  return (data as string | null) ?? null;
}

function toRow(input: LogNotificationInput, resolvedUserId: string | null) {
  return {
    channel: input.channel,
    user_id: resolvedUserId,
    organization_id: input.organizationId ?? null,
    title: input.title,
    body: input.body,
    action_url: input.actionUrl ?? null,
    source: input.source,
    source_id: input.sourceId ?? null,
    recipient_email: input.recipientEmail ?? null,
    status: input.status,
    created_by: input.createdBy ?? null,
    metadata: input.metadata ?? {},
  };
}

/**
 * Variante para insertar muchas notificaciones de una sola vez (ej: push a N usuarios de una org).
 * Resuelve cada fila por separado porque cada destinatario puede tener un userId distinto.
 */
export async function logNotificationsBulk(inputs: LogNotificationInput[]): Promise<void> {
  if (!inputs.length) return;
  try {
    const rows = inputs.map((input) => toRow(input, input.userId ?? null));
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) {
      console.error("[notifications] Error guardando notificaciones en lote:", error.message);
    }
  } catch (err) {
    console.error("[notifications] Error inesperado guardando notificaciones en lote:", err);
  }
}

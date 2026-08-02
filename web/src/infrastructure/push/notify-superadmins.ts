import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToUsers, type PushNotificationOptions } from "./send-to-org";
import type { PushPayload } from "./web-push";

/**
 * Avisa a todos los superadmins, sin excepcion -- no hay opt-in granular por
 * tipo de alerta (ver DOCS/4_Operaciones_y_Guias/GUIA_PUSH_NOTIFICATIONS.md):
 * quien quiere dejar de recibir push lo hace desde el permiso del navegador,
 * no desde un toggle por feature. sendPushToUsers ya garantiza la campanita
 * a todos, tengan o no push activo en ese momento.
 */
export async function notifySuperadmins(
  payload: PushPayload,
  options: PushNotificationOptions,
): Promise<{ sent: number; expired: number; failed: number }> {
  const admin = createSupabaseAdminClient();

  const { data: superadmins, error } = await admin.from("superadmin_users").select("user_id");
  if (error) throw new Error(error.message);

  const superadminIds = Array.from(new Set((superadmins ?? []).map((s) => String(s.user_id))));
  if (superadminIds.length === 0) return { sent: 0, expired: 0, failed: 0 };

  return sendPushToUsers(superadminIds, payload, options);
}

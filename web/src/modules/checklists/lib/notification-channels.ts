/**
 * Canales de notificacion configurables de un checklist.
 *
 * SMS ESTA DISCONTINUADO. No es una pausa ni un feature flag apagado: se saco
 * del producto. Los canales oficiales son tres y solo uno se configura aca:
 *
 *   in_app  campanita   siempre, no configurable (ver send-to-org.ts)
 *   push    dispositivo siempre, no configurable, independiente de in_app
 *   email   correo      opcional, es lo unico que devuelve esta funcion
 *
 * El valor 'sms' sigue existiendo en datos guardados de antes: hay checklists
 * en produccion con "sms" o "all" en notify_channels. readChannels los ignora a
 * proposito, asi que esos registros dejaron de mandar SMS. No hace falta migrar
 * la base: el dato viejo queda, pero ya no dispara nada.
 *
 * Si vas a "arreglar" esto porque ves 'sms' en la base o en una migracion: no
 * lo reactives. Es intencional.
 */

export type ChecklistNotificationChannel = "email";

const CHANNELS = new Set<ChecklistNotificationChannel>(["email"]);

function readChannels(value: unknown): ChecklistNotificationChannel[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const result = new Set<ChecklistNotificationChannel>();

  for (const raw of values) {
    const channel = String(raw).trim().toLowerCase();
    // 'all' significaba email + sms. Ahora solo queda el email.
    if (channel === "all") {
      result.add("email");
    } else if (CHANNELS.has(channel as ChecklistNotificationChannel)) {
      result.add(channel as ChecklistNotificationChannel);
    }
    // Cualquier otro valor guardado ('sms', y lo que hubiera antes) se descarta.
  }

  return [...result];
}

export function normalizeChecklistNotificationChannels(
  targetScope: unknown,
): ChecklistNotificationChannel[] {
  if (!targetScope || typeof targetScope !== "object") return [];
  const scope = targetScope as Record<string, unknown>;

  // An explicitly persisted canonical value, including [], always wins.
  if (Object.prototype.hasOwnProperty.call(scope, "notify_channels")) {
    return readChannels(scope.notify_channels);
  }

  return readChannels(scope.notify_via);
}

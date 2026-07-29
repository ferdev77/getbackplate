import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { resolveAudienceContacts } from "@/shared/lib/audience-resolver";

/**
 * Notificaciones de documentos y carpetas.
 *
 * Avisos y checklists notifican a su audiencia al crearse; documentos y
 * carpetas no notificaban nada, asi que compartir un documento con alguien no
 * le llegaba por ningun lado y solo se enteraba si entraba a mirar.
 *
 * Resuelve la audiencia con el mismo `resolveAudienceContacts` que usan avisos
 * y checklists, para que "a quien le llega" sea exactamente el mismo conjunto
 * que "quien puede verlo" (ver web/README_SCOPE_GOLDEN_RULE.md).
 *
 * Canal: push, y `sendPushToUsers` garantiza la entrada en la campanita para
 * todo destinatario que no haya recibido el push. No manda email: documentos no
 * tiene seleccion de canales como avisos y checklists.
 */

type DocumentAudienceInput = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  organizationId: string;
  /** Alcance efectivo: el propio, o el heredado de la carpeta si no tiene. */
  accessScope: unknown;
  /** Sucursal propia del documento o carpeta, si tiene. */
  branchId?: string | null;
  /** Quien lo subio o creo: no se notifica a si mismo. */
  actorUserId?: string | null;
  title: string;
};

function parseScope(value: unknown) {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const list = (key: string) =>
    Array.isArray(raw[key]) ? (raw[key] as unknown[]).filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];

  return {
    locations: list("locations"),
    department_ids: list("department_ids"),
    position_ids: list("position_ids"),
    users: list("users"),
  };
}

async function notify(input: DocumentAudienceInput & { kind: "document" | "folder" }) {
  const contacts = await resolveAudienceContacts({
    supabase: input.supabase,
    organizationId: input.organizationId,
    scope: parseScope(input.accessScope),
    templateBranchId: input.branchId ?? null,
  });

  const recipients = contacts.userIds.filter((userId) => userId && userId !== input.actorUserId);
  if (!recipients.length) return 0;

  const result = await sendPushToUsers(
    recipients,
    {
      title: input.kind === "document" ? "Nuevo documento" : "Nueva carpeta",
      body: input.title,
      url: "/portal/documents",
    },
    { source: "documents", organizationId: input.organizationId },
  );

  return result.sent;
}

export async function sendDocumentAudiencePush(input: DocumentAudienceInput) {
  return notify({ ...input, kind: "document" });
}

export async function sendFolderAudiencePush(input: DocumentAudienceInput) {
  return notify({ ...input, kind: "folder" });
}

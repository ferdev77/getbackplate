import { sendPushPorRol } from "@/shared/lib/notification-links";
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

  // La audiencia de un documento puede incluir admins: el link no puede ser el
  // del portal para todos.
  return sendPushPorRol({
    supabase: input.supabase,
    organizationId: input.organizationId,
    userIds: recipients,
    payload: {
      title: input.kind === "document" ? "Nuevo documento" : "Nueva carpeta",
      body: input.title,
    },
    adminUrl: "/app/documents",
    employeeUrl: "/portal/documents",
    options: { source: "documents", organizationId: input.organizationId },
  });
}

export async function sendDocumentAudiencePush(input: DocumentAudienceInput) {
  return notify({ ...input, kind: "document" });
}

export async function sendFolderAudiencePush(input: DocumentAudienceInput) {
  return notify({ ...input, kind: "folder" });
}

/**
 * Cambio el alcance de un documento o carpeta.
 *
 * Solo se avisa a quien *gana* acceso: se compara la audiencia anterior con la
 * nueva y se notifica la diferencia. Avisarle a todos seria ruido -- los que ya
 * tenian acceso no se enteran de nada nuevo -- y a los que lo pierden no tiene
 * sentido avisarles de algo que ya no pueden abrir.
 */
export async function notifyDocumentAccessGranted(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  organizationId: string;
  kind: "document" | "folder";
  title: string;
  scopeAnterior: unknown;
  scopeNuevo: unknown;
  branchId?: string | null;
  actorUserId?: string | null;
}) {
  const [antes, ahora] = await Promise.all([
    resolveAudienceContacts({
      supabase: input.supabase,
      organizationId: input.organizationId,
      scope: parseScope(input.scopeAnterior),
      templateBranchId: input.branchId ?? null,
    }),
    resolveAudienceContacts({
      supabase: input.supabase,
      organizationId: input.organizationId,
      scope: parseScope(input.scopeNuevo),
      templateBranchId: input.branchId ?? null,
    }),
  ]);

  const yaTenian = new Set(antes.userIds);
  const nuevos = ahora.userIds.filter(
    (userId) => userId && userId !== input.actorUserId && !yaTenian.has(userId),
  );

  if (!nuevos.length) return 0;

  return sendPushPorRol({
    supabase: input.supabase,
    organizationId: input.organizationId,
    userIds: nuevos,
    payload: {
      title: input.kind === "document" ? "Tenés acceso a un documento" : "Tenés acceso a una carpeta",
      body: input.title,
    },
    adminUrl: "/app/documents",
    employeeUrl: "/portal/documents",
    options: { source: "documents_access_granted", organizationId: input.organizationId },
  });
}

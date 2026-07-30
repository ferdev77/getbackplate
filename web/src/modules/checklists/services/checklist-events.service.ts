import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPushToUsers } from "@/infrastructure/push/send-to-org";

/**
 * Avisos de los dos momentos del ciclo de un checklist: cuando alguien lo
 * completa y cuando alguien marca ese reporte como revisado.
 *
 * Ninguno de los dos avisaba nada. Habia notificaciones de "checklist creado",
 * pero enviar y revisar pasaban en silencio: quien lo creo no se enteraba de que
 * ya tenia un reporte esperando, y quien lo completo no sabia si alguien lo miro.
 *
 * `sendPushToUsers` registra tambien la notificacion interna (la campanita), asi
 * que una sola llamada cubre los dos canales.
 */

/** Company admins de la organizacion, que ven todos los reportes. */
async function companyAdminUserIds(supabase: SupabaseClient, organizationId: string) {
  const { data: rol } = await supabase.from("roles").select("id").eq("code", "company_admin").maybeSingle();
  if (!rol?.id) return [];

  const { data: filas } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role_id", rol.id)
    .eq("status", "active");

  return (filas ?? []).map((fila) => fila.user_id).filter((id): id is string => Boolean(id));
}

function destinatarios(candidatos: Array<string | null | undefined>, excluir: string | null) {
  // Nadie se notifica a si mismo por algo que acaba de hacer.
  return [...new Set(candidatos.filter((id): id is string => Boolean(id) && id !== excluir))];
}

/**
 * Alguien completo y envio un checklist.
 *
 * Le llega a quien lo creo -- que es quien tiene que revisarlo -- y a los
 * company admins, que ven todos los reportes.
 */
export async function notifyChecklistSubmitted(params: {
  supabase: SupabaseClient;
  organizationId: string;
  templateId: string | null;
  templateName: string;
  templateCreatedBy: string | null;
  submittedByUserId: string;
  itemsCount: number;
  flaggedCount: number;
}) {
  const admins = await companyAdminUserIds(params.supabase, params.organizationId);
  const userIds = destinatarios([params.templateCreatedBy, ...admins], params.submittedByUserId);
  if (userIds.length === 0) return 0;

  const detalle =
    params.flaggedCount > 0
      ? `${params.itemsCount} ítems · ${params.flaggedCount} para atención`
      : `${params.itemsCount} ítems · sin novedades`;

  const { sent } = await sendPushToUsers(
    userIds,
    { title: `Checklist completado: ${params.templateName}`, body: detalle, url: "/app/reports" },
    { source: "checklist_submitted", organizationId: params.organizationId },
  );

  return sent;
}

/**
 * Alguien marco un reporte como revisado.
 *
 * Le llega a quien lo completo -- para que sepa que su trabajo fue mirado -- y a
 * quien creo el checklist, util cuando el que revisa es otra persona.
 */
export async function notifyChecklistReviewed(params: {
  supabase: SupabaseClient;
  organizationId: string;
  templateName: string;
  templateCreatedBy: string | null;
  submittedByUserId: string | null;
  reviewedByUserId: string;
}) {
  const userIds = destinatarios(
    [params.submittedByUserId, params.templateCreatedBy],
    params.reviewedByUserId,
  );
  if (userIds.length === 0) return 0;

  const { sent } = await sendPushToUsers(
    userIds,
    {
      title: `Reporte revisado: ${params.templateName}`,
      body: "El reporte ya fue revisado.",
      url: "/app/reports",
    },
    { source: "checklist_reviewed", organizationId: params.organizationId },
  );

  return sent;
}

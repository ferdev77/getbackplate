import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPushPorRol } from "@/shared/lib/notification-links";

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

  // Entre los destinatarios esta quien creo la plantilla, que puede ser un
  // empleado del portal: no todos van al panel de empresa.
  //
  // El link va a los reportes y no a la lista de checklists: a quien recibe
  // este aviso no le toca completar nada, le acaban de completar lo suyo y lo
  // que quiere ver es que marco la persona. El portal tiene su propia pantalla
  // de reportes, acotada a los checklists que uno creo.
  return sendPushPorRol({
    supabase: params.supabase,
    organizationId: params.organizationId,
    userIds,
    payload: { title: `Checklist completado: ${params.templateName}`, body: detalle },
    adminUrl: "/app/reports",
    employeeUrl: "/portal/checklist/reports",
    options: { source: "checklist_submitted", organizationId: params.organizationId },
  });
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

  // Quien completo el reporte es casi siempre gente del portal: sin partir el
  // link, el aviso de "ya te lo revisaron" lo mandaba al panel de empresa.
  //
  // Va a los reportes, igual que el aviso de completado: lo que se anuncia es
  // el estado de un reporte, no una tarea pendiente.
  return sendPushPorRol({
    supabase: params.supabase,
    organizationId: params.organizationId,
    userIds,
    payload: {
      title: `Reporte revisado: ${params.templateName}`,
      body: "El reporte ya fue revisado.",
    },
    adminUrl: "/app/reports",
    employeeUrl: "/portal/checklist/reports",
    options: { source: "checklist_reviewed", organizationId: params.organizationId },
  });
}

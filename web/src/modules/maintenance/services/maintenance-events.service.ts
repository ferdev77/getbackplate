import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import {
  companyAdminUserIds,
  destinatarios,
  employeesWhoCanOperate,
} from "@/shared/lib/notification-recipients";

/**
 * Avisos del ciclo de una solicitud de mantenimiento.
 *
 * El modulo no emitia una sola notificacion: alguien reportaba que se rompio
 * algo y nadie se enteraba salvo que entrara a mirar la pantalla. Tampoco se
 * avisaba al que reporto cuando su solicitud avanzaba o se resolvia.
 *
 * `sendPushToUsers` registra tambien la notificacion interna, asi que una
 * llamada cubre la campanita y el telefono.
 */

const MODULO = "maintenance";
const URL_DESTINO = "/app/maintenance";

/** Quienes atienden mantenimiento: los admins y los empleados con permiso de operar. */
async function quienesAtienden(supabase: SupabaseClient, organizationId: string) {
  const [admins, operativos] = await Promise.all([
    companyAdminUserIds(supabase, organizationId),
    employeesWhoCanOperate(supabase, organizationId, MODULO),
  ]);
  return [...admins, ...operativos];
}

async function avisar(params: {
  supabase: SupabaseClient;
  organizationId: string;
  userIds: string[];
  title: string;
  body: string;
  source: string;
}) {
  if (params.userIds.length === 0) return 0;

  const { sent } = await sendPushToUsers(
    params.userIds,
    { title: params.title, body: params.body, url: URL_DESTINO },
    { source: params.source, organizationId: params.organizationId },
  );

  return sent;
}

/**
 * Se reporto algo nuevo.
 *
 * Le llega a los admins y a los empleados con permiso para operar mantenimiento,
 * que son quienes lo van a atender.
 */
export async function notifyMaintenanceRequested(params: {
  supabase: SupabaseClient;
  organizationId: string;
  title: string;
  priority: string | null;
  locationName: string | null;
  createdByUserId: string;
}) {
  const userIds = destinatarios(
    await quienesAtienden(params.supabase, params.organizationId),
    params.createdByUserId,
  );

  const detalle = [params.locationName, params.priority ? `Prioridad ${params.priority}` : null]
    .filter(Boolean)
    .join(" · ");

  return avisar({
    supabase: params.supabase,
    organizationId: params.organizationId,
    userIds,
    title: `Nueva solicitud de mantenimiento: ${params.title}`,
    body: detalle || "Sin detalles adicionales",
    source: "maintenance_requested",
  });
}

/**
 * La solicitud cambio de estado.
 *
 * Le llega a quien la reporto -- que es quien espera -- y al resto de los que
 * atienden, para que no dupliquen trabajo.
 */
export async function notifyMaintenanceStatusChanged(params: {
  supabase: SupabaseClient;
  organizationId: string;
  title: string;
  toStatus: string;
  requestedByUserId: string | null;
  actorUserId: string;
}) {
  const userIds = destinatarios(
    [params.requestedByUserId, ...(await quienesAtienden(params.supabase, params.organizationId))],
    params.actorUserId,
  );

  return avisar({
    supabase: params.supabase,
    organizationId: params.organizationId,
    userIds,
    title: `Mantenimiento: ${params.title}`,
    body: `Pasó a ${params.toStatus}`,
    source: "maintenance_status_changed",
  });
}

/**
 * Alguien dejo un avance, un comentario o programo la visita.
 *
 * Le llega a quien reporto y a los que atienden, menos a quien escribio.
 */
export async function notifyMaintenanceUpdate(params: {
  supabase: SupabaseClient;
  organizationId: string;
  title: string;
  message: string | null;
  scheduledVisitAt: string | null;
  requestedByUserId: string | null;
  actorUserId: string;
}) {
  const userIds = destinatarios(
    [params.requestedByUserId, ...(await quienesAtienden(params.supabase, params.organizationId))],
    params.actorUserId,
  );

  const cuerpo = params.scheduledVisitAt
    ? `Visita programada para el ${new Date(params.scheduledVisitAt).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
      })}`
    : (params.message ?? "").trim() || "Hay una novedad";

  return avisar({
    supabase: params.supabase,
    organizationId: params.organizationId,
    userIds,
    title: `Mantenimiento: ${params.title}`,
    body: cuerpo,
    source: params.scheduledVisitAt ? "maintenance_visit_scheduled" : "maintenance_update",
  });
}

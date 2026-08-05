import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { sendEmail } from "@/shared/lib/brevo";
import { getAuthEmailByUserId } from "@/shared/lib/auth-users";
import {
  companyAdminUserIds,
  employeesWhoCanOperate,
  employeesWhoCanOperateWithScope,
  isActiveMember,
} from "@/shared/lib/notification-recipients";
import { estadoEnPalabras, prioridadEnPalabras } from "@/modules/maintenance/lib/labels";

/**
 * "Quien reporto esto" puede ya no ser miembro real (ej: un superadmin que la
 * creo impersonando para probar el modulo) -- sin este chequeo, esa persona
 * recibe avisos de un tenant ajeno para siempre, cada vez que alguien mas
 * toque esa solicitud vieja.
 */
async function requesterSiSigueSiendoMiembro(
  supabase: SupabaseClient,
  organizationId: string,
  requestedByUserId: string | null,
) {
  if (!requestedByUserId) return null;
  const esMiembro = await isActiveMember(supabase, organizationId, requestedByUserId);
  return esMiembro ? requestedByUserId : null;
}

/**
 * Suma a quien reporto, que es quien espera la respuesta.
 *
 * Entra aunque la locacion no este entre las suyas: es su solicitud, la hizo el
 * mismo. Y se le aclara la sucursal, porque puede haber reportado algo de un
 * local que no es el suyo de todos los dias.
 */
async function conQuienReporto(
  params: { supabase: SupabaseClient; organizationId: string; requestedByUserId: string | null },
  atienden: DestinatarioDeMantenimiento[],
): Promise<DestinatarioDeMantenimiento[]> {
  const requestedBy = await requesterSiSigueSiendoMiembro(
    params.supabase,
    params.organizationId,
    params.requestedByUserId,
  );
  if (!requestedBy || atienden.some((p) => p.userId === requestedBy)) return atienden;
  return [{ userId: requestedBy, necesitaSaberLaLocacion: true, url: URL_EMPLEADO }, ...atienden];
}

/** Saca a quien acaba de hacer la accion: no necesita que le avisen de lo suyo. */
function sinElActor(gente: DestinatarioDeMantenimiento[], actorUserId: string | null) {
  const vistos = new Set<string>();
  return gente.filter((p) => {
    if (!p.userId || p.userId === actorUserId || vistos.has(p.userId)) return false;
    vistos.add(p.userId);
    return true;
  });
}

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
const URL_ADMIN = "/app/maintenance";
const URL_EMPLEADO = "/portal/maintenance";

/**
 * Quien atiende una solicitud de ESTA locacion.
 *
 * Los admins manejan la empresa entera, asi que entran siempre. Los empleados
 * solo si la locacion de la solicitud esta entre las suyas: antes no se miraba
 * la locacion en ningun momento y una encargada de un solo local recibia los
 * avisos de los siete, ninguno de ellos del suyo.
 *
 * Ademas se dice si cada uno maneja mas de una locacion. Eso decide si al aviso
 * le hace falta aclarar de que sucursal es: a quien tiene una sola, decirselo
 * no le aporta nada.
 */
export type DestinatarioDeMantenimiento = {
  userId: string;
  necesitaSaberLaLocacion: boolean;
  url: typeof URL_ADMIN | typeof URL_EMPLEADO;
};

async function quienesAtienden(
  supabase: SupabaseClient,
  organizationId: string,
  branchId: string | null,
): Promise<DestinatarioDeMantenimiento[]> {
  const [admins, operativos] = await Promise.all([
    companyAdminUserIds(supabase, organizationId),
    employeesWhoCanOperateWithScope(supabase, organizationId, MODULO),
  ]);

  const lista = new Map<string, DestinatarioDeMantenimiento>();

  // Un admin alcanza toda la organizacion: siempre le sirve saber de cual es.
  for (const userId of admins) {
    lista.set(userId, { userId, necesitaSaberLaLocacion: true, url: URL_ADMIN });
  }

  for (const persona of operativos) {
    if (lista.has(persona.userId)) continue;

    // Sin locacion en la solicitud no hay con que filtrar: se avisa igual, que
    // es preferible a que no se entere nadie.
    const alcanza =
      !branchId || persona.alcanzaTodas || persona.locationIds.includes(branchId);
    if (!alcanza) continue;

    lista.set(persona.userId, {
      userId: persona.userId,
      necesitaSaberLaLocacion: persona.alcanzaTodas || persona.locationIds.length > 1,
      url: URL_EMPLEADO,
    });
  }

  return [...lista.values()];
}

/**
 * Manda el aviso, aclarando de que sucursal es solo a quien maneja mas de una.
 *
 * Se agrupa por portal y por necesidad de aclarar la locacion: el cuerpo y la
 * URL son unicos por envio.
 */
async function avisar(params: {
  supabase: SupabaseClient;
  organizationId: string;
  gente: DestinatarioDeMantenimiento[];
  title: string;
  /** Sin la locacion; se antepone a quien la necesita. */
  body: string;
  locationName: string | null;
  source: string;
}) {
  if (params.gente.length === 0) return 0;

  const enviar = async (userIds: string[], body: string, url: DestinatarioDeMantenimiento["url"]) => {
    if (userIds.length === 0) return 0;
    const { sent } = await sendPushToUsers(
      userIds,
      { title: params.title, body, url },
      { source: params.source, organizationId: params.organizationId },
    );
    return sent;
  };

  const envios: Array<Promise<number>> = [];
  for (const url of [URL_ADMIN, URL_EMPLEADO] as const) {
    const deEsePortal = params.gente.filter((persona) => persona.url === url);
    const conLocacion = params.locationName
      ? deEsePortal.filter((persona) => persona.necesitaSaberLaLocacion).map((persona) => persona.userId)
      : [];
    const sinLocacion = deEsePortal
      .filter((persona) => !params.locationName || !persona.necesitaSaberLaLocacion)
      .map((persona) => persona.userId);

    envios.push(
      enviar(conLocacion, [params.locationName, params.body].filter(Boolean).join(" · "), url),
      enviar(sinLocacion, params.body, url),
    );
  }

  return (await Promise.all(envios)).reduce((total, sent) => total + sent, 0);
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
  /** La locacion de la solicitud: acota a quien se le avisa. */
  branchId: string | null;
  locationName: string | null;
  createdByUserId: string;
}) {
  const gente = sinElActor(
    await quienesAtienden(params.supabase, params.organizationId, params.branchId),
    params.createdByUserId,
  );

  const prioridad = prioridadEnPalabras(params.priority);

  return avisar({
    supabase: params.supabase,
    organizationId: params.organizationId,
    gente,
    title: `Nueva solicitud de mantenimiento: ${params.title}`,
    body: prioridad ? `Prioridad ${prioridad}` : "Sin detalles adicionales",
    locationName: params.locationName,
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
  branchId: string | null;
  locationName: string | null;
  requestedByUserId: string | null;
  actorUserId: string;
}) {
  const gente = sinElActor(
    await conQuienReporto(params, await quienesAtienden(params.supabase, params.organizationId, params.branchId)),
    params.actorUserId,
  );

  return avisar({
    supabase: params.supabase,
    organizationId: params.organizationId,
    gente,
    title: `Mantenimiento: ${params.title}`,
    body: `Pasó a ${estadoEnPalabras(params.toStatus)}`,
    locationName: params.locationName,
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
  branchId: string | null;
  locationName: string | null;
  requestedByUserId: string | null;
  actorUserId: string;
}) {
  const gente = sinElActor(
    await conQuienReporto(params, await quienesAtienden(params.supabase, params.organizationId, params.branchId)),
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
    gente,
    title: `Mantenimiento: ${params.title}`,
    body: cuerpo,
    locationName: params.locationName,
    source: params.scheduledVisitAt ? "maintenance_visit_scheduled" : "maintenance_update",
  });
}

/** Para el texto libre que escribe la gente: el email se arma con HTML. */
function escaparHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A quien le llega un email de mantenimiento, y como se evita duplicarle la
 * fila de la campanita. Lo comparten el aviso de solicitud nueva y el de
 * respuesta: cambia el asunto y el cuerpo, no los destinatarios.
 *
 * Va a company_admins y a cualquiera con permiso de editar mantenimiento, sin
 * filtrar por locacion: el pedido fue explicito, "cualquiera que tenga [el
 * permiso]", no solo quienes atienden esa sucursal en particular.
 *
 * A quien ya le llego el push de este mismo cambio (los que atienden ESTA
 * locacion, via `quienesAtienden`) se le manda el email sin duplicar su fila
 * en la campanita -- ya tiene una. A quien tiene el permiso pero no cubre esta
 * sucursal (por eso no recibio el push) se le arma su propia fila, porque para
 * esa persona el email es la unica forma en que se entera.
 */
async function emailAQuienesAtienden(params: {
  supabase: SupabaseClient;
  organizationId: string;
  branchId: string | null;
  subject: string;
  htmlContent: string;
  actorUserId: string | null;
  source: string;
}): Promise<void> {
  const [admins, operativos, yaAvisadosPorPush] = await Promise.all([
    companyAdminUserIds(params.supabase, params.organizationId),
    employeesWhoCanOperate(params.supabase, params.organizationId, MODULO),
    quienesAtienden(params.supabase, params.organizationId, params.branchId),
  ]);

  const userIds = [...new Set([...admins, ...operativos])].filter((id) => id !== params.actorUserId);
  if (!userIds.length) return;

  const yaEnCampanita = new Set(yaAvisadosPorPush.map((p) => p.userId));
  const conCampanitaYa = userIds.filter((id) => yaEnCampanita.has(id));
  const sinCampanitaTodavia = userIds.filter((id) => !yaEnCampanita.has(id));

  const emailByUserId = await getAuthEmailByUserId(userIds);
  const { subject, htmlContent } = params;

  // Ya tienen fila en la campanita por el push: se manda igual el email, pero
  // sin que dispare una segunda fila para el mismo aviso.
  const paraConCampanita = conCampanitaYa
    .map((userId) => emailByUserId.get(userId))
    .filter((email): email is string => Boolean(email))
    .map((email) => ({ email }));

  const envios: Promise<unknown>[] = [];
  if (paraConCampanita.length) {
    envios.push(
      sendEmail({
        to: paraConCampanita,
        subject,
        htmlContent,
        notification: { source: params.source, organizationId: params.organizationId, userId: null },
      }),
    );
  }

  // No tienen fila todavia (el push no los alcanzo por locacion): el email es
  // la unica via, asi que cada uno se manda con su userId ya conocido -- se
  // le arma su propia fila en la campanita.
  for (const userId of sinCampanitaTodavia) {
    const email = emailByUserId.get(userId);
    if (!email) continue;
    envios.push(
      sendEmail({
        to: [{ email }],
        subject,
        htmlContent,
        notification: { source: params.source, organizationId: params.organizationId, userId },
      }),
    );
  }

  await Promise.all(envios);
}

/**
 * Manda por email la respuesta a una solicitud, cuando quien la escribe tilda
 * "Enviar por email" -- a diferencia del push/campanita (que ya llega siempre),
 * esto es opcional porque un email por cada comentario seria demasiado.
 */
export async function notifyMaintenanceResponseByEmail(params: {
  supabase: SupabaseClient;
  organizationId: string;
  branchId: string | null;
  title: string;
  body: string;
  actorUserId: string | null;
}): Promise<void> {
  await emailAQuienesAtienden({
    supabase: params.supabase,
    organizationId: params.organizationId,
    branchId: params.branchId,
    subject: `Mantenimiento: ${params.title}`,
    htmlContent: `<p>${params.body}</p>`,
    actorUserId: params.actorUserId,
    source: "maintenance_response_email",
  });
}

/**
 * Manda por email la solicitud recien creada, cuando quien la carga tilda
 * "Enviar por email" en el modal -- mismo criterio que la respuesta: el
 * push/campanita ya sale siempre, el email es la decision explicita de quien
 * escribe.
 *
 * No se manda para borradores: eso lo decide quien llama.
 *
 * A diferencia del push, el cuerpo lleva los detalles completos, porque quien
 * lo recibe puede resolverlo sin entrar al sistema.
 */
export async function notifyMaintenanceRequestedByEmail(params: {
  supabase: SupabaseClient;
  organizationId: string;
  branchId: string | null;
  title: string;
  description: string;
  priority: string | null;
  locationName: string | null;
  createdByUserId: string;
}): Promise<void> {
  const prioridad = prioridadEnPalabras(params.priority);
  const encabezado = [prioridad ? `Prioridad ${prioridad}` : null, params.locationName]
    .filter(Boolean)
    .join(" · ");

  await emailAQuienesAtienden({
    supabase: params.supabase,
    organizationId: params.organizationId,
    branchId: params.branchId,
    subject: `Nueva solicitud de mantenimiento: ${params.title}`,
    htmlContent: [
      encabezado ? `<p>${escaparHtml(encabezado)}</p>` : "",
      `<p>${escaparHtml(params.description)}</p>`,
    ]
      .filter(Boolean)
      .join(""),
    actorUserId: params.createdByUserId,
    source: "maintenance_requested_email",
  });
}

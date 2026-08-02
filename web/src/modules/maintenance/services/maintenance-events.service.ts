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
  return [{ userId: requestedBy, necesitaSaberLaLocacion: true }, ...atienden];
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
const URL_DESTINO = "/app/maintenance";

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
export type DestinatarioDeMantenimiento = { userId: string; necesitaSaberLaLocacion: boolean };

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
    lista.set(userId, { userId, necesitaSaberLaLocacion: true });
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
    });
  }

  return [...lista.values()];
}

/**
 * Manda el aviso, aclarando de que sucursal es solo a quien maneja mas de una.
 *
 * Van dos tandas porque el cuerpo del mensaje es uno solo por envio: a quien
 * tiene un solo local, nombrarselo no le agrega nada.
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

  const conLocacion = params.locationName
    ? params.gente.filter((p) => p.necesitaSaberLaLocacion).map((p) => p.userId)
    : [];
  const sinLocacion = params.gente
    .filter((p) => !params.locationName || !p.necesitaSaberLaLocacion)
    .map((p) => p.userId);

  const enviar = async (userIds: string[], body: string) => {
    if (userIds.length === 0) return 0;
    const { sent } = await sendPushToUsers(
      userIds,
      { title: params.title, body, url: URL_DESTINO },
      { source: params.source, organizationId: params.organizationId },
    );
    return sent;
  };

  const [a, b] = await Promise.all([
    enviar(conLocacion, [params.locationName, params.body].filter(Boolean).join(" · ")),
    enviar(sinLocacion, params.body),
  ]);

  return a + b;
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

/**
 * Manda por email la respuesta a una solicitud, cuando quien la escribe tilda
 * "Enviar por email" a proposito -- a diferencia del push/campanita (que ya
 * llega siempre), esto es opcional porque un email por cada comentario seria
 * demasiado.
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
export async function notifyMaintenanceResponseByEmail(params: {
  supabase: SupabaseClient;
  organizationId: string;
  branchId: string | null;
  title: string;
  body: string;
  actorUserId: string | null;
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
  const subject = `Mantenimiento: ${params.title}`;
  const htmlContent = `<p>${params.body}</p>`;

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
        notification: { source: "maintenance_response_email", organizationId: params.organizationId, userId: null },
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
        notification: { source: "maintenance_response_email", organizationId: params.organizationId, userId },
      }),
    );
  }

  await Promise.all(envios);
}

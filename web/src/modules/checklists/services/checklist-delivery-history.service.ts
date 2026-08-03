import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

/**
 * Historial de repartos de un checklist: que dia se repartio, a cuantos y a quienes.
 *
 * No hay tabla propia. La fuente es `notifications`, que ya guarda una fila por
 * destinatario de cada envio. Lo unico que faltaba era el `source_id`: sin el,
 * las filas decian source='checklist' y nada mas, y no habia forma de saber de
 * que plantilla eran (ver checklist-audience.service.ts).
 *
 * Se lee el canal `in_app` y no `push` a proposito: la campanita se escribe
 * SIEMPRE, para todo destinatario, tenga o no el dispositivo suscripto. Contar
 * push daria un numero mas bajo que la gente realmente alcanzada.
 *
 * Arranca vacio: los repartos anteriores al deploy no tienen source_id y no se
 * pueden atribuir. No es un error, es que antes el dato no se guardaba.
 */

/** Cuantas filas se traen. Alcanza para ~20 repartos de un equipo grande. */
const MAXIMO_DE_FILAS = 1000;

/** Cuantos repartos se devuelven, del mas nuevo al mas viejo. */
const MAXIMO_DE_REPARTOS = 20;

export type OrigenDelReparto = "alta" | "edicion" | "recurrencia" | "desconocido";

export type RepartoDelHistorial = {
  /** Momento del reparto, en ISO. */
  fecha: string;
  origen: OrigenDelReparto;
  /** A cuanta gente le llego. */
  cantidad: number;
  /** Nombres, para mostrar. Puede quedar corto si alguien no tiene ficha. */
  destinatarios: string[];
};

export type VisorDelHistorial = {
  userId: string | null;
  esCompanyAdmin: boolean;
};

/**
 * Quien puede ver el historial de un checklist.
 *
 * Un company_admin ve todos. Un empleado ve solo los que creo el: el modal de
 * vista previa del portal se abre para cualquier checklist *asignado*, no solo
 * para los propios, asi que sin este filtro un empleado veria los nombres de
 * todos sus companeros destinatarios.
 */
export function puedeVerHistorialDeRepartos(
  visor: VisorDelHistorial,
  templateCreatedBy: string | null | undefined,
): boolean {
  if (visor.esCompanyAdmin) return true;
  if (!visor.userId || !templateCreatedBy) return false;
  return visor.userId === templateCreatedBy;
}

/** Las filas de un mismo reparto se insertan juntas: se agrupan por minuto. */
function claveDelReparto(createdAt: string): string {
  return createdAt.slice(0, 16);
}

function leerOrigen(metadata: unknown): OrigenDelReparto {
  if (!metadata || typeof metadata !== "object") return "desconocido";
  const valor = (metadata as Record<string, unknown>).origen;
  if (valor === "alta" || valor === "edicion" || valor === "recurrencia") return valor;
  return "desconocido";
}

function nombreDe(fila: { first_name?: string | null; last_name?: string | null }): string {
  return [fila.first_name, fila.last_name].filter(Boolean).join(" ").trim();
}

export async function obtenerHistorialDeRepartos(params: {
  organizationId: string;
  templateId: string;
  visor: VisorDelHistorial;
  templateCreatedBy: string | null | undefined;
}): Promise<RepartoDelHistorial[]> {
  if (!puedeVerHistorialDeRepartos(params.visor, params.templateCreatedBy)) return [];
  if (!params.templateId) return [];

  const admin = createSupabaseAdminClient();

  // Se usa el cliente admin y se acota a la organizacion a mano: la RLS de
  // notifications deja ver solo las propias, y aca hace falta ver las de todo
  // el alcance. El permiso ya se resolvio arriba.
  const { data: filas, error } = await admin
    .from("notifications")
    .select("user_id, created_at, metadata")
    .eq("organization_id", params.organizationId)
    .eq("source", "checklist")
    .eq("source_id", params.templateId)
    .eq("channel", "in_app")
    .order("created_at", { ascending: false })
    .limit(MAXIMO_DE_FILAS);

  if (error || !filas?.length) return [];

  const grupos = new Map<string, { fecha: string; origen: OrigenDelReparto; userIds: Set<string> }>();
  for (const fila of filas) {
    if (!fila.created_at) continue;
    const clave = claveDelReparto(fila.created_at);
    const grupo = grupos.get(clave) ?? {
      fecha: fila.created_at,
      origen: leerOrigen(fila.metadata),
      userIds: new Set<string>(),
    };
    if (fila.user_id) grupo.userIds.add(fila.user_id);
    // Si alguna fila del lote trae origen, gana sobre 'desconocido'.
    if (grupo.origen === "desconocido") grupo.origen = leerOrigen(fila.metadata);
    grupos.set(clave, grupo);
  }

  const repartos = [...grupos.values()].slice(0, MAXIMO_DE_REPARTOS);
  const todosLosUserIds = [...new Set(repartos.flatMap((r) => [...r.userIds]))];

  const nombrePorUserId = await resolverNombres(admin, params.organizationId, todosLosUserIds);

  return repartos.map((reparto) => ({
    fecha: reparto.fecha,
    origen: reparto.origen,
    cantidad: reparto.userIds.size,
    destinatarios: [...reparto.userIds]
      .map((userId) => nombrePorUserId.get(userId) ?? "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  }));
}

/**
 * El nombre sale del legajo y, si no hay, del perfil de usuario de la
 * organizacion: no todo destinatario tiene ficha de empleado.
 */
async function resolverNombres(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const nombres = new Map<string, string>();
  if (userIds.length === 0) return nombres;

  const [{ data: empleados }, { data: perfiles }] = await Promise.all([
    admin
      .from("employees")
      .select("user_id, first_name, last_name")
      .eq("organization_id", organizationId)
      .in("user_id", userIds),
    admin
      .from("organization_user_profiles")
      .select("user_id, first_name, last_name")
      .eq("organization_id", organizationId)
      .in("user_id", userIds),
  ]);

  for (const fila of perfiles ?? []) {
    if (fila.user_id && nombreDe(fila)) nombres.set(fila.user_id, nombreDe(fila));
  }
  // El legajo pisa al perfil: es el dato que mantiene RRHH.
  for (const fila of empleados ?? []) {
    if (fila.user_id && nombreDe(fila)) nombres.set(fila.user_id, nombreDe(fila));
  }

  return nombres;
}

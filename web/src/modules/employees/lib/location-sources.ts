/**
 * Las locaciones de una persona: donde vive el dato y que significa cada lugar.
 *
 *   employees    la ASIGNACION. Existe con cuenta o sin ella. Cuando alguien esta en
 *                el legajo pero todavia no se le dio de alta -- ficha
 *                incompleta, o se decidio no darle acceso -- sus locaciones
 *                viven aca y no hacen nada todavia.
 *
 *   memberships  el ACCESO. Solo existe si la persona tiene cuenta. Al activarla
 *                se le copian las locaciones del legajo, y a partir de ahi es lo
 *                que decide que ve.
 *
 *   organization_user_profiles   una proyeccion para listados. No deberia
 *                decidir nada.
 *
 * Sin cuenta no se ve nada, tenga las locaciones que tenga: no hay con que
 * entrar. Por eso la asignacion puede esperar en el legajo sin consecuencias.
 *
 * Al leer se combinan las fuentes en vez de mirar solo la membresia. Es a
 * proposito: es un superconjunto que hoy da identico -- verificado, ninguna
 * membresia activa tiene menos locaciones que su legajo -- y protege del caso en
 * que una membresia se cree sin locaciones. Cuando las columnas duplicadas se
 * borren, la combinacion queda leyendo solo la membresia sola.
 *
 * La regla de combinacion, en un solo lugar.
 *
 * Las locaciones se guardan por triplicado -- en `employees`, `memberships` y
 * `organization_user_profiles` -- y en cada una hay tres campos: la sucursal
 * base, las asignadas y el permiso de todas. Cada lugar que combinaba eso a mano
 * lo hacia un poco distinto, y de ahi salieron los desfases: alguien veia un
 * checklist y no podia abrirlo, o no aparecia al filtrar por una locacion que si
 * tenia.
 *
 * Quien necesite saber el alcance de una persona usa esto. Las pantallas que
 * editan esos campos siguen leyendolos directo: ahi no se esta decidiendo un
 * acceso, se esta mostrando un formulario.
 */

/** Una fila con campos de alcance, venga de la tabla que venga. */
export type FuenteDeLocaciones = {
  branch_id?: string | null;
  all_locations?: boolean | null;
  location_scope_ids?: string[] | null;
};

/**
 * Combina todas las fuentes de una persona.
 *
 * Si cualquiera dice "todas", son todas. Si no, se suman las locaciones sueltas
 * de todas las fuentes, sin repetir.
 */
export function combinarLocaciones(input: {
  fuentes: Array<FuenteDeLocaciones | null | undefined>;
  /** Locaciones activas de la organizacion, para resolver "todas". */
  todasLasLocaciones: string[];
  /** Locacion del contexto actual, si la hay. */
  locacionDelContexto?: string | null;
}): { locationIds: string[]; alcanzaTodas: boolean } {
  const fuentes = input.fuentes.filter((fuente): fuente is FuenteDeLocaciones => Boolean(fuente));

  const alcanzaTodas = fuentes.some((fuente) => fuente.all_locations === true);
  if (alcanzaTodas) {
    return { locationIds: [...new Set(input.todasLasLocaciones.filter(Boolean))], alcanzaTodas: true };
  }

  const sueltas = [
    input.locacionDelContexto,
    ...fuentes.flatMap((fuente) => [
      fuente.branch_id,
      ...(Array.isArray(fuente.location_scope_ids) ? fuente.location_scope_ids : []),
    ]),
  ];

  return {
    locationIds: [...new Set(sueltas.filter((id): id is string => Boolean(id)))],
    alcanzaTodas: false,
  };
}

/** Atajo para cuando solo hace falta la lista. */
export function locacionesDe(
  fuentes: Array<FuenteDeLocaciones | null | undefined>,
  todasLasLocaciones: string[],
) {
  return combinarLocaciones({ fuentes, todasLasLocaciones }).locationIds;
}

/**
 * Los campos de alcance tal como se guardan.
 *
 * Existe para que todos los que escriben usen exactamente la misma forma. Hoy el
 * dato se guarda en tres tablas y el riesgo no es que una diga algo distinto
 * -- se escriben juntas, con los mismos valores -- sino que alguien agregue un
 * cuarto lugar y se olvide de uno.
 *
 * Cuando el modelo se unifique en una sola tabla, este es el unico lugar que
 * cambia.
 */
export function camposDeAlcance(input: {
  branchId: string | null;
  allLocations: boolean;
  locationScopeIds: string[];
}) {
  return {
    branch_id: input.branchId,
    all_locations: input.allLocations,
    // Con "todas" las asignadas sobran: guardarlas invita a que las dos cosas
    // digan cosas distintas mas adelante.
    location_scope_ids: input.allLocations ? [] : [...new Set(input.locationScopeIds.filter(Boolean))],
  };
}

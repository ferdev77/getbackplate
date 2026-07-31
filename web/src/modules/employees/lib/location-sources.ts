/**
 * La regla de "que locaciones alcanza una persona", en un solo lugar.
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

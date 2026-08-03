"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  deriveScopeMode,
  effectiveScopeLocations,
  emitScopeForMode,
  makeScopeMatcher,
  scopeSubjectOverlapsLocations,
  validateScopeMode,
  type ScopeMode,
  type ScopeRestriction,
} from "@/shared/lib/scope-selector-model";

/**
 * Selector de alcance compartido por avisos, checklists, documentos y carpetas.
 *
 * La regla de alcance vive en scope-policy.ts (lado servidor) y en las
 * funciones de Postgres; aca solo se la explica y se la construye. Ver
 * README_SCOPE_GOLDEN_RULE.md.
 *
 * El punto de la pantalla es que el usuario no tenga que deducir la regla a
 * partir de casillas sueltas: elige una de tres intenciones y ve, al lado, a
 * quien alcanza de verdad.
 */

export type { ScopeMode };

export type ScopeSelectorUser = {
  id: string;
  user_id: string | null;
  branch_id?: string | null;
  location_ids?: string[];
  department_id?: string | null;
  position_id?: string | null;
  first_name: string;
  last_name: string;
  role_label?: string;
  location_label?: string;
  department_label?: string;
  position_label?: string;
};

export type ScopeSelectorProps = {
  namespace: string;
  branches: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  positions?: Array<{ id: string; department_id: string; name: string }>;
  users: ScopeSelectorUser[];
  locationInputName: string;
  departmentInputName: string;
  positionInputName?: string;
  userInputName: string;
  /**
   * Manda la intencion elegida junto con las listas. Sin esto, un alcance vacio
   * es ambiguo: puede ser "toda la organizacion" a proposito o un descuido. Con
   * esto el servidor puede distinguirlos (ver assertScopeIntent).
   */
  modeInputName?: string;
  initialLocations?: string[];
  initialDepartments?: string[];
  initialPositions?: string[];
  initialUsers?: string[];
  allowedLocationIds?: string[];
  lockLocationSelection?: boolean;
  locationHelperText?: string;
  /** Pregunta del encabezado, segun lo que se este creando. */
  question?: string;
  /** Titulo de la columna de audiencia: "Lo veran", "Lo completaran"... */
  audienceLabel?: string;
  /** Avisa al modal si el alcance esta completo, para habilitar Guardar. */
  onValidityChange?: (valid: boolean) => void;
};

const MODE_HINT: Record<ScopeMode, string> = {
  all: "Queda abierto. Si mañana entra alguien nuevo, también entra.",
  group: "El grupo se recalcula solo cuando alguien cambia de puesto o de locación.",
  people: "La lista queda fija. Nadie más tendrá acceso.",
};

const KICKER = "text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]";
const HINT = "text-[11px] leading-[1.45] text-[var(--gbp-text2)]";
const BLOCK = "rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3";

function normalize(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}


function fullName(user: ScopeSelectorUser) {
  return `${user.first_name} ${user.last_name}`.trim();
}

function initials(user: ScopeSelectorUser) {
  const parts = fullName(user).split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function metaLine(user: ScopeSelectorUser) {
  return (
    [user.location_label, user.department_label, user.position_label].filter(Boolean).join(" · ") ||
    "Sin datos de perfil"
  );
}

export function ScopeSelector({
  namespace,
  branches,
  departments,
  positions = [],
  users,
  locationInputName,
  departmentInputName,
  positionInputName,
  userInputName,
  modeInputName,
  initialLocations = [],
  initialDepartments = [],
  initialPositions = [],
  initialUsers = [],
  allowedLocationIds,
  lockLocationSelection = false,
  locationHelperText,
  question = "¿Quién lo tiene que ver?",
  audienceLabel = "Lo verán",
  onValidityChange,
}: ScopeSelectorProps) {
  const availableLocationIds = useMemo(() => {
    if (!allowedLocationIds || allowedLocationIds.length === 0) {
      return branches.map((branch) => branch.id);
    }
    const allowed = new Set(allowedLocationIds);
    return branches.map((branch) => branch.id).filter((id) => allowed.has(id));
  }, [allowedLocationIds, branches]);

  const availableBranches = useMemo(() => {
    const ids = new Set(availableLocationIds);
    return branches.filter((branch) => ids.has(branch.id));
  }, [availableLocationIds, branches]);

  /**
   * Un empleado con locaciones acotadas no puede difundir a toda la empresa. En
   * su caso el primer modo significa "todas mis locaciones" y emite esas
   * locaciones como filtro, en vez de emitir un alcance vacio (que el servidor
   * leeria como difusion total).
   */
  const restricted = lockLocationSelection && availableLocationIds.length > 0;

  const restriction = useMemo<ScopeRestriction>(
    () => ({ restricted, availableLocationIds }),
    [availableLocationIds, restricted],
  );

  const branchNameById = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const departmentNameById = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const positionNameById = useMemo(() => new Map(positions.map((p) => [p.id, p.name])), [positions]);

  const usersWithAccess = useMemo(() => users.filter((user) => Boolean(user.user_id)), [users]);

  const allowedUserIdSet = useMemo(
    () => new Set(usersWithAccess.map((user) => user.user_id).filter(Boolean) as string[]),
    [usersWithAccess],
  );

  const sanitizedInitialUsers = useMemo(
    () => normalize(initialUsers).filter((userId) => allowedUserIdSet.has(userId)),
    [allowedUserIdSet, initialUsers],
  );

  const initialLocationIds = useMemo(() => normalize(initialLocations), [initialLocations]);
  const initialDepartmentIds = useMemo(() => normalize(initialDepartments), [initialDepartments]);
  const initialPositionIds = useMemo(() => normalize(initialPositions), [initialPositions]);

  /**
   * El modo no se guarda: se deduce de lo que quedo guardado, con la misma
   * regla que aplica el servidor (hasScopeFilters / isUserOnlyScope). Asi,
   * abrir algo viejo a editar no lo reinterpreta.
   */
  const initialMode = useMemo<ScopeMode>(
    () =>
      deriveScopeMode(
        {
          locations: initialLocationIds,
          departments: initialDepartmentIds,
          positions: initialPositionIds,
          users: sanitizedInitialUsers,
        },
        restriction,
      ),
    [initialDepartmentIds, initialLocationIds, initialPositionIds, restriction, sanitizedInitialUsers],
  );

  const [mode, setMode] = useState<ScopeMode>(initialMode);
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(() => new Set(initialLocationIds));
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(() => new Set(initialDepartmentIds));
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(() => new Set(initialPositionIds));
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(() => new Set(sanitizedInitialUsers));
  const [query, setQuery] = useState("");

  const positionsByDepartment = useMemo(() => {
    const map = new Map<string, Array<{ id: string; department_id: string; name: string }>>();
    for (const position of positions) {
      const list = map.get(position.department_id) ?? [];
      list.push(position);
      map.set(position.department_id, list);
    }
    return map;
  }, [positions]);

  const hasFilters =
    selectedLocations.size > 0 || selectedDepartments.size > 0 || selectedPositions.size > 0;

  /**
   * Las locaciones que de verdad van a filtrar. Con locaciones acotadas y
   * ninguna marcada, valen todas las habilitadas: la vista previa y lo que se
   * envia tienen que decir lo mismo (ver `emitted`).
   */
  const effectiveLocations = useMemo(
    () => new Set(effectiveScopeLocations(Array.from(selectedLocations), restriction)),
    [restriction, selectedLocations],
  );

  const matchesFilters = useMemo(
    () =>
      makeScopeMatcher({
        locations: Array.from(effectiveLocations),
        departments: Array.from(selectedDepartments),
        positions: Array.from(selectedPositions),
        branchNameById,
        departmentNameById,
        positionNameById,
      }),
    [
      branchNameById,
      departmentNameById,
      effectiveLocations,
      positionNameById,
      selectedDepartments,
      selectedPositions,
    ],
  );

  const audience = useMemo(() => {
    if (mode === "all") {
      const reach = restricted
        ? usersWithAccess.filter((user) => scopeSubjectOverlapsLocations(user, availableLocationIds))
        : usersWithAccess;
      return { group: reach, hand: [] as ScopeSelectorUser[], broadcast: true };
    }

    if (mode === "people") {
      return {
        group: [] as ScopeSelectorUser[],
        hand: usersWithAccess.filter((user) => user.user_id && selectedUsers.has(user.user_id)),
        broadcast: false,
      };
    }

    if (!hasFilters) {
      return { group: [] as ScopeSelectorUser[], hand: [] as ScopeSelectorUser[], broadcast: false };
    }

    const group = usersWithAccess.filter(matchesFilters);
    const groupIds = new Set(group.map((user) => user.user_id));
    return {
      group,
      hand: usersWithAccess.filter(
        (user) => user.user_id && selectedUsers.has(user.user_id) && !groupIds.has(user.user_id),
      ),
      broadcast: false,
    };
  }, [availableLocationIds, hasFilters, matchesFilters, mode, restricted, selectedUsers, usersWithAccess]);

  const total = audience.group.length + audience.hand.length;

  const validation = useMemo(
    () =>
      validateScopeMode({
        mode,
        selection: {
          locations: Array.from(selectedLocations),
          departments: Array.from(selectedDepartments),
          positions: Array.from(selectedPositions),
          users: Array.from(selectedUsers),
        },
        restriction,
        audienceCount: total,
      }),
    [mode, restriction, selectedDepartments, selectedLocations, selectedPositions, selectedUsers, total],
  );

  const blocked = validation?.tone === "block";

  // Se avisa solo cuando la validez cambia de verdad. Si dependiera de la
  // identidad del callback, un arrow inline en el modal lo dispararia en cada
  // render.
  const notifyValidity = useRef(onValidityChange);
  notifyValidity.current = onValidityChange;
  const lastValidity = useRef<boolean | null>(null);

  useEffect(() => {
    if (lastValidity.current === !blocked) return;
    lastValidity.current = !blocked;
    notifyValidity.current?.(!blocked);
  }, [blocked]);

  /**
   * Lo que realmente se envia. Se deriva del modo, no del estado crudo: si
   * alguien arma un grupo y despues pasa a "toda la organizacion", los filtros
   * que quedaron marcados no viajan.
   */
  const emitted = useMemo(
    () =>
      emitScopeForMode(
        mode,
        {
          locations: Array.from(selectedLocations),
          departments: Array.from(selectedDepartments),
          positions: Array.from(selectedPositions),
          users: Array.from(selectedUsers),
        },
        restriction,
      ),
    [mode, restriction, selectedDepartments, selectedLocations, selectedPositions, selectedUsers],
  );

  const departmentsWithPositionsShown = useMemo(() => {
    // Se muestran los puestos de los departamentos marcados y tambien los de
    // aquellos que ya tenian un puesto guardado, para que un alcance viejo
    // hecho solo por puesto siga siendo editable.
    return departments.filter((department) => {
      if (selectedDepartments.has(department.id)) return true;
      return (positionsByDepartment.get(department.id) ?? []).some((position) =>
        selectedPositions.has(position.id),
      );
    });
  }, [departments, positionsByDepartment, selectedDepartments, selectedPositions]);

  const reachedByFilters = useMemo(
    () => new Set(mode === "group" && hasFilters ? audience.group.map((user) => user.user_id) : []),
    [audience.group, hasFilters, mode],
  );

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = restricted
      ? usersWithAccess.filter((user) => scopeSubjectOverlapsLocations(user, availableLocationIds))
      : usersWithAccess;

    return pool
      .filter((user) => !q || `${fullName(user)} ${metaLine(user)}`.toLowerCase().includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "es"));
  }, [availableLocationIds, query, restricted, usersWithAccess]);

  function toggleLocation(id: string, checked: boolean) {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleDepartment(id: string, checked: boolean) {
    setSelectedDepartments((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

    if (!checked) {
      // Un puesto sin su departamento marcado quedaria invisible en la pantalla
      // pero seguiria filtrando: se limpia junto con el departamento.
      const departmentPositions = positionsByDepartment.get(id) ?? [];
      if (departmentPositions.length === 0) return;
      setSelectedPositions((prev) => {
        const next = new Set(prev);
        for (const position of departmentPositions) next.delete(position.id);
        return next;
      });
    }
  }

  function togglePosition(id: string, checked: boolean) {
    setSelectedPositions((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleUser(id: string, checked: boolean) {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const modeOptions: Array<{ id: ScopeMode; title: string; sub: string }> = [
    {
      id: "all",
      title: restricted ? "Todas mis locaciones" : "Toda la organización",
      sub: restricted ? "Todos los de mis locaciones." : "Todos, hoy y los que entren.",
    },
    { id: "group", title: "Un grupo", sub: "Locación, depto o puesto." },
    { id: "people", title: "Personas específicas", sub: "Solo las que elijas." },
  ];

  const noStructure = departments.length === 0 && positions.length === 0;

  return (
    <>
      <section className="flex min-w-0 flex-col bg-[var(--gbp-bg)] px-5 py-4 xl:min-h-0 xl:overflow-y-auto">
        <p className="text-[13px] font-bold text-[var(--gbp-text)]">{question}</p>
        <p className={`mt-0.5 ${HINT}`}>{MODE_HINT[mode]}</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={question}>
          {modeOptions.map((option) => {
            const on = mode === option.id;
            return (
              <label
                key={`${namespace}-mode-${option.id}`}
                className={`cursor-pointer rounded-lg border-[1.5px] px-3 py-2 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--gbp-accent)] ${
                  on
                    ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]"
                    : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] hover:bg-[var(--gbp-bg)]"
                }`}
              >
                <input
                  type="radio"
                  name={`${namespace}-scope-mode`}
                  checked={on}
                  onChange={() => setMode(option.id)}
                  className="sr-only"
                />
                <span
                  className={`block text-[12.5px] font-bold ${
                    on ? "text-[var(--gbp-text)]" : "text-[var(--gbp-text2)]"
                  }`}
                >
                  {option.title}
                </span>
                <span className="mt-0.5 block text-[10.5px] leading-[1.35] text-[var(--gbp-muted)]">
                  {option.sub}
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {mode === "all" ? (
            <div className="rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-accent)_28%,transparent)] bg-[var(--gbp-accent-glow)] p-4">
              <p className="text-[12.5px] font-bold text-[var(--gbp-text)]">Sin restricciones</p>
              <p className={`mt-1 ${HINT}`}>
                {restricted
                  ? `Alcanza a las ${audience.group.length} personas de tus locaciones habilitadas, y a quien entre más adelante.`
                  : `Alcanza a las ${audience.group.length} personas de la organización, y a quien entre más adelante.`}
              </p>
              <p className={`mt-1 ${HINT}`}>
                Si querés acotarlo, elegí <strong>Un grupo</strong> o <strong>Personas específicas</strong>.
              </p>
            </div>
          ) : null}

          {mode === "group" ? (
            <>
              <div className={BLOCK}>
                <p className={KICKER}>Locación</p>
                {locationHelperText ? <p className={`mt-1 ${HINT}`}>{locationHelperText}</p> : null}
                <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                  {availableBranches.map((branch) => (
                    <label
                      key={`${namespace}-loc-${branch.id}`}
                      className="inline-flex items-center gap-2 text-xs text-[var(--gbp-text2)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLocations.has(branch.id)}
                        onChange={(event) => toggleLocation(branch.id, event.target.checked)}
                        className="h-[13px] w-[13px] accent-[var(--gbp-accent)]"
                      />
                      {branch.name}
                    </label>
                  ))}
                  {availableBranches.length === 0 ? (
                    <p className={HINT}>No hay locaciones disponibles.</p>
                  ) : null}
                </div>
              </div>

              {noStructure ? (
                <div className="rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-violet)_28%,transparent)] bg-[var(--gbp-violet-soft)] p-3">
                  <p className="text-[12px] font-bold text-[var(--gbp-text)]">
                    Todavía no cargaste departamentos ni puestos
                  </p>
                  <p className={`mt-1 ${HINT}`}>
                    Por ahora podés filtrar por locación. Para filtrar por área o por puesto, cargalos en
                    Configuración › Estructura Organizacional.
                  </p>
                </div>
              ) : (
                <>
                  <div className={BLOCK}>
                    <p className={KICKER}>Departamento</p>
                    <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                      {departments.map((department) => (
                        <label
                          key={`${namespace}-dept-${department.id}`}
                          className="inline-flex items-center gap-2 text-xs text-[var(--gbp-text2)]"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDepartments.has(department.id)}
                            onChange={(event) => toggleDepartment(department.id, event.target.checked)}
                            className="h-[13px] w-[13px] accent-[var(--gbp-accent)]"
                          />
                          {department.name}
                        </label>
                      ))}
                      {departments.length === 0 ? (
                        <p className={HINT}>No hay departamentos cargados.</p>
                      ) : null}
                    </div>
                  </div>

                  <div className={BLOCK}>
                    <p className={KICKER}>Puesto</p>
                    {departmentsWithPositionsShown.length === 0 ? (
                      <p className={`mt-1 ${HINT}`}>Marcá un departamento para poder filtrar por puesto.</p>
                    ) : (
                      <>
                        <p className={`mt-1 ${HINT}`}>
                          Si no marcás ninguno, entran todos los del departamento.
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                          {departmentsWithPositionsShown.map((department) => {
                            const departmentPositions = positionsByDepartment.get(department.id) ?? [];
                            return (
                              <div
                                key={`${namespace}-posgroup-${department.id}`}
                                className="rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2.5 py-2"
                              >
                                <p className={KICKER}>{department.name}</p>
                                {departmentPositions.length === 0 ? (
                                  <p className={`mt-1 ${HINT}`}>Sin puestos cargados.</p>
                                ) : (
                                  <div className="mt-1.5 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                                    {departmentPositions.map((position) => (
                                      <label
                                        key={`${namespace}-pos-${position.id}`}
                                        className="inline-flex items-center gap-2 text-xs text-[var(--gbp-text2)]"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selectedPositions.has(position.id)}
                                          onChange={(event) =>
                                            togglePosition(position.id, event.target.checked)
                                          }
                                          className="h-[13px] w-[13px] accent-[var(--gbp-accent)]"
                                        />
                                        {position.name}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-start gap-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-3 py-2">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gbp-accent)]" />
                    <p className={HINT}>
                      Una persona entra si cumple <strong>todo</strong> lo marcado. Agregar un departamento
                      no suma gente: la acota dentro de las locaciones elegidas.
                    </p>
                  </div>
                </>
              )}

              <div className={BLOCK}>
                <p className={KICKER}>¿Alguien más, fuera del grupo?</p>
                {peopleSearch()}
                {peopleGrid(true)}
              </div>
            </>
          ) : null}

          {mode === "people" ? (
            <div className={BLOCK}>
              <p className={KICKER}>Elegí las personas</p>
              {peopleSearch()}
              {peopleGrid(false)}
            </div>
          ) : null}
        </div>
      </section>

      <aside
        className="flex min-w-0 flex-col gap-2 border-t border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-4 py-4 xl:min-h-0 xl:overflow-hidden xl:border-t-0 xl:border-l"
        aria-label={audienceLabel}
      >
        <p className={KICKER}>{audienceLabel}</p>
        <div
          className={`rounded-md border px-3 py-2 ${
            blocked
              ? "border-[var(--gbp-border2)] bg-[var(--gbp-bg)]"
              : "border-[color:color-mix(in_oklab,var(--gbp-accent)_28%,transparent)] bg-[var(--gbp-accent-glow)]"
          }`}
        >
          <p
            className={`text-xl font-bold tabular-nums ${
              blocked ? "text-[var(--gbp-muted)]" : "text-[var(--gbp-text)]"
            }`}
          >
            {blocked ? "—" : total}
          </p>
          <p className="text-[10.5px] leading-[1.3] text-[var(--gbp-text2)]">
            {blocked
              ? "Falta definir el alcance"
              : audience.broadcast
                ? restricted
                  ? "personas · todas mis locaciones"
                  : "personas · toda la organización"
                : total === 1
                  ? "persona"
                  : "personas"}
          </p>
        </div>

        {blocked || total === 0 ? (
          <p className={HINT}>
            {blocked
              ? "Definí el alcance para ver quiénes quedan incluidos."
              : "Ninguna persona cumple con lo marcado."}
          </p>
        ) : (
          <>
            <div className="max-h-56 overflow-y-auto rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-1.5 xl:max-h-none xl:min-h-0 xl:flex-1">
              <div className="flex flex-col gap-1">
                {audience.group.map((user) => rosterRow(user, "group"))}
                {audience.hand.map((user) => rosterRow(user, "hand"))}
              </div>
            </div>
            {audience.group.length > 0 && audience.hand.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--gbp-text2)]">
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-1.5 w-1.5 rounded-full bg-[var(--gbp-accent)]" /> por el grupo
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="h-1.5 w-1.5 rounded-full bg-[var(--gbp-violet)]" /> elegidas a mano
                </span>
              </div>
            ) : null}
          </>
        )}

        {validation ? (
          <p
            className={`rounded-md px-2 py-1.5 text-[11px] leading-[1.4] ${
              validation.tone === "block"
                ? "bg-[var(--gbp-error-soft)] text-[color:var(--gbp-error)]"
                : "bg-[var(--gbp-violet-soft)] text-[var(--gbp-text2)]"
            }`}
            role={validation.tone === "block" ? "alert" : "status"}
          >
            {validation.text}
          </p>
        ) : null}
      </aside>

      {modeInputName ? <input type="hidden" name={modeInputName} value={mode} /> : null}
      {emitted.locations.map((value) => (
        <input key={`${namespace}-loc-input-${value}`} type="hidden" name={locationInputName} value={value} />
      ))}
      {emitted.departments.map((value) => (
        <input key={`${namespace}-dept-input-${value}`} type="hidden" name={departmentInputName} value={value} />
      ))}
      {positionInputName
        ? emitted.positions.map((value) => (
            <input key={`${namespace}-pos-input-${value}`} type="hidden" name={positionInputName} value={value} />
          ))
        : null}
      {emitted.users.map((value) => (
        <input key={`${namespace}-usr-input-${value}`} type="hidden" name={userInputName} value={value} />
      ))}
    </>
  );

  function peopleSearch() {
    return (
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mt-2 w-full rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]"
        placeholder="Buscar por nombre, locación, departamento o puesto…"
      />
    );
  }

  function peopleGrid(showReached: boolean) {
    if (candidates.length === 0) {
      return <p className={`mt-2 ${HINT}`}>No hay coincidencias.</p>;
    }

    return (
      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-1.5 xl:max-h-80">
        <div className="grid gap-1 sm:grid-cols-2">
          {candidates.map((user) => {
            if (!user.user_id) return null;
            const reached = showReached && reachedByFilters.has(user.user_id);
            const on = reached || selectedUsers.has(user.user_id);
            return (
              <label
                key={`${namespace}-usr-${user.id}`}
                title={reached ? "Ya entra por el grupo" : undefined}
                className={`grid grid-cols-[13px_22px_minmax(0,1fr)] items-center gap-2 rounded-md border px-1.5 py-1.5 ${
                  reached
                    ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_25%,transparent)] bg-[var(--gbp-accent-glow)]"
                    : on
                      ? "border-[color:color-mix(in_oklab,var(--gbp-violet)_28%,transparent)] bg-[var(--gbp-violet-soft)]"
                      : "border-transparent hover:border-[var(--gbp-border)] hover:bg-[var(--gbp-bg)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={reached}
                  onChange={(event) => toggleUser(user.user_id!, event.target.checked)}
                  className="h-[13px] w-[13px] accent-[var(--gbp-violet)] disabled:accent-[var(--gbp-accent)]"
                />
                <span
                  className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[var(--gbp-surface2)] text-[9px] font-bold text-[var(--gbp-text2)]"
                  aria-hidden="true"
                >
                  {initials(user)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-[var(--gbp-text)]">
                    {fullName(user)}
                  </span>
                  <span className="block truncate text-[10px] text-[var(--gbp-text2)]">{metaLine(user)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  function rosterRow(user: ScopeSelectorUser, by: "group" | "hand") {
    return (
      <div
        key={`${namespace}-roster-${user.id}`}
        className="grid grid-cols-[4px_20px_minmax(0,1fr)] items-center gap-2"
      >
        <span
          className={`h-4 w-[3px] rounded-full ${
            by === "group" ? "bg-[var(--gbp-accent)]" : "bg-[var(--gbp-violet)]"
          }`}
          aria-hidden="true"
        />
        <span
          className="grid h-5 w-5 place-items-center rounded-full bg-[var(--gbp-surface2)] text-[8.5px] font-bold text-[var(--gbp-text2)]"
          aria-hidden="true"
        >
          {initials(user)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-semibold text-[var(--gbp-text)]">
            {fullName(user)}
          </span>
          <span className="block truncate text-[9.5px] text-[var(--gbp-text2)]">{metaLine(user)}</span>
        </span>
      </div>
    );
  }
}


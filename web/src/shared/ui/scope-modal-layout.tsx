import type { ReactNode } from "react";

/**
 * Las tres zonas de un modal con alcance: contenido | alcance | audiencia.
 *
 * En pantallas anchas son tres columnas con scroll propio, para no tener que
 * bajar y subir entre "que estoy escribiendo" y "a quien le llega". Abajo de xl
 * se apilan y scrollea el bloque entero.
 *
 * `ScopeSelector` emite las dos ultimas zonas, asi que el modal solo aporta la
 * columna de contenido: <ScopeModalZones><ScopeModalContent>...</ScopeModalContent><ScopeSelector /></ScopeModalZones>
 */

export const SCOPE_MODAL_PANEL =
  "grid max-h-[92vh] w-[1300px] min-w-0 max-w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-xl)] xl:h-[min(800px,92vh)]";

export const SCOPE_MODAL_HEADER =
  "flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-4";

export const SCOPE_MODAL_FOOTER =
  "flex flex-wrap items-center justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4";

/** El form ocupa la fila del medio y deja su propio pie abajo. */
export const SCOPE_MODAL_FORM = "grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto]";

export function ScopeModalZones({
  children,
  /**
   * Cuando el alcance no se puede editar (un documento que hereda los permisos
   * de su carpeta, o un empleado sin ese permiso) no hay columnas que mostrar:
   * el modal vuelve a ser uno solo.
   */
  withScope = true,
}: {
  children: ReactNode;
  withScope?: boolean;
}) {
  return (
    <div
      className={
        withScope
          ? "grid min-h-0 min-w-0 overflow-x-hidden overflow-y-auto xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,280px)] xl:overflow-hidden"
          : "grid min-h-0 min-w-0 overflow-x-hidden overflow-y-auto"
      }
    >
      {children}
    </div>
  );
}

export function ScopeModalContent({
  children,
  withScope = true,
}: {
  children: ReactNode;
  withScope?: boolean;
}) {
  return (
    <section
      className={
        withScope
          ? "flex min-w-0 flex-col gap-3 border-b border-[var(--gbp-border)] px-5 py-4 xl:min-h-0 xl:overflow-y-auto xl:border-b-0 xl:border-r"
          : "flex min-w-0 flex-col gap-3 px-6 py-5"
      }
    >
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Piezas de campo, calcadas de la maqueta
// ---------------------------------------------------------------------------

export const SCOPE_MODAL_KICKER =
  "flex items-center gap-2.5 text-[10.5px] font-bold uppercase tracking-[0.11em] text-[var(--gbp-muted)] after:h-px after:flex-1 after:bg-[var(--gbp-border)] after:content-['']";

export const SCOPE_MODAL_LABEL =
  "text-[10.5px] font-bold uppercase tracking-[0.11em] text-[var(--gbp-muted)]";

const CONTROL =
  "w-full rounded-[9px] border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-[11px] py-[9px] text-[13.5px] text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--gbp-accent)]";

export const SCOPE_MODAL_INPUT = CONTROL;
export const SCOPE_MODAL_SELECT = CONTROL;

/**
 * min-h y shrink-0 no son decorativos: la columna de contenido es un flex
 * column, y sin ellos el textarea se aplasta hasta quedar de una linea.
 */
export const SCOPE_MODAL_TEXTAREA = `${CONTROL} min-h-[92px] shrink-0 resize-y leading-[1.5]`;

export function ScopeModalSection({ label }: { label: string }) {
  return <p className={SCOPE_MODAL_KICKER}>{label}</p>;
}

export function ScopeModalDivider() {
  return <div className="my-0.5 h-px shrink-0 bg-[var(--gbp-border)]" />;
}

export function ScopeModalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex shrink-0 flex-col gap-[5px]">
      <span className={SCOPE_MODAL_LABEL}>{label}</span>
      {children}
    </label>
  );
}

/** Fila con titulo, aclaracion opcional y un interruptor a la derecha. */
export function ScopeModalToggleRow({
  label,
  sub,
  name,
  value,
  checked,
  defaultChecked,
  onChange,
}: {
  label: string;
  sub?: string;
  name?: string;
  value?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center justify-between gap-3 rounded-[9px] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-[11px] py-[9px] text-[13px] text-[var(--gbp-text)]">
      <span>
        {label}
        {sub ? <small className="block text-[11px] font-medium text-[var(--gbp-muted)]">{sub}</small> : null}
      </span>
      <span className="relative h-[22px] w-[38px] shrink-0">
        <input
          type="checkbox"
          name={name}
          value={value}
          checked={checked}
          defaultChecked={defaultChecked}
          onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
          className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
        />
        <span className="absolute inset-0 rounded-[22px] bg-[var(--gbp-border2)] transition-colors peer-checked:bg-[var(--gbp-accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--gbp-accent)]" />
        <span className="pointer-events-none absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

/** Aclaracion con vinieta, para explicar una consecuencia del alcance. */
export function ScopeModalNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-start gap-2 rounded-[9px] border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-[11px] py-[9px]">
      <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gbp-accent)]" aria-hidden="true" />
      <p className="text-[11.5px] leading-[1.45] text-[var(--gbp-text2)]">{children}</p>
    </div>
  );
}

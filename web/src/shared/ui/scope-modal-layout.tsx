"use client";

import {
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
} from "react";

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

const SCOPE_MODAL_HEADER =
  "flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-4";

export const SCOPE_MODAL_FOOTER =
  "flex flex-wrap items-center justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4";

/** El form ocupa la fila del medio y deja su propio pie abajo. */
export const SCOPE_MODAL_FORM = "grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto]";

const ScopeModalTitleIdContext = createContext<string | null>(null);
const ScopeModalCanCloseContext = createContext(true);

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getFocusTrapTargetIndex(currentIndex: number, count: number, backwards: boolean) {
  if (count <= 0) return -1;
  if (currentIndex < 0) return backwards ? count - 1 : 0;
  return backwards
    ? (currentIndex - 1 + count) % count
    : (currentIndex + 1) % count;
}

function getFocusableElements(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true",
  );
}

export function ScopeModalDialog({
  children,
  onClose,
  overlayClassName,
  panelClassName,
  closeOnBackdrop = false,
  canClose = true,
}: {
  children: ReactNode;
  onClose: () => void;
  overlayClassName: string;
  panelClassName: string;
  closeOnBackdrop?: boolean;
  canClose?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const panel = panelRef.current;
    const requestedInitialFocus = panel?.querySelector<HTMLElement>("[data-modal-initial-focus]");
    (requestedInitialFocus ?? panel)?.focus();

    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!canClose) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = getFocusableElements(panel);
    event.preventDefault();
    if (focusable.length === 0) {
      panel.focus();
      return;
    }
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    focusable[getFocusTrapTargetIndex(currentIndex, focusable.length, event.shiftKey)]?.focus();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && canClose && event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={overlayClassName} onClick={handleBackdropClick}>
      <ScopeModalCanCloseContext.Provider value={canClose}>
        <ScopeModalTitleIdContext.Provider value={titleId}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className={`${panelClassName} outline-none`}
          >
            {children}
          </div>
        </ScopeModalTitleIdContext.Provider>
      </ScopeModalCanCloseContext.Provider>
    </div>
  );
}

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

const SCOPE_MODAL_KICKER =
  "flex items-center gap-2.5 text-[10.5px] font-bold uppercase tracking-[0.11em] text-[var(--gbp-muted)] after:h-px after:flex-1 after:bg-[var(--gbp-border)] after:content-['']";

const SCOPE_MODAL_LABEL =
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

/**
 * Encabezado unico de los modales con alcance.
 *
 * Estaba escrito a mano en cada archivo y ya habia divergido: titulos con
 * mayusculas distintas ("Editar Documento" / "Subir archivo") y tres modales sin
 * subtitulo.
 */
export function ScopeModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const contextTitleId = useContext(ScopeModalTitleIdContext);
  const canClose = useContext(ScopeModalCanCloseContext);
  const fallbackTitleId = useId();
  const titleId = contextTitleId ?? fallbackTitleId;

  return (
    <div className={SCOPE_MODAL_HEADER}>
      <div className="min-w-0">
        <h2 id={titleId} className="font-serif text-sm font-bold text-[var(--gbp-text)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[11.5px] text-[var(--gbp-text2)]">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={canClose ? onClose : undefined}
        disabled={!canClose}
        aria-label="Cerrar"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        ✕
      </button>
    </div>
  );
}

export const SCOPE_MODAL_CANCEL =
  "rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]";

/**
 * Panel para modales chicos, sin columnas de alcance. Comparte borde, radio y
 * sombra con el panel grande; solo cambia el ancho, que lo pone quien lo usa.
 */
export const SCOPE_MODAL_PANEL_COMPACT =
  "overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-xl)]";

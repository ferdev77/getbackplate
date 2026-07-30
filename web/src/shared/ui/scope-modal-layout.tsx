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
  "grid max-h-[92vh] w-[1300px] max-w-[97vw] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-xl)] xl:h-[min(800px,92vh)]";

export const SCOPE_MODAL_HEADER =
  "flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-4";

export const SCOPE_MODAL_FOOTER =
  "flex flex-wrap items-center justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4";

/** El form ocupa la fila del medio y deja su propio pie abajo. */
export const SCOPE_MODAL_FORM = "grid min-h-0 grid-rows-[minmax(0,1fr)_auto]";

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
          ? "grid min-h-0 overflow-y-auto xl:grid-cols-[352px_minmax(0,1fr)_286px] xl:overflow-hidden"
          : "grid min-h-0 overflow-y-auto"
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
          ? "flex flex-col gap-3 border-b border-[var(--gbp-border)] px-5 py-4 xl:min-h-0 xl:overflow-y-auto xl:border-b-0 xl:border-r"
          : "flex flex-col gap-3 px-6 py-5"
      }
    >
      {children}
    </section>
  );
}

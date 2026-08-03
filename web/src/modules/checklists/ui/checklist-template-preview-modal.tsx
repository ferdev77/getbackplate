"use client";

import { etiquetaDeFrecuencia } from "@/modules/checklists/lib/recurrence";
import type { RepartoDelHistorial } from "@/modules/checklists/services/checklist-delivery-history.service";

type PreviewSection = {
  id: string;
  name: string;
  items: Array<{ id: string; label: string; priority: string }>;
};

type Props = {
  templateName: string;
  sections: PreviewSection[];
  checklistType?: string | null;
  shift?: string | null;
  /** El reparto real. Sin reparto no se repite, diga lo que diga repeat_every. */
  scheduledJob?: { recurrence_type?: string | null } | null;
  isActive?: boolean;
  createdByName?: string;
  scopeLabels?: {
    locations: string[];
    departments: string[];
    positions: string[];
    users: string[];
  };
  /**
   * Historial de repartos. Solo lo recibe quien puede verlo -- admin de empresa
   * o quien creo el checklist (ver checklist-delivery-history.service.ts). Si
   * viene undefined la columna no se dibuja: es la diferencia entre "no tenes
   * permiso" y "todavia no se repartio", que se muestra como lista vacia.
   */
  deliveryHistory?: RepartoDelHistorial[];
  onClose: () => void;
};

function typeLabel(value: string | null | undefined) {
  if (value === "opening") return "Apertura";
  if (value === "closing") return "Cierre";
  if (value === "prep") return "Prep";
  return "Custom";
}

const ETIQUETA_DE_ORIGEN: Record<RepartoDelHistorial["origen"], string> = {
  alta: "Alta",
  edicion: "Edición",
  recurrencia: "Reparto",
  desconocido: "Envío",
};

function fechaLegible(iso: string) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return `${fecha.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} · ${fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Los primeros nombres y cuantos quedaron afuera, para no romper el ancho. */
function resumirDestinatarios(destinatarios: string[], maximo = 4) {
  if (destinatarios.length === 0) return "Sin destinatarios con nombre cargado";
  const visibles = destinatarios.slice(0, maximo);
  const resto = destinatarios.length - visibles.length;
  return resto > 0 ? `${visibles.join(", ")} +${resto}` : visibles.join(", ");
}

function HistorialDeRepartos({ repartos }: { repartos: RepartoDelHistorial[] }) {
  return (
    <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">
        Historial de repartos
      </p>

      {repartos.length === 0 ? (
        <p className="text-xs text-[var(--gbp-muted)]">
          Todavía no hay repartos registrados.
        </p>
      ) : (
        <ul className="space-y-2">
          {repartos.map((reparto) => (
            <li
              key={`${reparto.fecha}-${reparto.origen}`}
              className="rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--gbp-text)]">
                  {fechaLegible(reparto.fecha)}
                </span>
                <span className="shrink-0 rounded-full border border-[var(--gbp-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--gbp-text2)]">
                  {ETIQUETA_DE_ORIGEN[reparto.origen]}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-[var(--gbp-text2)]">
                {reparto.cantidad} {reparto.cantidad === 1 ? "persona" : "personas"}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-[var(--gbp-muted)]">
                {resumirDestinatarios(reparto.destinatarios)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChecklistTemplatePreviewModal({
  templateName,
  sections,
  checklistType,
  shift,
  scheduledJob,
  isActive,
  createdByName,
  scopeLabels,
  deliveryHistory,
  onClose,
}: Props) {
  const locations = scopeLabels?.locations ?? [];
  const departments = scopeLabels?.departments ?? [];
  const positions = scopeLabels?.positions ?? [];
  const users = scopeLabels?.users ?? [];
  const hasScopedRules = locations.length > 0 || departments.length > 0 || positions.length > 0 || users.length > 0;
  // undefined = sin permiso, la columna no se dibuja. Array vacio = tiene
  // permiso pero todavia no se repartio, y eso si se muestra.
  const muestraHistorial = Array.isArray(deliveryHistory);

  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/45 p-5">
      <div
        className={`flex max-h-[88vh] ${muestraHistorial ? "w-[1040px]" : "w-[720px]"} max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]`}
      >
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
          <p className="font-serif text-sm font-bold text-[var(--gbp-text)]">Vista previa · {templateName}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
          >
            ✕
          </button>
        </div>

        <div
          className={`max-h-[68vh] overflow-y-auto px-6 py-5 ${
            muestraHistorial
              ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-start"
              : ""
          }`}
        >
          {/* Columna izquierda: lo de siempre. */}
          <div className="space-y-3">
          <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Metadata</p>
            <div className="grid gap-2 text-xs text-[var(--gbp-text2)] sm:grid-cols-2">
              <p><span className="font-semibold text-[var(--gbp-text)]">Tipo:</span> {typeLabel(checklistType)}</p>
              <p><span className="font-semibold text-[var(--gbp-text)]">Shift:</span> {shift || "-"}</p>
              <p><span className="font-semibold text-[var(--gbp-text)]">Frecuencia:</span> {etiquetaDeFrecuencia(scheduledJob)}</p>
              <p><span className="font-semibold text-[var(--gbp-text)]">Estado:</span> {isActive ? "Activo" : "Inactivo"}</p>
              <p className="sm:col-span-2"><span className="font-semibold text-[var(--gbp-text)]">Creado por:</span> {createdByName ?? "Dirección"}</p>
            </div>

            <div className="mt-3 border-t border-[var(--gbp-border)] pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Alcance</p>
              <div className="space-y-2 text-xs text-[var(--gbp-text2)]">
                <div>
                  <p className="mb-1 font-semibold text-[var(--gbp-text)]">Locaciones</p>
                  <div className="flex flex-wrap gap-1">
                    {locations.length
                      ? locations.map((name) => (
                          <span key={`loc-${name}`} className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[10px] font-medium text-[var(--gbp-accent)]">{name}</span>
                        ))
                      : <span>{hasScopedRules ? "No restringe por locación" : "Todas"}</span>}
                  </div>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-[var(--gbp-text)]">Departamentos</p>
                  <div className="flex flex-wrap gap-1">
                    {departments.length
                      ? departments.map((name) => (
                          <span key={`dep-${name}`} className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600">{name}</span>
                        ))
                      : <span>{hasScopedRules ? "No restringe por departamento" : "Todos"}</span>}
                  </div>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-[var(--gbp-text)]">Puestos</p>
                  <div className="flex flex-wrap gap-1">
                    {positions.length
                      ? positions.map((name) => (
                          <span key={`pos-${name}`} className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--gbp-success)]">{name}</span>
                        ))
                      : <span>{hasScopedRules ? "No restringe por puesto" : "Todos"}</span>}
                  </div>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-[var(--gbp-text)]">Usuarios</p>
                  <div className="flex flex-wrap gap-1">
                    {users.length
                      ? users.map((name) => (
                          <span key={`usr-${name}`} className="inline-flex items-center rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] text-[var(--gbp-text2)]">{name}</span>
                        ))
                      : <span>{hasScopedRules ? "Sin usuarios especificos" : "Todos"}</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.id} className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
              <h3 className="text-sm font-semibold text-[var(--gbp-text)]">{section.name}</h3>
              {section.items.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {section.items.map((item) => (
                    <li key={item.id} className="rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs text-[var(--gbp-text2)]">
                      {item.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-[var(--gbp-muted)]">Sin items cargados.</p>
              )}
            </div>
          ))}
          </div>

          {/* Columna derecha: quien recibio cada reparto. */}
          {muestraHistorial ? (
            <div className="lg:sticky lg:top-0">
              <HistorialDeRepartos repartos={deliveryHistory ?? []} />
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

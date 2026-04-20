"use client";

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
  repeatEvery?: string | null;
  isActive?: boolean;
  scopeLabels?: {
    locations: string[];
    departments: string[];
    positions: string[];
    users: string[];
  };
  onClose: () => void;
};

function typeLabel(value: string | null | undefined) {
  if (value === "opening") return "Apertura";
  if (value === "closing") return "Cierre";
  if (value === "prep") return "Prep";
  return "Custom";
}

function priorityLabel(priority: string) {
  if (priority === "high") return "CRITICO";
  if (priority === "low") return "RUTINA";
  return "IMPORTANTE";
}

function priorityClass(priority: string) {
  if (priority === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "low") return "border-neutral-200 bg-neutral-100 text-neutral-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function ChecklistTemplatePreviewModal({
  templateName,
  sections,
  checklistType,
  shift,
  repeatEvery,
  isActive,
  scopeLabels,
  onClose,
}: Props) {
  const locations = scopeLabels?.locations ?? [];
  const departments = scopeLabels?.departments ?? [];
  const positions = scopeLabels?.positions ?? [];
  const users = scopeLabels?.users ?? [];
  const hasScopedRules = locations.length > 0 || departments.length > 0 || positions.length > 0 || users.length > 0;

  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/45 p-5">
      <div className="flex max-h-[88vh] w-[720px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[var(--gbp-text)]">Vista previa · {templateName}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[68vh] space-y-3 overflow-y-auto px-6 py-5">
          <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Metadata</p>
            <div className="grid gap-2 text-xs text-[var(--gbp-text2)] sm:grid-cols-2">
              <p><span className="font-semibold text-[var(--gbp-text)]">Tipo:</span> {typeLabel(checklistType)}</p>
              <p><span className="font-semibold text-[var(--gbp-text)]">Shift:</span> {shift || "-"}</p>
              <p><span className="font-semibold text-[var(--gbp-text)]">Frecuencia:</span> {repeatEvery || "-"}</p>
              <p><span className="font-semibold text-[var(--gbp-text)]">Estado:</span> {isActive ? "Activo" : "Inactivo"}</p>
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
                      : <span>{hasScopedRules ? "No restringe por locacion" : "Todas"}</span>}
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
                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs text-[var(--gbp-text2)]">
                      <span>{item.label}</span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityClass(item.priority)}`}>
                        {priorityLabel(item.priority)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-[var(--gbp-muted)]">Sin items cargados.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

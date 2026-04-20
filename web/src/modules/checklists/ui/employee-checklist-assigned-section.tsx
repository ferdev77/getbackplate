"use client";

import { ClipboardCheck, Eye, PlayCircle } from "lucide-react";

import { TooltipLabel } from "@/shared/ui/tooltip";

type TemplateRow = {
  id: string;
  name: string;
  sent: boolean;
  submissionStatus: string | null;
  submittedAt: string | null;
};

function formatSubmittedAt(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reportStatusBadge(status: string | null | undefined) {
  if (status === "reviewed") {
    return {
      label: "Reporte revisado",
      className: "border-amber-300/40 bg-amber-50 text-amber-700",
      dotClassName: "bg-amber-500",
      dateClassName: "text-[var(--gbp-text2)]",
    };
  }
  return {
    label: "Reporte enviado",
    className: "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]",
    dotClassName: "bg-[var(--gbp-success)]",
    dateClassName: "text-[var(--gbp-text2)]",
  };
}

export function EmployeeChecklistAssignedSection({
  templateRows,
  loadingTemplateId,
  onOpenTemplatePreview,
  onOpenPreview,
}: {
  templateRows: TemplateRow[];
  loadingTemplateId: string;
  onOpenTemplatePreview: (templateId: string) => void;
  onOpenPreview: (templateId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
      <div className="grid grid-cols-[1fr_170px_110px] gap-x-3 border-b-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-2.5 text-[11px] font-bold tracking-[0.07em] uppercase text-[var(--gbp-muted)]">
        <p>Checklist</p>
        <p>Estado reporte</p>
        <p>Acciones</p>
      </div>

      {templateRows.length > 0 ? (
        <div>
          {templateRows.map((template) => (
            <div key={template.id} className="grid grid-cols-[1fr_170px_110px] items-center gap-x-3 border-b border-[var(--gbp-border)] px-4 py-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-[var(--gbp-text)]">
                  <ClipboardCheck className="h-4 w-4 shrink-0 text-[var(--gbp-accent)]" />
                  <p className="truncate text-sm font-semibold">{template.name}</p>
                </div>
                {template.submittedAt ? (
                  <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">Ultimo envio: {formatSubmittedAt(template.submittedAt)}</p>
                ) : null}
              </div>

              <div>
                {template.sent ? (
                  (() => {
                    const statusBadge = reportStatusBadge(template.submissionStatus);
                    return (
                      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${statusBadge.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClassName}`} />
                        <span>{statusBadge.label}</span>
                      </div>
                    );
                  })()
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] px-3 py-1.5 text-[11px] font-semibold text-[var(--gbp-accent)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--gbp-accent)]" />
                    <span>Pendiente</span>
                  </div>
                )}
              </div>

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onOpenTemplatePreview(template.id)}
                  disabled={loadingTemplateId === template.id}
                  className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)] disabled:opacity-70"
                >
                  <Eye className="h-4 w-4" />
                  <TooltipLabel label={loadingTemplateId === template.id ? "Cargando..." : "Vista previa"} />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPreview(template.id)}
                  disabled={loadingTemplateId === template.id}
                  className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--gbp-success)_18%,transparent)] disabled:opacity-70"
                >
                  <PlayCircle className="h-4 w-4" />
                  <TooltipLabel label={loadingTemplateId === template.id ? "Cargando..." : "Completar"} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">
          No tienes checklists asignados para tu perfil.
        </div>
      )}
    </section>
  );
}

"use client";

import { ClipboardCheck, Eye } from "lucide-react";

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
  onOpenPreview,
}: {
  templateRows: TemplateRow[];
  loadingTemplateId: string;
  onOpenPreview: (templateId: string) => void;
}) {
  return (
    <section className="space-y-3">
      {templateRows.map((template) => (
        <article key={template.id} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[var(--gbp-border2)] hover:shadow-[0_8px_24px_rgba(0,0,0,.05)]">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 text-[var(--gbp-text)]">
              <ClipboardCheck className="h-4 w-4 shrink-0 text-[var(--gbp-accent)]" />
              <p className="truncate text-base font-semibold">{template.name}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {template.sent ? (
                (() => {
                  const statusBadge = reportStatusBadge(template.submissionStatus);
                  return (
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${statusBadge.className}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClassName}`} />
                      <span>{statusBadge.label}</span>
                      <span suppressHydrationWarning className={`hidden sm:inline ${statusBadge.dateClassName}`}>· {formatSubmittedAt(template.submittedAt)}</span>
                    </div>
                  );
                })()
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] px-3 py-1.5 text-[11px] font-semibold text-[var(--gbp-accent)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--gbp-accent)]" />
                  <span>Reporte pendiente</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onOpenPreview(template.id)}
                disabled={loadingTemplateId === template.id}
                className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--gbp-success)_18%,transparent)] disabled:opacity-70"
              >
                <Eye className="h-4 w-4" />
                <TooltipLabel label={loadingTemplateId === template.id ? "Cargando..." : "Ver checklist"} />
              </button>
            </div>
          </div>
        </article>
      ))}

      {!templateRows.length ? (
        <div className="rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">
          No tienes checklists asignados para tu perfil.
        </div>
      ) : null}
    </section>
  );
}

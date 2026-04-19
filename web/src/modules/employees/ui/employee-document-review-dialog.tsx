"use client";

export type ReviewDecision = "approved" | "rejected";

type ReviewDialogState = {
  open: boolean;
  slot: string | null;
  decision: ReviewDecision;
  comment: string;
};

type Props = {
  reviewDialog: ReviewDialogState;
  isSubmitting: boolean;
  approvalTemplates: string[];
  rejectionTemplates: string[];
  onClose: () => void;
  onSubmit: () => void;
  onCommentChange: (next: string) => void;
  onApplyTemplate: (template: string) => void;
};

export function EmployeeDocumentReviewDialog({
  reviewDialog,
  isSubmitting,
  approvalTemplates,
  rejectionTemplates,
  onClose,
  onSubmit,
  onCommentChange,
  onApplyTemplate,
}: Props) {
  if (!reviewDialog.open) return null;

  const templates = reviewDialog.decision === "approved" ? approvalTemplates : rejectionTemplates;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar revisión"
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-[560px] rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--gbp-muted)]">Revisión de documento</p>
            <h4 className="mt-1 text-[17px] font-bold text-[var(--gbp-text)]">
              {reviewDialog.decision === "approved" ? "Aprobar documento" : "Rechazar documento"}
            </h4>
            <p className="mt-1 text-[12px] text-[var(--gbp-text2)]">
              {reviewDialog.decision === "approved"
                ? "Deja un comentario de validación para trazabilidad del equipo."
                : "Explica claramente el motivo para que el empleado pueda corregirlo rápido."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-text)] disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template}
              type="button"
              onClick={() => onApplyTemplate(template)}
              disabled={isSubmitting}
              className="rounded-full border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-2.5 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] transition-colors hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-60"
            >
              {template}
            </button>
          ))}
        </div>

        <label className="text-[11px] font-bold text-[var(--gbp-text2)]">
          Comentario {reviewDialog.decision === "rejected" ? "(obligatorio)" : "(opcional)"}
          <textarea
            value={reviewDialog.comment}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder={reviewDialog.decision === "approved" ? "Ej. Documento validado y aprobado." : "Ej. La foto está borrosa y no se leen los datos."}
            rows={4}
            disabled={isSubmitting}
            className="mt-1.5 w-full resize-none rounded-xl border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)] disabled:opacity-60"
          />
        </label>

        <div className="mt-2 flex items-center justify-between">
          <p className="text-[10px] text-[var(--gbp-muted)]">{reviewDialog.comment.trim().length} caracteres</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting || (reviewDialog.decision === "rejected" && reviewDialog.comment.trim().length === 0)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--gbp-accent)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--gbp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent" />
                  Guardando...
                </>
              ) : reviewDialog.decision === "approved" ? "Aprobar" : "Rechazar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

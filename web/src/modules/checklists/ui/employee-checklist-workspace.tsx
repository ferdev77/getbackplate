"use client";

import { Eye, ClipboardCheck, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { EmployeeChecklistPreviewModal } from "@/modules/checklists/ui/employee-checklist-preview-modal";
import { TooltipLabel } from "@/shared/ui/tooltip";

const PREVIEW_GUARD_KEY = "portal-checklist-preview-guard";
const PREVIEW_GUARD_TTL_MS = 15000;

type TemplateRow = {
  id: string;
  name: string;
  sent: boolean;
  submissionStatus: string | null;
  submittedAt: string | null;
};

type PreviewPayload = {
  template: { id: string; name: string };
  sections: Array<{ id: string; name: string; items: Array<{ id: string; label: string; priority: string }> }>;
  initialReport:
    | {
        submittedAt: string | null;
        status: string;
        items: Record<string, { checked: boolean; flagged: boolean; comment: string; photos: string[] }>;
      }
    | null;
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

export function EmployeeChecklistWorkspace({
  templates,
  initialPreviewTemplateId,
}: {
  templates: TemplateRow[];
  initialPreviewTemplateId?: string;
}) {
  const router = useRouter();
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>(templates);
  const [openTemplateId, setOpenTemplateId] = useState<string>("");
  const [loadingTemplateId, setLoadingTemplateId] = useState<string>("");
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const cacheRef = useRef<Map<string, { fetchedAt: number; payload: PreviewPayload }>>(new Map());
  const consumedInitialPreviewRef = useRef<string>("");
  const ttlMs = 60_000;

  useEffect(() => {
    setTemplateRows(templates);
  }, [templates]);

  const fetchPreview = useCallback(async (
    templateId: string,
    options?: { force?: boolean; silent?: boolean; updateActivePayload?: boolean },
  ) => {
    const force = Boolean(options?.force);
    const silent = Boolean(options?.silent);
    const updateActivePayload = options?.updateActivePayload ?? true;
    const cached = cacheRef.current.get(templateId);
    if (!force && cached && Date.now() - cached.fetchedAt <= ttlMs) {
      if (updateActivePayload) {
        setPayload(cached.payload);
      }
      return cached.payload;
    }

    if (!silent) setLoadingTemplateId(templateId);
    try {
      const response = await fetch(`/api/employee/checklists?preview=${encodeURIComponent(templateId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as PreviewPayload | { error?: string } | null;
      if (!response.ok || !data || !("template" in data)) {
        throw new Error((data && "error" in data ? data.error : null) ?? "No se pudo cargar el checklist");
      }
      cacheRef.current.set(templateId, { fetchedAt: Date.now(), payload: data });
      if (updateActivePayload) {
        setPayload(data);
      }
      return data;
    } finally {
      if (!silent) setLoadingTemplateId("");
    }
  }, []);

  const openPreview = useCallback(async (templateId: string) => {
    setOpenTemplateId(templateId);
    const cached = cacheRef.current.get(templateId);
    if (cached) {
      setPayload(cached.payload);
      if (Date.now() - cached.fetchedAt > ttlMs) {
        void fetchPreview(templateId, { force: true }).catch(() => {
          // keep cached payload
        });
      }
      return;
    }

    try {
      await fetchPreview(templateId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el checklist");
      setOpenTemplateId("");
    }
  }, [fetchPreview]);

  useEffect(() => {
    if (!initialPreviewTemplateId) return;
    if (consumedInitialPreviewRef.current === initialPreviewTemplateId) return;
    if (openTemplateId) return;
    if (!templateRows.find((row) => row.id === initialPreviewTemplateId)) return;

    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(PREVIEW_GUARD_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { id?: string; at?: number };
          if (
            parsed?.id === initialPreviewTemplateId &&
            typeof parsed.at === "number" &&
            Date.now() - parsed.at < PREVIEW_GUARD_TTL_MS
          ) {
            return;
          }
        }
        window.sessionStorage.setItem(
          PREVIEW_GUARD_KEY,
          JSON.stringify({ id: initialPreviewTemplateId, at: Date.now() }),
        );
      } catch {
        // ignore storage guard errors
      }
    }

    consumedInitialPreviewRef.current = initialPreviewTemplateId;
    void openPreview(initialPreviewTemplateId);
    router.replace("/portal/checklist", { scroll: false });
  }, [initialPreviewTemplateId, openPreview, openTemplateId, router, templateRows]);

  useEffect(() => {
    if (!templateRows.length) return;
    if (openTemplateId) return;
    const timer = setTimeout(() => {
      templateRows.forEach((template, index) => {
        setTimeout(() => {
          if (cacheRef.current.has(template.id)) return;
          void fetchPreview(template.id, { silent: true, updateActivePayload: false }).catch(() => {
            // ignore silent prefetch failure
          });
        }, index * 120);
      });
    }, 120);

    return () => clearTimeout(timer);
  }, [fetchPreview, openTemplateId, templateRows]);

  return (
    <>
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
                  onClick={() => void openPreview(template.id)}
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

      {openTemplateId ? (
        payload && payload.template.id === openTemplateId ? (
          <EmployeeChecklistPreviewModal
            templateId={payload.template.id}
            templateName={payload.template.name}
            sections={payload.sections}
            initialReport={payload.initialReport}
            onSubmitted={({ templateId, submittedAt }) => {
              setTemplateRows((prev) =>
                prev.map((row) =>
                  row.id === templateId
                    ? { ...row, sent: true, submissionStatus: "submitted", submittedAt }
                    : row,
                ),
              );
              cacheRef.current.delete(templateId);
            }}
            onClose={() => {
              setOpenTemplateId("");
              setPayload(null);
            }}
          />
        ) : (
          <div className="fixed inset-0 z-[1050] grid place-items-center bg-black/55 p-4">
            <div className="w-full max-w-[420px] rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-[0_24px_70px_rgba(0,0,0,.22)]">
              <p className="font-serif text-[15px] font-bold text-[var(--gbp-text)]">Checklist</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-[var(--gbp-text2)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Cargando formulario...</span>
              </div>
            </div>
          </div>
        )
      ) : null}
    </>
  );
}

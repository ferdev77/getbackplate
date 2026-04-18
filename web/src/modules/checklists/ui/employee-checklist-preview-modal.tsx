"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PreviewSection = {
  id: string;
  name: string;
  items: Array<{ id: string; label: string; priority: string }>;
};

type ReportItem = {
  checked: boolean;
  flagged: boolean;
  comment: string;
  photos: string[];
};

type InitialReport = {
  submittedAt: string | null;
  status: string;
  items: Record<string, ReportItem>;
} | null;

type ItemPhoto = {
  previewUrl: string;
  file?: File;
};

type ItemState = {
  checked: boolean;
  flagged: boolean;
  comment: string;
  photos: ItemPhoto[];
};

type EmployeeChecklistPreviewModalProps = {
  templateId: string;
  templateName: string;
  sections: PreviewSection[];
  initialReport: InitialReport;
  onClose?: () => void;
  onSubmitted?: (payload: { templateId: string; submittedAt: string }) => void;
};

function sectionIcon(name: string) {
  const value = name.toLowerCase();
  if (value.includes("cocina") || value.includes("boh")) return "🍳";
  if (value.includes("limpieza") || value.includes("mantenimiento")) return "🧼";
  if (value.includes("caja") || value.includes("finanza")) return "💵";
  if (value.includes("servicio") || value.includes("foh") || value.includes("salon")) return "🍽️";
  if (value.includes("seguridad")) return "🛡️";
  return "📋";
}

function priorityLabel(priority: string) {
  if (priority === "high") return "CRITICO";
  if (priority === "low") return "RUTINA";
  return "IMPORTANTE";
}

function priorityClass(priority: string) {
  if (priority === "high") return "bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]";
  if (priority === "low") return "bg-[var(--gbp-surface2)] text-[var(--gbp-text2)]";
  return "bg-[color:color-mix(in_oklab,var(--gbp-accent)_16%,transparent)] text-[var(--gbp-accent)]";
}

export function EmployeeChecklistPreviewModal({
  templateId,
  templateName,
  sections,
  initialReport,
  onClose,
  onSubmitted,
}: EmployeeChecklistPreviewModalProps) {
  const router = useRouter();
  const checklistBodyRef = useRef<HTMLDivElement | null>(null);
  const lastScrollRef = useRef(0);

  const [visible, setVisible] = useState(false);
  const [instructionsVisible, setInstructionsVisible] = useState(true);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [openPanels, setOpenPanels] = useState<Record<string, "comment" | "photo" | null>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const allItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  const [itemsState, setItemsState] = useState<Record<string, ItemState>>(() => {
    const next: Record<string, ItemState> = {};
    for (const item of allItems) {
      const report = initialReport?.items[item.id];
      next[item.id] = {
        checked: report?.checked ?? false,
        flagged: report?.flagged ?? false,
        comment: report?.comment ?? "",
        photos: (report?.photos ?? []).map((url) => ({ previewUrl: url })),
      };
    }
    return next;
  });

  const readOnly = Boolean(initialReport);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const body = checklistBodyRef.current;
    if (!body) return;

    const onScroll = () => {
      const y = body.scrollTop;
      if (y > 40 && y > lastScrollRef.current && instructionsVisible) {
        setInstructionsVisible(false);
      }
      lastScrollRef.current = y;
    };

    body.addEventListener("scroll", onScroll, { passive: true });
    return () => body.removeEventListener("scroll", onScroll);
  }, [instructionsVisible]);

  function closeModal() {
    setVisible(false);
    setTimeout(() => {
      if (onClose) {
        onClose();
        return;
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("portal-checklist-scroll-y", String(window.scrollY || 0));
      }
      router.replace("/portal/checklist", { scroll: false });
    }, 220);
  }

  function closeSuccessAndModal() {
    setSuccessVisible(false);
    setTimeout(() => {
      setSuccessOpen(false);
      closeModal();
    }, 180);
  }

  function toggleCheck(itemId: string) {
    if (readOnly) return;
    setItemsState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], checked: !prev[itemId].checked },
    }));
  }

  function toggleFlag(itemId: string) {
    if (readOnly) return;
    setItemsState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], flagged: !prev[itemId].flagged },
    }));
    setOpenPanels((prev) => ({ ...prev, [itemId]: "comment" }));
  }

  function togglePanel(itemId: string, panel: "comment" | "photo") {
    if (readOnly) return;
    setOpenPanels((prev) => ({ ...prev, [itemId]: prev[itemId] === panel ? null : panel }));
  }

  function updateComment(itemId: string, comment: string) {
    if (readOnly) return;
    setItemsState((prev) => ({ ...prev, [itemId]: { ...prev[itemId], comment } }));
  }

  function handlePhotos(itemId: string, files: FileList | null) {
    if (readOnly || !files?.length) return;
    const entries = Array.from(files).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setItemsState((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], photos: [...prev[itemId].photos, ...entries] },
    }));
  }

  const totalItems = allItems.length;
  const doneCount = allItems.filter((item) => itemsState[item.id]?.checked).length;
  const flaggedIds = allItems.filter((item) => itemsState[item.id]?.flagged).map((item) => item.id);
  const flaggedWithComment = flaggedIds.filter((id) => (itemsState[id]?.comment ?? "").trim().length > 0);
  const flaggedMissingComment = flaggedIds.filter((id) => !(itemsState[id]?.comment ?? "").trim());
  const resolvedCount = allItems.filter((item) => {
    const s = itemsState[item.id];
    if (!s) return false;
    return s.checked || (s.flagged && s.comment.trim().length > 0);
  }).length;
  const progressPct = totalItems ? Math.round((resolvedCount / totalItems) * 100) : 0;
  const canSubmit = totalItems > 0 && resolvedCount === totalItems && flaggedMissingComment.length === 0;

  let summaryText = `${resolvedCount} de ${totalItems} items resueltos.`;
  if (readOnly && initialReport?.submittedAt) {
    summaryText = `Reporte enviado el ${new Date(initialReport.submittedAt).toLocaleString("es-AR")}`;
  } else if (!totalItems) {
    summaryText = "Sin items para completar";
  } else if (canSubmit && flaggedIds.length === 0) {
    summaryText = "Todo completado. Sin novedades.";
  } else if (canSubmit) {
    summaryText = `Listo para enviar. ${flaggedIds.length} item(s) con atencion requerida.`;
  } else if (flaggedMissingComment.length > 0) {
    summaryText = `${flaggedMissingComment.length} item(s) requieren comentario.`;
  }

  async function submitReport() {
    if (readOnly || !canSubmit || isSubmitting) return;
    setSubmitError("");
    setIsSubmitting(true);

    const payloadItems = allItems.map((item) => {
      const s = itemsState[item.id];
      return {
        template_item_id: item.id,
        checked: s.checked,
        flagged: s.flagged,
        comment: s.comment,
      };
    });

    const formData = new FormData();
    formData.append("template_id", templateId);
    formData.append("items", JSON.stringify(payloadItems));
    for (const item of allItems) {
      for (const photo of itemsState[item.id].photos) {
        if (photo.file) {
          formData.append(`photo_${item.id}`, photo.file);
        }
      }
    }

    const response = await fetch("/api/employee/checklists/submit", {
      method: "POST",
      body: formData,
    });

    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setIsSubmitting(false);

    if (!response.ok || !data?.ok) {
      setSubmitError(data?.error ?? "No se pudo enviar el reporte");
      return;
    }

    const submittedAt = new Date().toISOString();
    onSubmitted?.({ templateId, submittedAt });
    router.refresh();
    setSuccessOpen(true);
    requestAnimationFrame(() => setSuccessVisible(true));
  }

  return (
    <>
      <div className={`fixed inset-0 z-[1050] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-[1px] transition-opacity duration-200 sm:p-6 ${visible ? "opacity-100" : "opacity-0"}`} onClick={closeModal}>
        <div className={`w-full max-w-[760px] overflow-hidden rounded-[20px] bg-[var(--gbp-surface)] shadow-[0_32px_80px_rgba(0,0,0,.4)] transition-all duration-300 ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-8 scale-[0.99] opacity-0"}`} onClick={(event) => event.stopPropagation()}>
          <div className="relative overflow-hidden bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] px-8 pb-6 pt-7 text-white">
            <div className="pointer-events-none absolute -right-12 -top-12 h-[210px] w-[210px] rounded-full bg-[radial-gradient(circle,rgba(192,57,43,.26)_0%,transparent_70%)]" />
            <div className="relative z-10 mb-5 flex items-start justify-between gap-3">
              <div>
                <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_45%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_16%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">📋 Apertura</span>
                <h2 className="font-serif text-[26px] leading-tight">{templateName}</h2>
                <p className="mt-1 text-[13px] text-white/45">{readOnly ? "Reporte enviado" : "Vista de ejecucion para empleado"}</p>
              </div>
               <button type="button" onClick={closeModal} className="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-lg border border-white/10 bg-white/10 text-[18px] text-white/60 hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-accent)] hover:text-white">✕</button>
            </div>

            {!readOnly ? (
              <div className={`mb-4 overflow-hidden rounded-[10px] border border-white/10 bg-white/5 transition-all duration-300 ${instructionsVisible ? "max-h-[320px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/45">Instrucciones</p>
                    <button type="button" onClick={() => setInstructionsVisible((prev) => !prev)} className="text-[11px] text-white/35 hover:text-white/70">{instructionsVisible ? "Ocultar ▲" : "Ver instrucciones ▼"}</button>
                  </div>
                  <p className="text-[12px] leading-7 text-white/70">Marca cada tarea al completarla. Si no puedes terminar alguna, usa <span className="mx-1 inline-flex items-center gap-1 rounded-md border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--gbp-accent)]">⚑ Marcar para atencion</span> y deja comentario obligatorio. Usa <span className="mx-1 inline-flex items-center gap-1 rounded-md border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--gbp-accent)]">💬 Comentario</span> y <span className="mx-1 inline-flex items-center gap-1 rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--gbp-text2)]">📷 Foto</span> para evidencia.</p>
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-white/55"><span>Progreso del turno</span><span className="font-semibold text-white">{doneCount} ✓ {flaggedWithComment.length ? `· ⚑ ${flaggedWithComment.length}` : ""}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[linear-gradient(90deg,var(--gbp-accent),var(--gbp-accent-hover))] transition-all duration-500" style={{ width: `${progressPct}%` }} /></div>
            </div>
          </div>

          <div ref={checklistBodyRef} className="max-h-[60vh] overflow-y-auto px-8 pb-0 pt-7">
            {sections.map((section) => {
              const sectionDone = section.items.filter((item) => itemsState[item.id]?.checked).length;
              return (
                <section key={section.id} className="mb-7">
                  <div className="mb-3 flex items-center gap-2 border-b-[1.5px] border-[var(--gbp-border)] pb-2.5">
                    <span className="text-lg">{sectionIcon(section.name)}</span>
                    <p className="flex-1 font-serif text-[17px] text-[var(--gbp-text)]">{section.name}</p>
                    <span className="rounded-full bg-[var(--gbp-surface2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--gbp-text2)]">{sectionDone}/{section.items.length}</span>
                  </div>

                  <div className="space-y-2">
                    {section.items.map((item) => {
                      const s = itemsState[item.id];
                      const panelType = openPanels[item.id];
                      return (
                        <article key={item.id} className={`overflow-hidden rounded-xl border-[1.5px] transition-all duration-200 ${s.checked ? "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-success)_8%,var(--gbp-surface))]" : s.flagged ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_8%,var(--gbp-surface))]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)]"}`}>
                          <div className="flex items-center gap-3 px-4 py-3">
                            <button type="button" disabled={readOnly} onClick={() => toggleCheck(item.id)} className={`grid h-[26px] w-[26px] place-items-center rounded-[7px] border-2 text-[12px] font-black ${s.checked ? "border-[var(--gbp-success)] bg-[var(--gbp-success)] text-white" : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-transparent"}`}>✓</button>
                            <button type="button" disabled={readOnly} onClick={() => toggleCheck(item.id)} className="min-w-0 flex-1 text-left">
                              <p className={`text-[14px] font-medium leading-6 ${s.checked ? "text-[var(--gbp-text2)] line-through decoration-[var(--gbp-success-soft)]" : "text-[var(--gbp-text)]"}`}>{item.label}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded-full px-2 py-[1px] text-[10px] font-extrabold uppercase tracking-[0.08em] ${priorityClass(item.priority)}`}>{priorityLabel(item.priority)}</span>
                                {s.flagged ? <span className="h-2 w-2 rounded-full bg-[var(--gbp-accent)]" /> : null}
                                {s.comment.trim() ? <span className="h-2 w-2 rounded-full bg-[var(--gbp-accent)]" /> : null}
                                {s.photos.length ? <span className="h-2 w-2 rounded-full bg-[var(--gbp-text2)]" /> : null}
                              </div>
                            </button>
                            <div className="flex items-center gap-1">
                              <button type="button" disabled={readOnly} onClick={() => toggleFlag(item.id)} className={`grid h-9 w-9 place-items-center rounded-lg border-[1.5px] text-base ${s.flagged ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] text-[var(--gbp-accent)]" : "border-[color:color-mix(in_oklab,var(--gbp-accent)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_10%,transparent)] text-[var(--gbp-accent)]"}`}>⚑</button>
                              <button type="button" disabled={readOnly} onClick={() => togglePanel(item.id, "comment")} className={`grid h-9 w-9 place-items-center rounded-lg border-[1.5px] text-base ${s.comment.trim() ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] text-[var(--gbp-accent)]" : "border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_12%,transparent)] text-[var(--gbp-accent)]"}`}>💬</button>
                              <button type="button" disabled={readOnly} onClick={() => togglePanel(item.id, "photo")} className={`grid h-9 w-9 place-items-center rounded-lg border-[1.5px] text-base ${s.photos.length ? "border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] text-[var(--gbp-text)]" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"}`}>📷</button>
                            </div>
                          </div>

                          {panelType === "comment" ? (
                            <div className="border-t border-[color:color-mix(in_oklab,var(--gbp-accent)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_8%,var(--gbp-surface))] px-4 pb-3 pt-2">
                              <textarea rows={2} value={s.comment} onChange={(event) => updateComment(item.id, event.target.value)} readOnly={readOnly} placeholder={s.flagged ? "⚑ Obligatorio: explica por que no pudiste completar esta tarea..." : "Agrega un comentario o nota (opcional)..."} className={`mt-1 w-full resize-none rounded-lg border-[1.5px] px-3 py-2 text-[13px] ${s.flagged && !s.comment.trim() ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_40%,transparent)] bg-[color:color-mix(in_oklab,var(--gbp-accent)_8%,var(--gbp-surface))]" : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)]"}`} />
                              {s.flagged && !s.comment.trim() ? <p className="mt-1 text-[11px] font-semibold text-[var(--gbp-accent)]">⚠ El comentario es obligatorio cuando se marca para atencion</p> : null}
                            </div>
                          ) : null}

                          {panelType === "photo" ? (
                            <div className="border-t border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 pb-3 pt-2">
                              {!readOnly ? (
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <label className="relative inline-flex cursor-pointer items-center gap-1 rounded-lg border-[1.5px] border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-accent-glow)] hover:text-[var(--gbp-accent)]">
                                    📸 Subir foto
                                    <input type="file" accept="image/*" multiple className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => handlePhotos(item.id, event.currentTarget.files)} />
                                  </label>
                                  <span className="text-[11px] text-[var(--gbp-muted)]">{s.photos.length ? `${s.photos.length} foto(s)` : "Opcional"}</span>
                                </div>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-2">
                                {s.photos.map((photo, index) => (
                                  <button key={`${item.id}-photo-${index}`} type="button" onClick={() => setLightboxImage(photo.previewUrl)} className="overflow-hidden rounded-lg border-2 border-[var(--gbp-border)] transition-transform hover:scale-105">
                                    <Image src={photo.previewUrl} alt="Adjunto" width={60} height={60} className="h-[60px] w-[60px] object-cover" unoptimized />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}

             {!totalItems ? <div className="rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">Este checklist no tiene items cargados.</div> : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-8 pb-7 pt-5">
            <p className="text-[13px] text-[var(--gbp-text2)]"><strong className="text-[var(--gbp-text)]">Resumen:</strong> {summaryText}</p>
            {readOnly ? (
              <button type="button" onClick={closeModal} className="rounded-[10px] bg-[var(--gbp-text)] px-6 py-3 text-sm font-bold text-white hover:bg-[var(--gbp-accent)]">Cerrar</button>
            ) : (
              <button type="button" onClick={submitReport} disabled={!canSubmit || isSubmitting} className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--gbp-text)] px-6 py-3 text-sm font-bold text-white transition-all hover:-translate-y-[1px] hover:bg-[var(--gbp-accent)] disabled:cursor-not-allowed disabled:bg-[var(--gbp-muted)]">{isSubmitting ? "Enviando..." : "Enviar Reporte"}</button>
            )}
          </div>

          {submitError ? <div className="border-t border-rose-200 bg-rose-50 px-8 py-3 text-sm text-rose-700">{submitError}</div> : null}
        </div>
      </div>

      {successOpen ? (
        <div className={`fixed inset-0 z-[1120] flex items-center justify-center bg-black/70 p-4 transition-opacity duration-200 ${successVisible ? "opacity-100" : "opacity-0"}`}>
          <div className={`w-full max-w-[420px] rounded-[20px] bg-[var(--gbp-surface)] px-8 py-10 text-center shadow-[0_32px_80px_rgba(0,0,0,.4)] transition-all duration-200 ${successVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}>
            <div className="mx-auto mb-5 grid h-[72px] w-[72px] place-items-center rounded-full border-2 border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[32px]">✅</div>
            <h3 className="font-serif text-[26px] text-[var(--gbp-text)]">Apertura Completada</h3>
            <p className="mt-2 text-[14px] leading-6 text-[var(--gbp-text2)]">El reporte fue registrado exitosamente y esta listo para revision.</p>
            <div className="mt-5 rounded-[10px] bg-[var(--gbp-bg)] px-4 py-3 text-left text-[12px] leading-7 text-[var(--gbp-text2)]">
              <p><strong className="text-[var(--gbp-text)]">Fecha:</strong> {new Date().toLocaleDateString("es-AR")}</p>
              <p><strong className="text-[var(--gbp-text)]">Hora:</strong> {new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</p>
              <p><strong className="text-[var(--gbp-text)]">Items resueltos:</strong> {resolvedCount}/{totalItems}</p>
              <p><strong className="text-[var(--gbp-text)]">Atencion requerida:</strong> {flaggedIds.length}</p>
            </div>
            <button type="button" onClick={closeSuccessAndModal} className="mt-6 rounded-[10px] bg-[var(--gbp-text)] px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--gbp-accent)]">Volver al portal</button>
          </div>
        </div>
      ) : null}

      {lightboxImage ? (
        <div className="fixed inset-0 z-[1130] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightboxImage(null)}>
          <button type="button" onClick={() => setLightboxImage(null)} className="absolute right-6 top-4 text-3xl text-white/80 hover:text-white">×</button>
          <Image src={lightboxImage} alt="Vista ampliada" width={1200} height={900} className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" unoptimized />
        </div>
      ) : null}
    </>
  );
}

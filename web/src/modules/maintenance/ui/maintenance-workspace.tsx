"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, ChevronDown, Clock, FileText, ImageIcon, Loader2, MessageSquare, Paperclip, Plus, Send, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import { MAINTENANCE_CATEGORIES, type MaintenanceRequest, type MaintenanceStatus } from "@/modules/maintenance/types";

type BranchOption = {
  id: string;
  name: string;
};

type MaintenanceWorkspaceProps = {
  mode: "company" | "employee";
  apiBase: "/api/company/maintenance" | "/api/employee/maintenance";
  canCreate: boolean;
  canRespond: boolean;
  initialRequests: MaintenanceRequest[];
  currentUserId: string;
  branches: BranchOption[];
};

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "open", label: "Abiertas" },
  { value: "draft", label: "Borradores" },
  { value: "completed", label: "Resueltas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "all", label: "Todas" },
];

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  draft: "Borrador",
  submitted: "Enviada",
  visit_scheduled: "Cita fijada",
  in_progress: "En progreso",
  needs_parts: "Requiere repuesto",
  needs_followup: "Segunda visita",
  resolved: "Resuelta",
  cancelled: "Cancelada",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const RESPOND_STATUSES: Array<{ value: MaintenanceStatus; label: string }> = [
  { value: "visit_scheduled", label: "Cita fijada" },
  { value: "in_progress", label: "En progreso" },
  { value: "needs_parts", label: "Requiere repuesto" },
  { value: "needs_followup", label: "Segunda visita" },
  { value: "resolved", label: "Resuelta" },
  { value: "cancelled", label: "Cancelada" },
];

function dateLabel(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusClassName(status: MaintenanceStatus) {
  if (status === "resolved") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (status === "cancelled") return "bg-rose-500/10 text-rose-600 border-rose-500/20";
  if (status === "draft") return "bg-slate-500/10 text-slate-600 border-slate-500/20";
  if (status === "needs_parts" || status === "needs_followup") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-[var(--gbp-accent)]/10 text-[var(--gbp-accent)] border-[var(--gbp-accent)]/20";
}

function imageAttachments(request: MaintenanceRequest) {
  return request.attachments.filter((attachment) => String(attachment.mimeType ?? "").startsWith("image/"));
}

export function MaintenanceWorkspace({
  mode,
  apiBase,
  canCreate,
  canRespond,
  initialRequests,
  currentUserId,
  branches,
}: MaintenanceWorkspaceProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [activeStatus, setActiveStatus] = useState("open");
  const [selectedId, setSelectedId] = useState(initialRequests[0]?.id ?? "");
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [responding, setResponding] = useState(false);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? requests[0] ?? null,
    [requests, selectedId],
  );

  useEffect(() => {
    if (!selectedRequest && requests[0]) {
      setSelectedId(requests[0].id);
    }
  }, [requests, selectedRequest]);

  async function refresh(status = activeStatus) {
    const response = await fetch(`${apiBase}?status=${encodeURIComponent(status)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo cargar mantenimiento");
    }
    setRequests(payload.requests ?? []);
    if (payload.requests?.[0]?.id) setSelectedId(payload.requests[0].id);
  }

  function changeStatus(status: string) {
    setActiveStatus(status);
    startTransition(() => {
      refresh(status).catch((error) => toast.error(error.message));
    });
  }

  function toggleRequestExpansion(requestId: string) {
    setExpandedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }

  async function submitCreate(formData: FormData) {
    const response = await fetch(apiBase, {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "No se pudo crear la request");
    setCreateOpen(false);
    toast.success("Request guardada");
    await refresh(activeStatus);
  }

  async function submitResponse(formData: FormData) {
    if (!selectedRequest) return;
    setResponding(true);
    try {
      const response = await fetch(`${apiBase}/${selectedRequest.id}/updates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: formData.get("status"),
          scheduled_visit_at: formData.get("scheduled_visit_at"),
          message: formData.get("message"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo responder la request");

      const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
      if (files.length) {
        const attachmentData = new FormData();
        for (const file of files) attachmentData.append("files", file);
        const attachmentsResponse = await fetch(`${apiBase}/${selectedRequest.id}/attachments`, {
          method: "POST",
          body: attachmentData,
        });
        const attachmentsPayload = await attachmentsResponse.json();
        if (!attachmentsResponse.ok) throw new Error(attachmentsPayload.error ?? "No se pudieron adjuntar archivos");
      }

      toast.success("Respuesta guardada");
      await refresh(activeStatus);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al responder");
    } finally {
      setResponding(false);
    }
  }

  async function submitDraftUpdate(formData: FormData) {
    if (!selectedRequest) return;
    const response = await fetch(`${apiBase}/${selectedRequest.id}`, {
      method: "PUT",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "No se pudo actualizar el borrador");
    toast.success(formData.get("action") === "submit" ? "Borrador enviado" : "Borrador actualizado");
    await refresh(activeStatus);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-5 shadow-sm sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="gbp-page-eyebrow mb-2 text-[var(--gbp-muted)]">{mode === "company" ? "Panel empresa" : "Portal empleado"}</p>
            <h1 className="text-2xl font-black tracking-tight text-[var(--gbp-text)]">Mantenimiento</h1>
            <p className="mt-1 text-sm text-[var(--gbp-text2)]">Requests por locacion con historial, visitas y adjuntos.</p>
          </div>
          {canCreate ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--gbp-text)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Nueva request
            </button>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => changeStatus(tab.value)}
            className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition ${
              activeStatus === tab.value
                ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)] text-white"
                : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {isPending ? <Loader2 className="h-4 w-4 animate-spin text-[var(--gbp-muted)]" /> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="space-y-3">
          {requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-10 text-center">
              <Wrench className="mx-auto h-8 w-8 text-[var(--gbp-muted)]" />
              <p className="mt-3 text-sm font-bold text-[var(--gbp-text)]">No hay requests en esta vista</p>
              <p className="mt-1 text-xs text-[var(--gbp-text2)]">Cambia el filtro o crea una nueva request de mantenimiento.</p>
            </div>
          ) : null}

          {requests.map((request) => {
            const previews = imageAttachments(request).slice(0, 3);
            const active = selectedRequest?.id === request.id;
            const expanded = expandedRequestIds.has(request.id);
            return (
              <article
                key={request.id}
                className={`rounded-2xl border bg-[var(--gbp-surface)] shadow-sm transition hover:shadow-md ${
                  active ? "border-[var(--gbp-accent)]/70 ring-1 ring-[var(--gbp-accent)]/10" : "border-[var(--gbp-border)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(request.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--gbp-muted)]">
                        <CalendarDays className="h-4 w-4" />
                        <span>Creada {dateLabel(request.createdAt)}</span>
                        {request.resolvedAt ? <span>Resuelta {dateLabel(request.resolvedAt)}</span> : null}
                      </div>
                      <h2 className="truncate text-base font-black text-[var(--gbp-text)]">{request.title}</h2>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusClassName(request.status)}`}>
                      {STATUS_LABELS[request.status]}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--gbp-text2)]">
                    <span className="rounded-full bg-[var(--gbp-bg)] px-3 py-1 font-semibold">{request.branchName}</span>
                    <span className="rounded-full bg-[var(--gbp-bg)] px-3 py-1 font-semibold">{request.category}</span>
                    {request.serviceItem ? <span className="rounded-full bg-[var(--gbp-bg)] px-3 py-1 font-semibold">{request.serviceItem}</span> : null}
                  </div>

                  <p className="mt-3 line-clamp-1 text-sm leading-relaxed text-[var(--gbp-text2)]">{request.description}</p>
                </button>

                <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
                  <span className="rounded-full bg-[var(--gbp-bg)] px-3 py-1 text-xs font-semibold text-[var(--gbp-text2)]">
                    Prioridad {PRIORITY_LABELS[request.priority] ?? request.priority}
                  </span>
                  {request.scheduledVisitAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gbp-bg)] px-3 py-1 text-xs font-semibold text-[var(--gbp-text2)]">
                      <Clock className="h-3.5 w-3.5" />
                      Visita {dateLabel(request.scheduledVisitAt)}
                    </span>
                  ) : null}
                  {request.attachments.length ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gbp-bg)] px-3 py-1 text-xs font-semibold text-[var(--gbp-text2)]">
                      <Paperclip className="h-3.5 w-3.5" />
                      {request.attachments.length} adjuntos
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(request.id);
                      toggleRequestExpansion(request.id);
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-1 text-xs font-bold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-surface2)]"
                    aria-expanded={expanded}
                  >
                    {expanded ? "Ocultar detalle" : "Ver detalle"}
                    <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {expanded ? (
                  <div className="border-t border-[var(--gbp-border)] px-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Categoria</p>
                        <p className="mt-1 text-sm text-[var(--gbp-text2)]">{request.category}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Item</p>
                        <p className="mt-1 text-sm text-[var(--gbp-text2)]">{request.serviceItem || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Locacion</p>
                        <p className="mt-1 text-sm text-[var(--gbp-text2)]">{request.branchName}</p>
                      </div>
                    </div>

                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--gbp-text2)]">{request.description}</p>

                    {previews.length ? (
                      <div className="mt-4 flex gap-2">
                        {previews.map((attachment) => (
                          attachment.signedUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={attachment.id} src={attachment.signedUrl} alt={attachment.fileName} className="h-16 w-16 rounded-xl object-cover" />
                          ) : null
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <aside className="sticky top-4 h-fit rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm">
          {selectedRequest ? (
            <div className="space-y-5">
              {/** Drafts stay editable until they are submitted; after that, everything moves through responses. */}
              {(() => {
                const canEditDraft = selectedRequest.status === "draft" && canCreate && (
                  mode === "company" || selectedRequest.createdBy === currentUserId
                );

                if (!canEditDraft) return null;

                return (
                  <form
                    action={(formData) => {
                      startTransition(() => {
                        submitDraftUpdate(formData).catch((error) => toast.error(error.message));
                      });
                    }}
                    className="space-y-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4"
                  >
                    <p className="text-sm font-bold text-[var(--gbp-text)]">Editar borrador</p>
                    <select name="branch_id" defaultValue={selectedRequest.branchId} required className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm">
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                    </select>
                    <select name="priority" defaultValue={selectedRequest.priority} className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm">
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                    <select name="category" defaultValue={selectedRequest.category} required className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm">
                      {MAINTENANCE_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>{category.label}</option>
                      ))}
                    </select>
                    <input name="service_item" defaultValue={selectedRequest.serviceItem ?? ""} placeholder="Item de servicio" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm" />
                    <input name="issue" defaultValue={selectedRequest.issue ?? ""} placeholder="Issue" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm" />
                    <input name="title" defaultValue={selectedRequest.title} required placeholder="Titulo" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm" />
                    <textarea name="description" defaultValue={selectedRequest.description} required rows={4} placeholder="Detalles" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm" />
                    <input name="files" type="file" multiple className="w-full rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs" />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="submit" name="action" value="draft" disabled={isPending} className="rounded-xl border border-[var(--gbp-border)] px-4 py-2.5 text-sm font-bold text-[var(--gbp-text2)] disabled:opacity-60">
                        Guardar cambios
                      </button>
                      <button type="submit" name="action" value="submit" disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Guardar y enviar
                      </button>
                    </div>
                  </form>
                );
              })()}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">{selectedRequest.branchName}</p>
                  <h2 className="mt-1 text-xl font-bold text-[var(--gbp-text)]">{selectedRequest.title}</h2>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusClassName(selectedRequest.status)}`}>
                  {STATUS_LABELS[selectedRequest.status]}
                </span>
              </div>

              <div className="rounded-xl bg-[var(--gbp-bg)] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Detalle original</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--gbp-text2)]">{selectedRequest.description}</p>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">
                  <Paperclip className="h-4 w-4" />
                  Adjuntos
                </p>
                {selectedRequest.attachments.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedRequest.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.signedUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-2 text-xs font-semibold text-[var(--gbp-text2)]"
                      >
                        {attachment.mimeType?.startsWith("image/") && attachment.signedUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={attachment.signedUrl} alt={attachment.fileName} className="mb-2 h-24 w-full rounded-lg object-cover" />
                        ) : (
                          <FileText className="mb-2 h-6 w-6 text-[var(--gbp-muted)]" />
                        )}
                        <span className="line-clamp-1">{attachment.fileName}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-[var(--gbp-bg)] px-3 py-2 text-xs text-[var(--gbp-muted)]">Sin adjuntos.</p>
                )}
              </div>

              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">
                  <MessageSquare className="h-4 w-4" />
                  Timeline
                </p>
                <div className="space-y-3">
                  {selectedRequest.updates.map((update) => (
                    <div key={update.id} className="border-l-2 border-[var(--gbp-border)] pl-3">
                      <p className="text-xs font-bold text-[var(--gbp-text)]">
                        {update.toStatus ? STATUS_LABELS[update.toStatus] : "Comentario"}
                      </p>
                      <p className="text-[11px] text-[var(--gbp-muted)]">
                        {update.actorName} · {dateLabel(update.createdAt)}
                      </p>
                      {update.scheduledVisitAt ? <p className="mt-1 text-xs text-[var(--gbp-text2)]">Visita: {dateLabel(update.scheduledVisitAt)}</p> : null}
                      {update.message ? <p className="mt-1 text-sm text-[var(--gbp-text2)]">{update.message}</p> : null}
                    </div>
                  ))}
                </div>
              </div>

              {canRespond && selectedRequest.status !== "draft" ? (
                <form
                  action={(formData) => {
                    submitResponse(formData);
                  }}
                  className="space-y-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4"
                >
                  <p className="text-sm font-bold text-[var(--gbp-text)]">Responder request</p>
                  <select name="status" defaultValue={selectedRequest.status} className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm">
                    {RESPOND_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                  <input name="scheduled_visit_at" type="datetime-local" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm" />
                  <textarea name="message" rows={3} placeholder="Reporte, notas o requerimientos..." className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm" />
                  <input name="files" type="file" multiple className="w-full rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs" />
                  <button disabled={responding} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                    {responding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Guardar respuesta
                  </button>
                </form>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--gbp-muted)]">Selecciona una request para ver el detalle.</p>
          )}
        </aside>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4">
          <form
            action={(formData) => {
              startTransition(() => {
                submitCreate(formData).catch((error) => toast.error(error.message));
              });
            }}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Nueva request</p>
                <h2 className="text-xl font-bold text-[var(--gbp-text)]">Crear mantenimiento</h2>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-full bg-[var(--gbp-bg)] p-2 text-[var(--gbp-text2)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)]">
                Locacion
                <select name="branch_id" required className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm">
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)]">
                Prioridad
                <select name="priority" defaultValue="medium" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm">
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </label>
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)]">
                Categoria
                <select name="category" required className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm">
                  {MAINTENANCE_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>{category.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)]">
                Item de servicio
                <input name="service_item" placeholder="Ej: Sink, HVAC, Freezer" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)] sm:col-span-2">
                Issue
                <input name="issue" placeholder="Buscar o escribir el problema" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)] sm:col-span-2">
                Titulo
                <input name="title" required placeholder="Ej: Sink leaks" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)] sm:col-span-2">
                Detalles
                <textarea name="description" required rows={5} placeholder="Conta que pasa, donde ocurre y cualquier dato util." className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--gbp-accent)] bg-[var(--gbp-accent)]/5 px-4 py-8 text-center text-sm font-semibold text-[var(--gbp-text2)] sm:col-span-2">
                <ImageIcon className="h-7 w-7 text-[var(--gbp-accent)]" />
                Drop o upload de imagenes/archivos
                <input name="files" type="file" multiple className="max-w-full text-xs" />
              </label>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="submit" name="action" value="draft" disabled={isPending} className="rounded-xl border border-[var(--gbp-border)] px-4 py-2.5 text-sm font-bold text-[var(--gbp-text2)] disabled:opacity-60">
                Guardar borrador
              </button>
              <button type="submit" name="action" value="submit" disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Crear y enviar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

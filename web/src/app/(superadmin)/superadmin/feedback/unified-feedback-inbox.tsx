"use client";

import { useDeferredValue, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle, Bug, CheckCircle2, ChevronDown, Clipboard, Clock3,
  FileKey2, History, Inbox, Lightbulb, Loader2, Mail, MessageSquare,
  Search, ShieldCheck, UserRoundCheck, X,
} from "lucide-react";
import { toast } from "sonner";

import { updateFeedbackStatusAction } from "./actions";
import { manageSupportRequestAction } from "./support-actions";

export type InboxAssignee = { id: string; name: string };
export type FeedbackInboxRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  pagePath: string | null;
  source: "company" | "employee";
  status: string;
  userName: string;
  organizationName: string;
  createdAt: string;
};
export type SupportEventRow = {
  id: string;
  type: string;
  actorName: string;
  previousValue: Record<string, unknown> | null;
  nextValue: Record<string, unknown> | null;
  createdAt: string;
};
export type SupportInboxRow = {
  id: string;
  type: string;
  requesterName: string;
  requesterEmail: string;
  requesterUserId: string | null;
  identitySource: string;
  authenticatedAt: string | null;
  companyName: string | null;
  organizationId: string | null;
  details: string;
  status: string;
  verifiedAt: string | null;
  resolvedAt: string | null;
  assignedTo: string | null;
  internalNotes: string | null;
  acknowledgementSentAt: string | null;
  internalNotifiedAt: string | null;
  notificationError: string | null;
  createdAt: string;
  updatedAt: string;
  events: SupportEventRow[];
};

type Props = {
  feedback: FeedbackInboxRow[];
  supportRequests: SupportInboxRow[];
  assignees: InboxAssignee[];
  currentUserId: string;
  initialTab: "feedback" | "support";
  feedbackPage: number;
  supportPage: number;
  feedbackTotal: number;
  supportTotal: number;
  feedbackOpenTotal: number;
  supportOpenTotal: number;
  pageSize: number;
};
type RowsUpdate<T> = T[] | ((rows: T[]) => T[]);

const SUPPORT_STATUSES = ["open", "verifying", "in_progress", "resolved", "rejected"] as const;
const STATUS_LABELS: Record<string, string> = {
  open: "Abierta", verifying: "Verificando", in_progress: "En proceso", resolved: "Resuelta", rejected: "Rechazada",
};
const TYPE_LABELS: Record<string, string> = {
  support: "Soporte técnico", access: "Acceso a datos", correction: "Corrección", export: "Exportación", deletion: "Eliminación",
};
const EVENT_LABELS: Record<string, string> = {
  created: "Solicitud recibida", status_changed: "Estado actualizado", assignment_changed: "Responsable actualizado",
  notes_updated: "Notas internas actualizadas", verification_changed: "Verificación actualizada",
};
const CONTROL = "h-11 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 text-sm text-[var(--gbp-text)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10";

function statusClass(status: string) {
  if (status === "resolved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "in_progress") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "verifying") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function UnifiedFeedbackInbox({
  feedback, supportRequests, assignees, currentUserId, initialTab,
  feedbackPage, supportPage, feedbackTotal, supportTotal,
  feedbackOpenTotal, supportOpenTotal, pageSize,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"feedback" | "support">(initialTab);
  const [feedbackRows, setFeedbackRows] = useOptimistic<FeedbackInboxRow[], RowsUpdate<FeedbackInboxRow>>(
    feedback,
    (rows, update) => typeof update === "function" ? update(rows) : update,
  );
  const [supportRows, setSupportRows] = useOptimistic<SupportInboxRow[], RowsUpdate<SupportInboxRow>>(
    supportRequests,
    (rows, update) => typeof update === "function" ? update(rows) : update,
  );
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedRequest = supportRows.find((row) => row.id === selectedRequestId) ?? null;
  const normalizedSearch = deferredSearch;
  const visibleFeedback = feedbackRows.filter((row) => {
    const text = [row.title, row.message, row.userName, row.organizationName].join(" ").toLowerCase();
    return (!normalizedSearch || text.includes(normalizedSearch))
      && (statusFilter === "all" || (statusFilter === "open" ? row.status !== "resolved" : row.status === statusFilter))
      && (typeFilter === "all" || row.type === typeFilter);
  });
  const visibleSupport = supportRows.filter((row) => {
    const text = [row.id, row.requesterName, row.requesterEmail, row.companyName ?? "", row.details].join(" ").toLowerCase();
    const assigneeMatches = assigneeFilter === "all" || (assigneeFilter === "unassigned" ? !row.assignedTo : row.assignedTo === assigneeFilter);
    return (!normalizedSearch || text.includes(normalizedSearch))
      && (statusFilter === "all" || row.status === statusFilter)
      && (typeFilter === "all" || row.type === typeFilter)
      && assigneeMatches;
  });

  function switchTab(tab: "feedback" | "support") {
    setActiveTab(tab);
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setAssigneeFilter("all");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }

  function goToPage(tab: "feedback" | "support", page: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    params.set(tab === "feedback" ? "feedbackPage" : "supportPage", String(page));
    startTransition(() => router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false }));
  }

  function updateFeedback(id: string, resolved: boolean) {
    startTransition(async () => {
      try {
        await updateFeedbackStatusAction(id, resolved ? "open" : "resolved");
        setFeedbackRows((rows) => rows.map((row) => row.id === id ? { ...row, status: resolved ? "open" : "resolved" } : row));
        toast.success(resolved ? "Feedback reabierto" : "Feedback resuelto");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo actualizar el feedback");
      }
    });
  }

  function updateSupport(
    id: string,
    action: "status" | "assignment" | "notes" | "verification",
    value: string | null,
    message: string,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const result = await manageSupportRequestAction(id, action, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSupportRows((rows) => rows.map((row) => {
        if (row.id !== id) return row;
        const now = new Date().toISOString();
        const eventType = action === "status" ? "status_changed"
          : action === "assignment" ? "assignment_changed"
            : action === "notes" ? "notes_updated" : "verification_changed";
        const event: SupportEventRow = {
          id: crypto.randomUUID(),
          type: eventType,
          actorName: assignees.find((assignee) => assignee.id === currentUserId)?.name ?? "Superadmin",
          previousValue: null,
          nextValue: null,
          createdAt: now,
        };
        if (action === "status") return { ...row, status: value ?? row.status, events: [event, ...row.events] };
        if (action === "assignment") return { ...row, assignedTo: value || null, events: [event, ...row.events] };
        if (action === "notes") return { ...row, internalNotes: value?.trim() || null, events: [event, ...row.events] };
        return { ...row, verifiedAt: value === "true" ? now : null, events: [event, ...row.events] };
      }));
      onSuccess?.();
      toast.success(message);
      router.refresh();
    });
  }

  function openRequest(row: SupportInboxRow) {
    setSelectedRequestId(row.id);
    setNotesDraft(row.internalNotes ?? "");
  }

  async function copyReference(id: string) {
    await navigator.clipboard.writeText(id);
    toast.success("Referencia copiada");
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-[var(--gbp-border)] bg-[linear-gradient(135deg,#172033_0%,#263b62_60%,#31558f_100%)] p-7 text-white shadow-xl">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-300/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Superadmin Inbox</p>
            <h1 className="mt-2 text-3xl font-bold">Feedback, soporte y privacidad</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">Una sola bandeja para escuchar a los usuarios y gestionar solicitudes formales con trazabilidad.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3"><p className="text-2xl font-bold">{feedbackTotal + supportTotal}</p><p className="text-[10px] uppercase tracking-wider text-white/60">Total</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3"><p className="text-2xl font-bold">{feedbackOpenTotal}</p><p className="text-[10px] uppercase tracking-wider text-white/60">Feedback</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3"><p className="text-2xl font-bold">{supportOpenTotal}</p><p className="text-[10px] uppercase tracking-wider text-white/60">Soporte</p></div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-2 shadow-sm">
        <button type="button" onClick={() => switchTab("feedback")} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition ${activeTab === "feedback" ? "bg-[var(--gbp-text)] text-white" : "text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"}`}>
          <MessageSquare className="h-4 w-4" /> Feedback <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{feedbackOpenTotal}</span>
        </button>
        <button type="button" onClick={() => switchTab("support")} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition ${activeTab === "support" ? "bg-[var(--gbp-text)] text-white" : "text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"}`}>
          <FileKey2 className="h-4 w-4" /> Soporte y privacidad <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{supportOpenTotal}</span>
        </button>
      </div>

      <section className="grid gap-3 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <label className="relative xl:col-span-2"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gbp-text2)]" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeTab === "support" ? "Buscar referencia, persona, email o empresa" : "Buscar título, mensaje, usuario o empresa"} className={`${CONTROL} w-full pl-11`} /></label>
        <div className="relative"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${CONTROL} w-full appearance-none pr-10`}><option value="all">Todos los estados</option>{activeTab === "support" ? SUPPORT_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>) : <><option value="open">Pendientes</option><option value="resolved">Resueltos</option></>}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2" /></div>
        <div className="relative"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={`${CONTROL} w-full appearance-none pr-10`}><option value="all">Todos los tipos</option>{activeTab === "support" ? Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>) : <><option value="bug">Bug</option><option value="idea">Idea</option><option value="other">Otro</option></>}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2" /></div>
        {activeTab === "support" && <div className="relative md:col-span-2 xl:col-span-4"><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className={`${CONTROL} w-full appearance-none pr-10`}><option value="all">Todos los responsables</option><option value="unassigned">Sin asignar</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2" /></div>}
      </section>

      {activeTab === "feedback" ? (
        <section className="space-y-3">
          {visibleFeedback.map((row) => {
            const resolved = row.status === "resolved";
            const Icon = row.type === "bug" ? Bug : row.type === "idea" ? Lightbulb : MessageSquare;
            return <article key={row.id} className={`rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm transition ${resolved ? "opacity-65" : "hover:-translate-y-0.5 hover:shadow-md"}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs"><span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 font-bold uppercase text-blue-700"><Icon className="h-3 w-3" />{row.type === "bug" ? "Bug" : row.type === "idea" ? "Idea" : "Otro"}</span><span className="rounded-full bg-[var(--gbp-surface2)] px-2.5 py-1 font-semibold">{row.organizationName}</span><span className="text-[var(--gbp-text2)]">{row.source === "employee" ? "Empleado" : "Empresa"} · {row.userName} · {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true, locale: es })}</span></div>
                  <h2 className="mt-3 font-bold text-[var(--gbp-text)]">{row.title}</h2><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--gbp-text2)]">{row.message}</p>{row.pagePath && <p className="mt-3 text-xs text-[var(--gbp-text2)]/70">Origen: <code>{row.pagePath}</code></p>}
                </div>
                <button type="button" disabled={isPending} onClick={() => updateFeedback(row.id, resolved)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-bold transition disabled:opacity-50 ${resolved ? "border border-amber-200 bg-amber-50 text-amber-700" : "bg-[var(--gbp-text)] text-white"}`}>{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : resolved ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{resolved ? "Reabrir" : "Resolver"}</button>
              </div>
            </article>;
          })}
          {visibleFeedback.length === 0 && <EmptyInbox />}
          <Pagination currentPage={feedbackPage} total={feedbackTotal} pageSize={pageSize} pending={isPending} onPage={(page) => goToPage("feedback", page)} />
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-sm">
          <div className="divide-y divide-[var(--gbp-border)]">
            {visibleSupport.map((row) => <button key={row.id} type="button" onClick={() => openRequest(row)} className="grid w-full gap-3 p-5 text-left transition hover:bg-[var(--gbp-surface2)] sm:grid-cols-[minmax(0,1fr)_180px_160px] sm:items-center">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${row.type === "deletion" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>{TYPE_LABELS[row.type] ?? row.type}</span>{row.identitySource === "authenticated" && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700"><ShieldCheck className="h-3 w-3" /> Sesión autenticada</span>}{row.type !== "support" && (row.verifiedAt ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Verificada</span> : <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Requiere verificación</span>)}</div><p className="mt-2 truncate font-bold text-[var(--gbp-text)]">{row.requesterName} <span className="font-normal text-[var(--gbp-text2)]">· {row.companyName || "Sin empresa"}</span></p><p className="mt-1 truncate text-sm text-[var(--gbp-text2)]">{row.details}</p><p className="mt-2 font-mono text-[10px] text-[var(--gbp-text2)]">{row.id}</p></div>
              <div><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusClass(row.status)}`}>{STATUS_LABELS[row.status] ?? row.status}</span><p className="mt-2 text-xs text-[var(--gbp-text2)]">{row.assignedTo ? assignees.find((item) => item.id === row.assignedTo)?.name ?? "Asignada" : "Sin responsable"}</p></div>
              <div className="text-xs text-[var(--gbp-text2)] sm:text-right"><p>{format(new Date(row.createdAt), "dd/MM/yyyy HH:mm")}</p><p className="mt-1">{formatDistanceToNow(new Date(row.createdAt), { addSuffix: true, locale: es })}</p></div>
            </button>)}
          </div>
          {visibleSupport.length === 0 && <EmptyInbox />}
          <div className="border-t border-[var(--gbp-border)] p-4"><Pagination currentPage={supportPage} total={supportTotal} pageSize={pageSize} pending={isPending} onPage={(page) => goToPage("support", page)} /></div>
        </section>
      )}

      {selectedRequest && <div className="fixed inset-0 z-[1100] flex justify-end bg-black/45" onClick={() => !isPending && setSelectedRequestId(null)}>
        <aside role="dialog" aria-modal="true" aria-label="Detalle de solicitud" className="h-full w-full max-w-2xl overflow-y-auto bg-[var(--gbp-surface)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--gbp-border)] bg-[var(--gbp-surface)]/95 px-6 py-5 backdrop-blur"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${selectedRequest.type === "deletion" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>{TYPE_LABELS[selectedRequest.type]}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(selectedRequest.status)}`}>{STATUS_LABELS[selectedRequest.status]}</span></div><h2 className="mt-3 text-xl font-bold text-[var(--gbp-text)]">{selectedRequest.requesterName}</h2><p className="text-sm text-[var(--gbp-text2)]">{selectedRequest.companyName || "Sin empresa indicada"}</p></div><button type="button" onClick={() => setSelectedRequestId(null)} className="rounded-xl p-2 text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"><X className="h-5 w-5" /></button></div>
          <div className="space-y-6 p-6">
            {selectedRequest.identitySource === "authenticated" && <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Solicitud iniciada desde una sesión autenticada</p><p className="mt-1 text-emerald-800">La cuenta y organización fueron resueltas por el servidor{selectedRequest.authenticatedAt ? ` el ${format(new Date(selectedRequest.authenticatedAt), "dd/MM/yyyy HH:mm")}` : ""}. Esto no reemplaza la verificación formal requerida para solicitudes de privacidad.</p></div></div>}
            {selectedRequest.identitySource === "authenticated" && <div className="grid gap-2 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] p-3 font-mono text-[10px] text-[var(--gbp-text2)] sm:grid-cols-2"><p>user: {selectedRequest.requesterUserId ?? "retained identity unavailable"}</p><p>organization: {selectedRequest.organizationId ?? "deleted organization"}</p></div>}
            {selectedRequest.type !== "support" && !selectedRequest.verifiedAt && <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Verificación obligatoria</p><p className="mt-1 text-amber-800">No se puede procesar ni resolver esta solicitud de privacidad hasta verificar identidad y autoridad.</p></div></div>}
            <div className="grid gap-3 sm:grid-cols-2"><a href={`mailto:${selectedRequest.requesterEmail}`} className="flex items-center gap-3 rounded-xl border border-[var(--gbp-border)] p-4 text-sm hover:bg-[var(--gbp-surface2)]"><Mail className="h-4 w-4" /><span className="truncate">{selectedRequest.requesterEmail}</span></a><button type="button" onClick={() => copyReference(selectedRequest.id)} className="flex items-center gap-3 rounded-xl border border-[var(--gbp-border)] p-4 text-left text-sm hover:bg-[var(--gbp-surface2)]"><Clipboard className="h-4 w-4" /><span className="truncate font-mono text-xs">{selectedRequest.id}</span></button></div>
            <section><h3 className="text-xs font-bold uppercase tracking-wider text-[var(--gbp-text2)]">Solicitud</h3><p className="mt-2 whitespace-pre-wrap rounded-2xl bg-[var(--gbp-surface2)] p-4 text-sm leading-relaxed text-[var(--gbp-text)]">{selectedRequest.details}</p></section>
            <section className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-[var(--gbp-text)]">Estado<div className="relative mt-2"><select value={selectedRequest.status} disabled={isPending} onChange={(event) => updateSupport(selectedRequest.id, "status", event.target.value, "Estado actualizado")} className={`${CONTROL} w-full appearance-none pr-10`}>{SUPPORT_STATUSES.map((status) => <option key={status} value={status} disabled={selectedRequest.type !== "support" && !selectedRequest.verifiedAt && ["in_progress", "resolved"].includes(status)}>{STATUS_LABELS[status]}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" /></div></label><label className="text-sm font-bold text-[var(--gbp-text)]">Responsable<div className="relative mt-2"><select value={selectedRequest.assignedTo ?? ""} disabled={isPending} onChange={(event) => updateSupport(selectedRequest.id, "assignment", event.target.value || null, "Responsable actualizado")} className={`${CONTROL} w-full appearance-none pr-10`}><option value="">Sin asignar</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" /></div></label></section>
            <div className="flex flex-wrap gap-3"><button type="button" disabled={isPending} onClick={() => updateSupport(selectedRequest.id, "assignment", selectedRequest.assignedTo === currentUserId ? null : currentUserId, selectedRequest.assignedTo === currentUserId ? "Solicitud liberada" : "Solicitud asignada a ti")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--gbp-border)] px-4 text-xs font-bold hover:bg-[var(--gbp-surface2)] disabled:opacity-50"><UserRoundCheck className="h-4 w-4" />{selectedRequest.assignedTo === currentUserId ? "Liberar" : "Asignarme"}</button>{selectedRequest.type !== "support" && <button type="button" disabled={isPending || Boolean(selectedRequest.verifiedAt && ["in_progress", "resolved"].includes(selectedRequest.status))} onClick={() => updateSupport(selectedRequest.id, "verification", selectedRequest.verifiedAt ? "false" : "true", selectedRequest.verifiedAt ? "Verificación retirada" : "Identidad verificada")} title={selectedRequest.verifiedAt && ["in_progress", "resolved"].includes(selectedRequest.status) ? "No se puede retirar la verificación de una solicitud procesada" : undefined} className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold disabled:opacity-50 ${selectedRequest.verifiedAt ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-[var(--gbp-text)] text-white"}`}><ShieldCheck className="h-4 w-4" />{selectedRequest.verifiedAt ? "Identidad verificada" : "Marcar identidad verificada"}</button>}</div>
            <section><label htmlFor="support-internal-notes" className="text-xs font-bold uppercase tracking-wider text-[var(--gbp-text2)]">Notas internas</label><textarea id="support-internal-notes" rows={6} maxLength={10000} value={notesDraft} disabled={isPending} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Contexto interno, pasos realizados y resolución..." className="mt-2 w-full resize-y rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10" /><button type="button" disabled={isPending || notesDraft.trim() === (selectedRequest.internalNotes ?? "")} onClick={() => { const notes = notesDraft.trim(); updateSupport(selectedRequest.id, "notes", notes, "Notas guardadas", () => setNotesDraft(notes)); }} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-[#5d7df4] px-4 text-xs font-bold text-white disabled:opacity-40">{isPending && <Loader2 className="h-4 w-4 animate-spin" />}Guardar notas</button></section>
            <section><h3 className="text-xs font-bold uppercase tracking-wider text-[var(--gbp-text2)]">Notificaciones</h3><div className="mt-2 grid gap-2 sm:grid-cols-2"><NotificationState label="Confirmación al solicitante" sentAt={selectedRequest.acknowledgementSentAt} /><NotificationState label="Aviso interno" sentAt={selectedRequest.internalNotifiedAt} /></div>{selectedRequest.notificationError && <p className="mt-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{selectedRequest.notificationError}</p>}</section>
            <section><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--gbp-text2)]"><History className="h-4 w-4" />Historial</h3><div className="mt-3 space-y-3">{selectedRequest.events.map((event) => <div key={event.id} className="relative border-l-2 border-[var(--gbp-border)] pl-4"><span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[#5d7df4]" /><p className="text-sm font-bold text-[var(--gbp-text)]">{EVENT_LABELS[event.type] ?? event.type}</p><p className="mt-0.5 text-xs text-[var(--gbp-text2)]">{event.actorName} · {format(new Date(event.createdAt), "dd/MM/yyyy HH:mm")}</p></div>)}</div></section>
          </div>
        </aside>
      </div>}
    </div>
  );
}

function NotificationState({ label, sentAt }: { label: string; sentAt: string | null }) {
  return <div className={`rounded-xl border p-3 text-xs ${sentAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}><p className="font-bold">{label}</p><p className="mt-1">{sentAt ? `Enviada ${format(new Date(sentAt), "dd/MM/yyyy HH:mm")}` : "No confirmada"}</p></div>;
}

function EmptyInbox() {
  return <div className="flex min-h-52 flex-col items-center justify-center gap-2 p-8 text-center"><Inbox className="h-10 w-10 text-[var(--gbp-text2)]/30" /><p className="font-bold text-[var(--gbp-text)]">No hay resultados</p><p className="text-sm text-[var(--gbp-text2)]">Prueba con otros filtros o términos de búsqueda.</p></div>;
}

function Pagination({ currentPage, total, pageSize, pending, onPage }: { currentPage: number; total: number; pageSize: number; pending: boolean; onPage: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return <div className="flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3 text-sm"><p className="text-[var(--gbp-text2)]">Página {currentPage} de {totalPages} · {total} registros</p><div className="flex gap-2"><button type="button" disabled={pending || currentPage <= 1} onClick={() => onPage(currentPage - 1)} className="rounded-lg border border-[var(--gbp-border)] px-3 py-2 font-bold disabled:opacity-40">Anterior</button><button type="button" disabled={pending || currentPage >= totalPages} onClick={() => onPage(currentPage + 1)} className="rounded-lg bg-[var(--gbp-text)] px-3 py-2 font-bold text-white disabled:opacity-40">Siguiente</button></div></div>;
}

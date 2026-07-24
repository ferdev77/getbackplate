"use client";

import { useState } from "react";
import { format } from "date-fns";
import { FileText, Search, ShieldCheck } from "lucide-react";
import { SuperadminDocumentTrashList } from "@/modules/trash/ui/superadmin-document-trash-list";

type TrashedDocumentAdmin = {
  id: string;
  title: string;
  file_size_bytes: number;
  deleted_at: string;
  organization_id: string;
  organizations?: { name: string } | null;
};

export type DeletionAuditLog = {
  id: string;
  action: string;
  entity_id: string | null;
  entity_type: string;
  created_at: string;
  organization_name: string | null;
  actor_email: string | null;
  metadata: Record<string, unknown> | null;
};

type Props = {
  documents: TrashedDocumentAdmin[];
  auditLogs: DeletionAuditLog[];
};

type ActionFilter = "all" | "deleted" | "restored" | "purged";
type DateRange = "30" | "90" | "365";

function lifecycleAction(action: string): Exclude<ActionFilter, "all"> | null {
  const normalized = action.toLowerCase();
  if (normalized.includes("restore")) return "restored";
  if (normalized.includes("purge")) return "purged";
  if (normalized.includes("delete")) return "deleted";
  return null;
}

function eventLabel(log: DeletionAuditLog) {
  if (log.metadata?.system_maintenance === true) {
    const count = typeof log.metadata.records_affected === "number" ? log.metadata.records_affected : 0;
    const noun = typeof log.metadata.task_noun === "string" ? log.metadata.task_noun : "old record";
    return `System deleted ${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
  }
  const title = log.metadata?.document_title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const entityName = log.metadata?.entity_name;
  if (typeof entityName === "string" && entityName.trim()) {
    return `${log.entity_type.replace(/_/g, " ")} · ${entityName.trim()}`;
  }
  return `${log.entity_type.replace(/_/g, " ")} ${log.entity_id ? `#${log.entity_id.slice(0, 8)}` : ""}`.trim();
}

function outcomeLabel(log: DeletionAuditLog) {
  const outcome = log.metadata?.outcome;
  if (outcome === "success") return { label: "Successful", color: "text-emerald-700" };
  if (outcome === "denied") return { label: "Denied", color: "text-amber-700" };
  if (outcome === "error" || outcome === "failed") return { label: "Failed", color: "text-rose-700" };
  return { label: "Unknown", color: "text-[var(--gbp-text2)]" };
}

function actionStyle(action: Exclude<ActionFilter, "all">) {
  if (action === "restored") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (action === "purged") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function DeletionLog({ logs }: { logs: DeletionAuditLog[] }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<ActionFilter>("all");
  const [range, setRange] = useState<DateRange>("365");
  const [now] = useState(() => Date.now());
  const visible = logs.filter((log) => {
    const lifecycle = lifecycleAction(log.action);
    if (!lifecycle || (action !== "all" && lifecycle !== action)) return false;
    if (new Date(log.created_at).getTime() < now - Number(range) * 86_400_000) return false;
    const searchable = [eventLabel(log), log.action, log.entity_type, log.organization_name, log.actor_email, log.metadata?.entity_slug].filter(Boolean).join(" ").toLowerCase();
    return searchable.includes(query.trim().toLowerCase());
  });
  const last30 = logs.filter((log) => new Date(log.created_at).getTime() >= now - 30 * 86_400_000);
  const metric = (target: Exclude<ActionFilter, "all">) => last30.reduce((total, log) => {
    if (lifecycleAction(log.action) !== target || log.metadata?.outcome !== "success") return total;
    if (log.metadata.system_maintenance === true && typeof log.metadata.records_affected === "number") {
      return total + log.metadata.records_affected;
    }
    return total + 1;
  }, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Deleted in last 30 days", metric("deleted"), "text-amber-700"],
          ["Restored in last 30 days", metric("restored"), "text-emerald-700"],
          ["Permanently purged in last 30 days", metric("purged"), "text-rose-700"],
          ["Total visible", visible.length, "text-[var(--gbp-text)]"],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-[var(--gbp-text2)]">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3 shadow-sm sm:flex sm:items-center sm:gap-3">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gbp-muted)]" />
          <span className="sr-only">Search deletion log</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search document, entity, company, or actor" className="h-10 w-full rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] pl-9 pr-3 text-sm outline-none focus:border-[var(--gbp-accent)]" />
        </label>
        <div className="mt-3 flex gap-2 sm:mt-0">
          <select value={action} onChange={(event) => setAction(event.target.value as ActionFilter)} aria-label="Filter by action" className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 text-sm sm:flex-none">
            <option value="all">All actions</option><option value="deleted">Deleted</option><option value="restored">Restored</option><option value="purged">Purged</option>
          </select>
          <select value={range} onChange={(event) => setRange(event.target.value as DateRange)} aria-label="Filter by date range" className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 text-sm sm:flex-none">
            <option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 365 days</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-sm">
        <div className="border-b border-[var(--gbp-border)] px-4 py-3 text-xs text-[var(--gbp-text2)]">Read-only record of deletion lifecycle activity. Outcomes are shown for every event.</div>
        <div className="hidden grid-cols-[minmax(0,1.7fr)_auto_minmax(140px,0.8fr)] items-center gap-3 border-b border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)] sm:grid">
          <span>Deleted item and actor</span>
          <span>Action and result</span>
          <span className="text-right">Date and source</span>
        </div>
        {visible.length === 0 ? <div className="p-10 text-center text-sm text-[var(--gbp-text2)]">No deletion activity matches these filters.</div> : (
          <div className="divide-y divide-[var(--gbp-border)]">
            {visible.map((log) => {
              const lifecycle = lifecycleAction(log.action)!;
              const outcome = outcomeLabel(log);
              const isSystemMaintenance = log.metadata?.system_maintenance === true;
              const historicalOrganization = typeof log.metadata?.entity_name === "string" && log.entity_type === "organization"
                ? log.metadata.entity_name
                : null;
              return <div key={log.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.7fr)_auto_minmax(140px,0.8fr)] sm:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{eventLabel(log)}</p><p className="mt-1 truncate text-xs text-[var(--gbp-text2)]">{isSystemMaintenance ? (typeof log.metadata?.task_label === "string" ? log.metadata.task_label : "System retention") : log.organization_name ?? historicalOrganization ?? "No organization"} · {log.actor_email ?? "System"}</p></div>
                <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${actionStyle(lifecycle)}`}>{lifecycle}</span><span className={`text-xs font-medium ${outcome.color}`}>{outcome.label}</span></div>
                <div className="text-xs text-[var(--gbp-text2)] sm:text-right"><time dateTime={log.created_at}>{format(new Date(log.created_at), "MMM d, yyyy h:mm a")}</time><p className="mt-1">{isSystemMaintenance ? "Daily cron" : log.action}</p></div>
              </div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function SuperadminTrashTabs({ documents, auditLogs }: Props) {
  const [tab, setTab] = useState<"documents" | "log">("documents");
  return <div>
    <div role="tablist" aria-label="Trash sections" className="mb-5 inline-flex rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-1 shadow-sm">
      <button role="tab" aria-selected={tab === "documents"} onClick={() => setTab("documents")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "documents" ? "bg-[var(--gbp-surface2)] text-[var(--gbp-text)] shadow-sm" : "text-[var(--gbp-text2)]"}`}><FileText className="h-4 w-4" />Documents trash</button>
      <button role="tab" aria-selected={tab === "log"} onClick={() => setTab("log")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "log" ? "bg-[var(--gbp-surface2)] text-[var(--gbp-text)] shadow-sm" : "text-[var(--gbp-text2)]"}`}><ShieldCheck className="h-4 w-4" />Deletion log</button>
    </div>
    {tab === "documents" ? <SuperadminDocumentTrashList documents={documents} /> : <DeletionLog logs={auditLogs} />}
  </div>;
}

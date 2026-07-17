"use client";

import { FormEvent, useDeferredValue, useState, useTransition } from "react";
import { format } from "date-fns";
import {
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  Search,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteLeadsAction,
  updateLeadAssigneeAction,
  updateLeadNotesAction,
  updateLeadStatusAction,
} from "./actions";

export type Assignee = {
  id: string;
  name: string;
};

export type LeadRow = {
  id: string;
  source: string;
  origin: string;
  status: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  companyName: string | null;
  assignedTo: string | null;
  notes: string | null;
  createdAt: string;
};

type LeadsTableProps = {
  leads: LeadRow[];
  assignees: Assignee[];
  currentUserId: string;
};

const STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

const CONTROL =
  "h-14 w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 text-sm text-[var(--gbp-text)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60";
const ROW_SELECT =
  "h-12 w-full appearance-none rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] py-2 pl-4 pr-10 text-sm text-[var(--gbp-text)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60";

function SelectChevron() {
  return <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gbp-text2)]" />;
}

export function LeadsTable({ leads, assignees, currentUserId }: LeadsTableProps) {
  const [rows, setRows] = useState(leads);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingLead, setEditingLead] = useState<LeadRow | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const originOptions = [...new Set(rows.map((lead) => lead.origin))].sort((a, b) => a.localeCompare(b));
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const visibleRows = rows.filter((lead) => {
    const matchesSearch = !normalizedSearch || [
      lead.contactName,
      lead.contactPhone ?? "",
      lead.contactEmail,
      lead.companyName ?? "",
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
    const matchesAssignee = assigneeFilter === "all"
      || (assigneeFilter === "unassigned" ? !lead.assignedTo : lead.assignedTo === assigneeFilter);
    return matchesSearch
      && matchesAssignee
      && (statusFilter === "all" || lead.status === statusFilter)
      && (originFilter === "all" || lead.origin === originFilter);
  });
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((lead) => selectedIds.has(lead.id));

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft);
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleRows.forEach((lead) => next.delete(lead.id));
      } else {
        visibleRows.forEach((lead) => next.add(lead.id));
      }
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateStatus(id: string, status: string) {
    startTransition(async () => {
      const result = await updateLeadStatusAction(id, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((current) => current.map((lead) => lead.id === id ? { ...lead, status } : lead));
      toast.success("Lead status updated");
    });
  }

  function updateAssignee(id: string, assignedTo: string | null) {
    startTransition(async () => {
      const result = await updateLeadAssigneeAction(id, assignedTo);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((current) => current.map((lead) => lead.id === id ? { ...lead, assignedTo } : lead));
      toast.success(assignedTo ? "Lead assigned" : "Lead unassigned");
    });
  }

  function openEditor(lead: LeadRow) {
    setEditingLead(lead);
    setEditingNotes(lead.notes ?? "");
  }

  function saveNotes() {
    if (!editingLead) return;
    const id = editingLead.id;
    startTransition(async () => {
      const result = await updateLeadNotesAction(id, editingNotes);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const notes = editingNotes.trim() || null;
      setRows((current) => current.map((lead) => lead.id === id ? { ...lead, notes } : lead));
      setEditingLead(null);
      toast.success("Lead notes saved");
    });
  }

  function removeLeads(ids: string[]) {
    const message = ids.length === 1
      ? "Delete this lead? This action cannot be undone."
      : `Delete ${ids.length} selected leads? This action cannot be undone.`;
    if (!window.confirm(message)) return;

    startTransition(async () => {
      const result = await deleteLeadsAction(ids);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const removed = new Set(ids);
      setRows((current) => current.filter((lead) => !removed.has(lead.id)));
      setSelectedIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      toast.success(ids.length === 1 ? "Lead deleted" : "Leads deleted");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={submitSearch}
        className="grid gap-3 rounded-[1.25rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(190px,1fr)_minmax(190px,1fr)_minmax(170px,1fr)_minmax(180px,1fr)_56px_56px]"
      >
        <input
          type="search"
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          placeholder="Filter"
          aria-label="Filter leads"
          className={CONTROL}
        />

        <div className="relative">
          <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className={`${CONTROL} appearance-none pr-11`} aria-label="Filter by assignee">
            <option value="all">Assigned to</option>
            <option value="unassigned">None</option>
            {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
          </select>
          <SelectChevron />
        </div>

        <div className="relative">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${CONTROL} appearance-none pr-11`} aria-label="Filter by status">
            <option value="all">Status</option>
            {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
          </select>
          <SelectChevron />
        </div>

        <div className="relative">
          <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)} className={`${CONTROL} appearance-none pr-11`} aria-label="Filter by origin">
            <option value="all">Origin</option>
            {originOptions.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
          </select>
          <SelectChevron />
        </div>

        <button
          type="button"
          onClick={() => removeLeads([...selectedIds])}
          disabled={isPending || selectedIds.size === 0}
          title={selectedIds.size ? `Delete ${selectedIds.size} selected` : "Select leads to delete"}
          className="relative inline-flex h-14 items-center justify-center rounded-xl bg-[#ff8267] text-white shadow-sm transition hover:bg-[#f17359] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending && selectedIds.size > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
          {selectedIds.size > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--gbp-text)] px-1 text-[10px] font-bold">{selectedIds.size}</span>}
        </button>
        <button type="submit" className="inline-flex h-14 items-center justify-center rounded-xl bg-[#5d7df4] text-white shadow-sm transition hover:bg-[#4d6fe9]" title="Search">
          <Search className="h-5 w-5" />
        </button>
      </form>

      <section className="overflow-hidden rounded-[1.25rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1420px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--gbp-border)] text-sm font-bold text-[var(--gbp-text)]">
                <th className="w-[90px] px-6 py-6">
                  <label className="inline-flex items-center gap-3">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 rounded border-[var(--gbp-border)] accent-[#5d7df4]" aria-label="Select all visible leads" />
                    <span>#</span>
                  </label>
                </th>
                <th className="min-w-[190px] px-4 py-6">Full Name</th>
                <th className="min-w-[160px] px-4 py-6">Phone</th>
                <th className="min-w-[250px] px-4 py-6">Email</th>
                <th className="min-w-[210px] px-4 py-6">Company Name</th>
                <th className="min-w-[205px] px-4 py-6">Assigned to</th>
                <th className="min-w-[180px] px-4 py-6">Status</th>
                <th className="min-w-[140px] px-4 py-6">Acquired on</th>
                <th className="min-w-[150px] px-4 py-6">Origin</th>
                <th className="min-w-[145px] px-4 py-6">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((lead, index) => (
                <tr key={lead.id} className="border-b border-[var(--gbp-border)] text-sm text-[var(--gbp-text)] transition last:border-0 hover:bg-[var(--gbp-surface2)]/60">
                  <td className="px-6 py-5">
                    <label className="inline-flex items-center gap-3">
                      <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelected(lead.id)} className="h-4 w-4 rounded border-[var(--gbp-border)] accent-[#5d7df4]" aria-label={`Select ${lead.contactName}`} />
                      <span>{index + 1}</span>
                    </label>
                  </td>
                  <td className="px-4 py-5 font-medium">{lead.contactName}</td>
                  <td className="px-4 py-5">
                    {lead.contactPhone ? <a href={`tel:${lead.contactPhone}`} className="hover:text-[#5d7df4]">{lead.contactPhone}</a> : <span className="text-[var(--gbp-text2)]">none</span>}
                  </td>
                  <td className="px-4 py-5"><a href={`mailto:${lead.contactEmail}`} className="hover:text-[#5d7df4]">{lead.contactEmail}</a></td>
                  <td className="px-4 py-5">{lead.companyName ?? <span className="text-[var(--gbp-text2)]">none</span>}</td>
                  <td className="px-4 py-5">
                    <div className="relative">
                      <select
                        value={lead.assignedTo ?? ""}
                        onChange={(event) => updateAssignee(lead.id, event.target.value || null)}
                        disabled={isPending}
                        className={ROW_SELECT}
                        aria-label={`Assign ${lead.contactName}`}
                      >
                        <option value="">none</option>
                        {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
                      </select>
                      <SelectChevron />
                    </div>
                  </td>
                  <td className="px-4 py-5">
                    <div className="relative">
                      <select value={lead.status} onChange={(event) => updateStatus(lead.id, event.target.value)} disabled={isPending} className={ROW_SELECT} aria-label={`Status for ${lead.contactName}`}>
                        {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                      </select>
                      <SelectChevron />
                    </div>
                  </td>
                  <td className="px-4 py-5 tabular-nums">{format(new Date(lead.createdAt), "MM/dd/yyyy")}</td>
                  <td className="px-4 py-5">{lead.origin}</td>
                  <td className="px-4 py-5">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateAssignee(lead.id, lead.assignedTo === currentUserId ? null : currentUserId)}
                        disabled={isPending}
                        className={`transition hover:text-[#5d7df4] disabled:opacity-40 ${lead.assignedTo === currentUserId ? "text-[var(--gbp-text)]" : "text-[var(--gbp-text2)]/60"}`}
                        title={lead.assignedTo === currentUserId ? "Unassign me" : "Assign to me"}
                      >
                        <UserRoundCheck className="h-5 w-5" />
                      </button>
                      <button type="button" onClick={() => openEditor(lead)} disabled={isPending} className="text-[var(--gbp-text)] transition hover:text-[#5d7df4] disabled:opacity-40" title="Edit notes">
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button type="button" onClick={() => removeLeads([lead.id])} disabled={isPending} className="text-[var(--gbp-text)] transition hover:text-[#ff8267] disabled:opacity-40" title="Delete lead">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {visibleRows.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 border-t border-[var(--gbp-border)] px-6 text-center">
            <Search className="h-8 w-8 text-[var(--gbp-text2)]/35" />
            <p className="text-sm font-semibold text-[var(--gbp-text)]">No leads found</p>
            <p className="text-xs text-[var(--gbp-text2)]">Try changing the search or filters.</p>
          </div>
        )}
      </section>

      {editingLead && (
        <div className="fixed inset-0 z-[1050] grid place-items-center bg-black/45 p-4" onClick={() => !isPending && setEditingLead(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="lead-editor-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-[var(--gbp-border)] px-6 py-5">
              <div>
                <h2 id="lead-editor-title" className="text-lg font-bold text-[var(--gbp-text)]">Edit lead</h2>
                <p className="mt-1 text-sm text-[var(--gbp-text2)]">{editingLead.contactName} · {editingLead.contactEmail}</p>
              </div>
              <button type="button" onClick={() => setEditingLead(null)} disabled={isPending} className="rounded-lg p-2 text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]" aria-label="Close editor">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              <label htmlFor="lead-notes" className="mb-2 block text-sm font-bold text-[var(--gbp-text)]">Notes</label>
              <textarea
                id="lead-notes"
                value={editingNotes}
                onChange={(event) => setEditingNotes(event.target.value)}
                rows={7}
                maxLength={10_000}
                disabled={isPending}
                placeholder="Add notes about this lead..."
                className="w-full resize-y rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-sm text-[var(--gbp-text)] outline-none transition placeholder:text-[var(--gbp-text2)]/70 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-[var(--gbp-border)] px-6 py-4">
              <button type="button" onClick={() => setEditingLead(null)} disabled={isPending} className="h-10 rounded-xl border border-[var(--gbp-border)] px-4 text-sm font-semibold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-surface2)] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={saveNotes} disabled={isPending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#5d7df4] px-4 text-sm font-bold text-white transition hover:bg-[#4d6fe9] disabled:opacity-50">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

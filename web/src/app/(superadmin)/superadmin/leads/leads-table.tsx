"use client";

import { useDeferredValue, useState, useTransition } from "react";
import { format, formatDistance } from "date-fns";
import { ChevronDown, Loader2, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addLeadNoteAction,
  deleteLeadsAction,
  updateLeadAssigneeAction,
  updateLeadFollowUpAction,
  updateLeadProfileAction,
  updateLeadsAssigneeAction,
  updateLeadsStatusAction,
  updateLeadStatusAction,
  type LeadProfileInput,
} from "./actions";

export type Assignee = { id: string; name: string };
export type LeadActivity = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string;
};

export type LeadRow = {
  id: string;
  source: string;
  origin: string;
  status: string;
  referrerName: string;
  referrerEmail: string;
  vendorName: string;
  vendorContact: string;
  vendorEmail: string;
  vendorPhone: string | null;
  assignedTo: string | null;
  createdAt: string;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  activity: LeadActivity[];
};

type LeadsTableProps = {
  leads: LeadRow[];
  assignees: Assignee[];
  currentUserName: string;
  renderedAt: number;
  today: string;
};

const STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};
const STATUS_CLASSES: Record<string, string> = {
  new: "bg-[#EAF1FF] text-[#2C5BD6]",
  contacted: "bg-[#FFF2E0] text-[#B7791F]",
  qualified: "bg-[#EDE9FE] text-[#6D46C7]",
  won: "bg-[#E6F6EC] text-[#1E874B]",
  lost: "bg-[#F1F2F5] text-[#8A909B]",
};
const PAGE_SIZE = 8;

function SelectChevron({ light = false }: { light?: boolean }) {
  return <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${light ? "text-white/65" : "text-[var(--gbp-text2)]"}`} />;
}

function isOverdue(value: string | null, today: string) {
  return Boolean(value && value < today);
}

function needsAttention(lead: LeadRow, today: string) {
  return !["won", "lost"].includes(lead.status) && (!lead.lastContactedAt || isOverdue(lead.nextFollowUpAt, today));
}

function profileFor(lead: LeadRow): LeadProfileInput {
  return {
    referrerName: lead.referrerName,
    referrerEmail: lead.referrerEmail,
    vendorName: lead.vendorName,
    vendorContact: lead.vendorContact,
    vendorEmail: lead.vendorEmail,
    vendorPhone: lead.vendorPhone ?? "",
  };
}

export function LeadsTable({ leads, assignees, currentUserName, renderedAt, today }: LeadsTableProps) {
  const [rows, setRows] = useState(leads);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [acquiredFilter, setAcquiredFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<LeadProfileInput | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const origins = [...new Set(rows.map((lead) => lead.origin))].sort((a, b) => a.localeCompare(b));
  const attentionCount = rows.filter((lead) => needsAttention(lead, today)).length;
  const visibleRows = rows.filter((lead) => {
    const matchesSearch = !normalizedSearch || [
      lead.referrerName,
      lead.referrerEmail,
      lead.vendorName,
      lead.vendorContact,
      lead.vendorEmail,
      lead.vendorPhone ?? "",
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
    const ageDays = Math.floor((renderedAt - new Date(lead.createdAt).getTime()) / 86_400_000);
    const matchesDate = acquiredFilter === "all"
      || (acquiredFilter === "today" ? ageDays <= 0 : ageDays <= Number(acquiredFilter));
    const matchesAssignee = assigneeFilter === "all"
      || (assigneeFilter === "unassigned" ? !lead.assignedTo : lead.assignedTo === assigneeFilter);
    return matchesSearch
      && matchesDate
      && matchesAssignee
      && (statusFilter === "all" || lead.status === statusFilter)
      && (originFilter === "all" || lead.origin === originFilter)
      && (!attentionOnly || needsAttention(lead, today));
  });
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const allPageSelected = pageRows.length > 0 && pageRows.every((lead) => selectedIds.has(lead.id));
  const openLead = rows.find((lead) => lead.id === openLeadId) ?? null;
  const hasFilters = Boolean(search || attentionOnly || acquiredFilter !== "all" || assigneeFilter !== "all" || statusFilter !== "all" || originFilter !== "all");

  function mutateLead(id: string, patch: Partial<LeadRow>) {
    setRows((current) => current.map((lead) => lead.id === id ? { ...lead, ...patch } : lead));
  }

  function updateStatus(id: string, status: string) {
    startTransition(async () => {
      const result = await updateLeadStatusAction(id, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      mutateLead(id, { status });
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
      mutateLead(id, { assignedTo });
      toast.success(assignedTo ? "Lead assigned" : "Lead unassigned");
    });
  }

  function runBulkStatus(status: string) {
    const ids = [...selectedIds];
    if (!status || !ids.length) return;
    startTransition(async () => {
      const result = await updateLeadsStatusAction(ids, status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const selected = new Set(ids);
      setRows((current) => current.map((lead) => selected.has(lead.id) ? { ...lead, status } : lead));
      setSelectedIds(new Set());
      toast.success("Selected leads updated");
    });
  }

  function runBulkAssignee(value: string) {
    const ids = [...selectedIds];
    if (!value || !ids.length) return;
    const assignedTo = value === "unassigned" ? null : value;
    startTransition(async () => {
      const result = await updateLeadsAssigneeAction(ids, assignedTo);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const selected = new Set(ids);
      setRows((current) => current.map((lead) => selected.has(lead.id) ? { ...lead, assignedTo } : lead));
      setSelectedIds(new Set());
      toast.success("Selected leads assigned");
    });
  }

  function removeSelected() {
    const ids = [...selectedIds];
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected lead${ids.length === 1 ? "" : "s"}? This action cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteLeadsAction(ids);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const selected = new Set(ids);
      setRows((current) => current.filter((lead) => !selected.has(lead.id)));
      setSelectedIds(new Set());
      if (openLeadId && selected.has(openLeadId)) setOpenLeadId(null);
      toast.success("Selected leads deleted");
    });
  }

  function openDrawer(lead: LeadRow) {
    setOpenLeadId(lead.id);
    setProfileDraft(profileFor(lead));
    setNoteDraft("");
  }

  function saveProfile() {
    if (!openLead || !profileDraft) return;
    startTransition(async () => {
      const result = await updateLeadProfileAction(openLead.id, profileDraft);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      mutateLead(openLead.id, {
        referrerName: profileDraft.referrerName.trim(),
        referrerEmail: profileDraft.referrerEmail.trim(),
        vendorName: profileDraft.vendorName.trim(),
        vendorContact: profileDraft.vendorContact.trim(),
        vendorEmail: profileDraft.vendorEmail.trim(),
        vendorPhone: profileDraft.vendorPhone.trim() || null,
      });
      toast.success("Referral details saved");
    });
  }

  function updateFollowUp(value: string | null) {
    if (!openLead) return;
    startTransition(async () => {
      const result = await updateLeadFollowUpAction(openLead.id, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      mutateLead(openLead.id, { nextFollowUpAt: value });
      toast.success(value ? "Follow-up scheduled" : "Follow-up cleared");
    });
  }

  function addNote() {
    if (!openLead || !noteDraft.trim()) return;
    const body = noteDraft.trim();
    startTransition(async () => {
      const result = await addLeadNoteAction(openLead.id, body);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const activity: LeadActivity = {
        ...result.note,
        authorName: currentUserName,
      };
      mutateLead(openLead.id, {
        activity: [activity, ...openLead.activity],
        lastContactedAt: activity.createdAt,
      });
      setNoteDraft("");
      toast.success("Activity added");
    });
  }

  function clearFilters() {
    setSearch("");
    setAcquiredFilter("all");
    setAssigneeFilter("all");
    setStatusFilter("all");
    setOriginFilter("all");
    setAttentionOnly(false);
    setPage(1);
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] pb-8">
      <header className="mb-5 flex flex-wrap items-baseline gap-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--gbp-accent)]">GetBackplate</span>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-[var(--gbp-text)]">Referral Leads</h1>
        <span className="rounded-full bg-[var(--gbp-surface2)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--gbp-text2)]">{rows.length} lead{rows.length === 1 ? "" : "s"}</span>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-2.5 rounded-[18px] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3.5">
        <label className="relative min-w-[210px] flex-1 basis-60">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gbp-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search name, email, company…"
            className="h-11 w-full rounded-[11px] border border-transparent bg-[var(--gbp-bg)] pl-10 pr-3 text-sm text-[var(--gbp-text)] outline-none transition focus:border-[var(--gbp-accent)] focus:bg-[var(--gbp-surface)]"
          />
        </label>
        <button
          type="button"
          onClick={() => { setAttentionOnly((value) => !value); setPage(1); }}
          className={`inline-flex h-11 items-center gap-2 rounded-[11px] border px-3.5 text-[13px] font-semibold transition ${attentionOnly ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]" : "border-transparent bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:border-[var(--gbp-border2)]"}`}
        >
          <span className={`h-2 w-2 rounded-full ${attentionOnly ? "bg-[var(--gbp-accent)]" : "bg-[var(--gbp-muted)]"}`} />
          Needs attention
          <span className="rounded-full bg-black/[.06] px-2 py-0.5 font-mono text-[11px]">{attentionCount}</span>
        </button>
        <FilterSelect value={acquiredFilter} onChange={(value) => { setAcquiredFilter(value); setPage(1); }} label="Any date" options={[["today", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"]]} />
        <FilterSelect value={assigneeFilter} onChange={(value) => { setAssigneeFilter(value); setPage(1); }} label="Assigned to" options={[["unassigned", "Unassigned"], ...assignees.map((assignee) => [assignee.id, assignee.name] as [string, string])]} />
        <FilterSelect value={statusFilter} onChange={(value) => { setStatusFilter(value); setPage(1); }} label="Status" options={STATUSES.map((status) => [status, STATUS_LABELS[status]])} />
        <FilterSelect value={originFilter} onChange={(value) => { setOriginFilter(value); setPage(1); }} label="Origin" options={origins.map((origin) => [origin, origin])} />
        {hasFilters && <button type="button" onClick={clearFilters} className="px-1.5 text-[13px] font-semibold text-[var(--gbp-accent)]">Clear filters</button>}
      </section>

      {selectedIds.size > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[14px] bg-[var(--gbp-text)] px-4 py-3 text-white">
          <span className="text-sm font-bold">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <BulkSelect label="Assign to…" disabled={isPending} onChange={runBulkAssignee} options={[["unassigned", "Unassigned"], ...assignees.map((assignee) => [assignee.id, assignee.name] as [string, string])]} />
          <BulkSelect label="Set status…" disabled={isPending} onChange={runBulkStatus} options={STATUSES.map((status) => [status, STATUS_LABELS[status]])} />
          <button type="button" disabled={isPending} onClick={removeSelected} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--gbp-accent)] px-3.5 text-[13px] font-semibold text-white disabled:opacity-50">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-[18px] border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--gbp-border)] text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--gbp-muted)]">
                <th className="w-11 px-4 py-4"><input type="checkbox" checked={allPageSelected} onChange={() => setSelectedIds((current) => {
                  const next = new Set(current);
                  pageRows.forEach((lead) => allPageSelected ? next.delete(lead.id) : next.add(lead.id));
                  return next;
                })} className="h-[17px] w-[17px] accent-[var(--gbp-accent)]" aria-label="Select all visible leads" /></th>
                <th className="w-[76px] px-4 py-4">Acquired</th>
                <th className="px-4 py-4">Referred by</th>
                <th className="px-4 py-4">Vendor referred</th>
                <th className="w-[150px] px-4 py-4">Assigned to</th>
                <th className="w-[150px] px-4 py-4">Status</th>
                <th className="px-4 py-4">Follow-up</th>
                <th className="px-4 py-4">Origin</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((lead) => {
                const active = !["won", "lost"].includes(lead.status);
                return (
                  <tr
                    key={lead.id}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("input,select,button,a")) return;
                      openDrawer(lead);
                    }}
                    className={`cursor-pointer border-b border-[var(--gbp-border)] text-sm transition last:border-0 hover:bg-[#FBFBFE] ${selectedIds.has(lead.id) ? "bg-[var(--gbp-accent-glow)]" : ""}`}
                  >
                    <td className="px-4 py-4"><input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(lead.id)) next.delete(lead.id);
                      else next.add(lead.id);
                      return next;
                    })} className="h-[17px] w-[17px] accent-[var(--gbp-accent)]" aria-label={`Select ${lead.vendorName}`} /></td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-[var(--gbp-muted)]">{format(new Date(lead.createdAt), "MMM d")}</td>
                    <td className="px-4 py-4"><p className="font-bold text-[var(--gbp-text)]">{lead.referrerName}</p><p className="mt-0.5 font-mono text-[11px] text-[var(--gbp-text2)]">{lead.referrerEmail || "—"}</p></td>
                    <td className="px-4 py-4"><p className="font-bold text-[var(--gbp-text)]">{lead.vendorName}</p><p className="mt-0.5 text-xs text-[var(--gbp-text2)]">{lead.vendorContact}{lead.vendorContact && lead.vendorEmail ? " · " : ""}<span className="font-mono text-[11px]">{lead.vendorEmail}</span></p></td>
                    <td className="px-4 py-4"><RowSelect value={lead.assignedTo ?? ""} onChange={(value) => updateAssignee(lead.id, value || null)} disabled={isPending} emptyLabel="Unassigned" options={assignees.map((assignee) => [assignee.id, assignee.name])} /></td>
                    <td className="px-4 py-4"><RowSelect value={lead.status} onChange={(value) => updateStatus(lead.id, value)} disabled={isPending} options={STATUSES.map((status) => [status, STATUS_LABELS[status]])} className={STATUS_CLASSES[lead.status]} /></td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {!active ? <span className="text-[var(--gbp-muted)]">—</span> : <>
                        <p className={`text-[13px] ${!lead.lastContactedAt ? "font-semibold text-[var(--gbp-accent)]" : "text-[var(--gbp-text2)]"}`}>{lead.lastContactedAt ? `${format(new Date(lead.lastContactedAt), "MMM d")} · ${formatDistance(new Date(lead.lastContactedAt), new Date(renderedAt), { addSuffix: true })}` : "Never contacted"}</p>
                        <p className={`mt-0.5 text-[11px] ${isOverdue(lead.nextFollowUpAt, today) ? "font-semibold text-[var(--gbp-accent)]" : lead.nextFollowUpAt ? "text-[var(--gbp-muted)]" : "italic text-[var(--gbp-muted)]"}`}>{lead.nextFollowUpAt ? `${isOverdue(lead.nextFollowUpAt, today) ? "Next: overdue" : "Next"} (${format(new Date(`${lead.nextFollowUpAt}T00:00:00`), "MMM d")})` : "No follow-up set"}</p>
                      </>}
                    </td>
                    <td className="px-4 py-4"><span className="inline-block rounded-lg bg-[var(--gbp-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--gbp-text2)]">{lead.origin}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!pageRows.length && <div className="px-5 py-12 text-center text-sm text-[var(--gbp-text2)]">No leads match your filters.</div>}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3.5 text-[13px] text-[var(--gbp-text2)]">
        <span>{visibleRows.length ? `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, visibleRows.length)} of ${visibleRows.length}` : "No results"}</span>
        {totalPages > 1 && <div className="flex gap-1.5">
          <PageButton label="‹" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} />
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => <PageButton key={value} label={String(value)} active={value === currentPage} onClick={() => setPage(value)} />)}
          <PageButton label="›" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} />
        </div>}
      </footer>

      {openLead && profileDraft && <>
        <button type="button" aria-label="Close lead details" onClick={() => setOpenLeadId(null)} className="fixed inset-0 z-[1200] bg-black/40" />
        <aside className="fixed inset-y-0 right-0 z-[1210] flex w-[440px] max-w-[92vw] flex-col bg-[var(--gbp-surface)] shadow-[-20px_0_60px_-30px_rgba(0,0,0,.4)]">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--gbp-border)] px-6 py-5">
            <div><h2 className="text-lg font-extrabold text-[var(--gbp-text)]">{openLead.vendorName}</h2><p className="mt-1 text-xs text-[var(--gbp-text2)]">Referred by {openLead.referrerName} · {openLead.origin}</p></div>
            <button type="button" onClick={() => setOpenLeadId(null)} className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"><X className="h-4 w-4" /></button>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <DrawerSection label="Referred by"><ProfileInput label="Name" value={profileDraft.referrerName} onChange={(value) => setProfileDraft({ ...profileDraft, referrerName: value })} /><ProfileInput label="Email" type="email" value={profileDraft.referrerEmail} onChange={(value) => setProfileDraft({ ...profileDraft, referrerEmail: value })} /></DrawerSection>
            <DrawerSection label="Vendor referred"><ProfileInput label="Company" value={profileDraft.vendorName} onChange={(value) => setProfileDraft({ ...profileDraft, vendorName: value })} /><ProfileInput label="Contact" value={profileDraft.vendorContact} onChange={(value) => setProfileDraft({ ...profileDraft, vendorContact: value })} /><ProfileInput label="Email" type="email" value={profileDraft.vendorEmail} onChange={(value) => setProfileDraft({ ...profileDraft, vendorEmail: value })} /><ProfileInput label="Phone" type="tel" value={profileDraft.vendorPhone} onChange={(value) => setProfileDraft({ ...profileDraft, vendorPhone: value })} /><button type="button" disabled={isPending} onClick={saveProfile} className="mt-1 h-9 rounded-lg bg-[var(--gbp-accent)] px-3.5 text-xs font-bold text-white disabled:opacity-50">Save details</button></DrawerSection>
            <DrawerSection label="Lead"><div className="rounded-xl bg-[var(--gbp-bg)] px-4 py-3 text-[13px]"><MetaRow label="Status" value={STATUS_LABELS[openLead.status] ?? openLead.status} /><MetaRow label="Assigned to" value={assignees.find((assignee) => assignee.id === openLead.assignedTo)?.name ?? "Unassigned"} /><MetaRow label="Acquired" value={format(new Date(openLead.createdAt), "MM/dd/yyyy")} /><MetaRow label="Last contact" value={openLead.lastContactedAt ? format(new Date(openLead.lastContactedAt), "MM/dd/yyyy") : "Not yet contacted"} /></div></DrawerSection>
            <DrawerSection label="Next follow-up"><div className="flex gap-2"><input type="date" value={openLead.nextFollowUpAt ?? ""} onChange={(event) => updateFollowUp(event.target.value || null)} className="h-10 flex-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm outline-none focus:border-[var(--gbp-accent)]" /><button type="button" onClick={() => updateFollowUp(null)} className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-xs font-semibold text-[var(--gbp-text2)]">Clear</button></div></DrawerSection>
            <DrawerSection label="Notes & activity">
              <div className="mb-3 flex flex-col gap-2.5">{openLead.activity.length ? openLead.activity.map((note) => <div key={note.id} className="rounded-[10px] bg-[var(--gbp-bg)] px-3.5 py-3"><p className="text-[13px] leading-relaxed text-[var(--gbp-text2)]">{note.body}</p><p className="mt-1.5 font-mono text-[10px] text-[var(--gbp-muted)]">{note.authorName} · {formatDistance(new Date(note.createdAt), new Date(renderedAt), { addSuffix: true })}</p></div>) : <p className="text-xs italic text-[var(--gbp-muted)]">No notes yet.</p>}</div>
              <div className="flex gap-2"><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Log a call, email, or next step…" rows={2} className="min-h-11 flex-1 resize-y rounded-[10px] border border-[var(--gbp-border)] px-3 py-2 text-[13px] outline-none focus:border-[var(--gbp-accent)]" /><button type="button" disabled={isPending || !noteDraft.trim()} onClick={addNote} className="self-stretch rounded-[10px] bg-[var(--gbp-accent)] px-4 text-xs font-bold text-white disabled:opacity-50">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</button></div>
            </DrawerSection>
          </div>
        </aside>
      </>}
    </div>
  );
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: ReadonlyArray<readonly [string, string]> }) {
  return <div className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 min-w-[140px] appearance-none rounded-[11px] border border-transparent bg-[var(--gbp-bg)] pl-3 pr-9 text-sm text-[var(--gbp-text2)] outline-none focus:border-[var(--gbp-accent)]"><option value="all">{label}</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select><SelectChevron /></div>;
}

function BulkSelect({ label, options, onChange, disabled }: { label: string; options: ReadonlyArray<readonly [string, string]>; onChange: (value: string) => void; disabled: boolean }) {
  return <div className="relative"><select value="" disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-[135px] appearance-none rounded-lg border border-white/20 bg-white/10 pl-3 pr-8 text-xs text-white outline-none disabled:opacity-50"><option value="" className="text-black">{label}</option>{options.map(([key, text]) => <option key={key} value={key} className="text-black">{text}</option>)}</select><SelectChevron light /></div>;
}

function RowSelect({ value, onChange, options, emptyLabel, disabled, className = "bg-[var(--gbp-bg)] text-[var(--gbp-text2)]" }: { value: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]>; emptyLabel?: string; disabled: boolean; className?: string }) {
  return <div className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={`h-9 w-full appearance-none rounded-lg border border-transparent py-1.5 pl-2.5 pr-7 text-xs font-semibold outline-none focus:border-[var(--gbp-accent)] disabled:opacity-60 ${className}`}>{emptyLabel && <option value="">{emptyLabel}</option>}{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" /></div>;
}

function PageButton({ label, onClick, disabled = false, active = false }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`h-9 min-w-9 rounded-lg border px-2 text-xs font-semibold disabled:opacity-40 ${active ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)] text-white" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)]"}`}>{label}</button>;
}

function DrawerSection({ label, children }: { label: string; children: React.ReactNode }) {
  return <section className="mb-6"><p className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gbp-muted)]">{label}</p>{children}</section>;
}

function ProfileInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="mb-2.5 block"><span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2.5 text-[13px] outline-none focus:border-[var(--gbp-accent)] focus:ring-2 focus:ring-[var(--gbp-accent-glow)]" /></label>;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 py-1"><span className="text-[var(--gbp-text2)]">{label}</span><span className="text-right font-semibold text-[var(--gbp-text)]">{value}</span></div>;
}

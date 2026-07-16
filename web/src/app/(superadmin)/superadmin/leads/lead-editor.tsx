"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { updateLeadAction } from "./actions";

const STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;

export function LeadEditor({ id, initialStatus, initialNotes }: {
  id: string;
  initialStatus: string;
  initialNotes: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateLeadAction(id, status, notes);
      } catch {
        setError("Unable to save lead changes.");
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:min-w-[260px]">
      <div className="flex gap-2">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={isPending}
          className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2 text-xs font-semibold capitalize text-[var(--gbp-text)]"
          aria-label="Lead status"
        >
          {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        disabled={isPending}
        placeholder="Add notes..."
        rows={2}
        className="w-full resize-y rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs text-[var(--gbp-text)] placeholder:text-[var(--gbp-text2)]"
      />
      {error && <p className="text-xs text-[var(--gbp-error)]">{error}</p>}
    </div>
  );
}

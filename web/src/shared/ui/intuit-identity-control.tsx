"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type IdentityStatus = { linked: boolean; email: string | null; canUnlink: boolean };

export function IntuitIdentityControl({ isDarkTheme }: { isDarkTheme: boolean }) {
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/intuit/identity", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (active) setStatus(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function unlink() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/intuit/identity", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to unlink Intuit.");
      setStatus({ linked: false, email: null, canUnlink: false });
      toast.success("Intuit account unlinked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to unlink Intuit.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className={`flex items-center justify-between border-b py-1.5 ${isDarkTheme ? "border-white/5" : "border-[var(--gbp-border)]"}`}>
      <div className="min-w-0">
        <span className={isDarkTheme ? "text-white/55" : "text-[var(--gbp-text2)]"}>Intuit login</span>
        {status.linked && status.email ? <p className="max-w-[150px] truncate text-[10px] text-[var(--gbp-muted)]">{status.email}</p> : null}
      </div>
      {status.linked ? (
        status.canUnlink ? (
          <button type="button" disabled={busy} onClick={unlink} className="rounded-md border border-red-400/35 px-2 py-1 text-[10px] font-semibold text-red-500 disabled:opacity-50">Unlink</button>
        ) : (
          <button type="button" onClick={() => window.location.assign("/auth/change-password?next=%2Fapp%2Fdashboard")} className="rounded-md border border-[var(--gbp-accent)]/35 px-2 py-1 text-[10px] font-semibold text-[var(--gbp-accent)]">Set password first</button>
        )
      ) : (
        <a href="/api/auth/intuit/start?mode=link&returnTo=%2Fapp%2Fdashboard" className="rounded-md border border-[var(--gbp-accent)]/35 bg-[var(--gbp-accent-glow)] px-2 py-1 text-[10px] font-semibold text-[var(--gbp-accent)]">Link</a>
      )}
    </div>
  );
}

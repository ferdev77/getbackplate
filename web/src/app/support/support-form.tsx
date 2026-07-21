"use client";

import { FormEvent, useState } from "react";
import type { AuthenticatedSupportIdentity } from "@/modules/support/support-request";

export function SupportForm({
  identity,
  identityBlocked,
}: {
  identity: AuthenticatedSupportIdentity | null;
  identityBlocked: boolean;
}) {
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "success" | "error"; message?: string }>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setStatus({ kind: "sending" });
    const form = new FormData(formElement);
    const response = await fetch("/api/support-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) as { error?: string; reference?: string } : {};

    if (!response?.ok) {
      setStatus({ kind: "error", message: result.error || "Unable to submit your request." });
      return;
    }

    formElement.reset();
    setStatus({ kind: "success", message: result.reference ? `Request received. Reference: ${result.reference}` : "Request received." });
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100";
  const identityInputClass = `${inputClass} read-only:cursor-not-allowed read-only:border-slate-200 read-only:bg-slate-100 read-only:text-slate-600`;

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      {identity && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-bold">Authenticated company session</p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">Your account and active company were verified by GetBackplate. These identity fields cannot be changed here.</p>
        </div>
      )}
      {identityBlocked && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">Select an active company to continue</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">Your session is authenticated, but no active Company Admin context could be verified. Return to the app, select the correct company, and reopen this form.</p>
        </div>
      )}
      {identity && (
        <>
          <input type="hidden" name="identityOrganizationId" value={identity.organizationId} />
          <input type="hidden" name="identityUserId" value={identity.userId} />
        </>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-800">Request type
          <select name="requestType" required className={inputClass} defaultValue="support">
            <option value="support">Product support</option>
            <option value="access">Data access</option>
            <option value="correction">Data correction</option>
            <option value="export">Data export</option>
            <option value="deletion">Data deletion</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-800">Name
          <input name="name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={identity?.name ?? ""} readOnly={Boolean(identity)} className={identityInputClass} />
        </label>
        <label className="text-sm font-semibold text-slate-800">Email
          <input name="email" required type="email" maxLength={254} autoComplete="email" defaultValue={identity?.email ?? ""} readOnly={Boolean(identity)} className={identityInputClass} />
        </label>
        <label className="text-sm font-semibold text-slate-800">Company {!identity && <span className="font-normal text-slate-500">(optional)</span>}
          <input name="company" maxLength={160} autoComplete="organization" defaultValue={identity?.company ?? ""} readOnly={Boolean(identity)} className={identityInputClass} />
        </label>
      </div>
      <label className="mt-5 block text-sm font-semibold text-slate-800">How can we help?
        <textarea name="details" required minLength={10} maxLength={5000} rows={7} className={inputClass} />
      </label>
      <div className="absolute -left-[10000px]" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">For privacy requests, we will verify your identity and authority before disclosing or deleting data. Legally required fiscal and billing records may be retained for up to seven years.</p>
      <button type="submit" disabled={identityBlocked || status.kind === "sending"} className="mt-5 rounded-lg bg-[#d4531a] px-5 py-3 text-sm font-bold text-white hover:bg-[#b94313] disabled:opacity-60">
        {status.kind === "sending" ? "Submitting..." : "Submit request"}
      </button>
      {status.kind === "success" && <p className="mt-4 text-sm font-semibold text-emerald-700">{status.message}</p>}
      {status.kind === "error" && <p className="mt-4 text-sm font-semibold text-red-700">{status.message}</p>}
    </form>
  );
}

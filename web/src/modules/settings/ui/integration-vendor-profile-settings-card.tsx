"use client";

import { Building2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type VendorProfile = { company: string; contactName: string; email: string; phone: string; address: string; website: string };

export function IntegrationVendorProfileSettingsCard({ initialProfile }: { initialProfile: Partial<VendorProfile> | null }) {
  const router = useRouter();
  const [profile, setProfile] = useState<VendorProfile>({
    company: initialProfile?.company ?? "", contactName: initialProfile?.contactName ?? "", email: initialProfile?.email ?? "",
    phone: initialProfile?.phone ?? "", address: initialProfile?.address ?? "", website: initialProfile?.website ?? "",
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setSaving(true); setNotice(null);
    const response = await fetch("/api/company/settings/integration-vendor-profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setSaving(false);
    if (!response.ok) { setNotice(data.error ?? "Could not save the vendor profile."); return; }
    setEditing(false); setNotice("Vendor profile saved."); router.refresh();
  }

  const fields: Array<[keyof VendorProfile, string, string]> = [
    ["company", "Company", "Company name"], ["contactName", "Contact name", "First Last"], ["email", "Email", "ops@company.com"],
    ["phone", "Phone", "+1 555 0000"], ["website", "Website", "company.com"], ["address", "Address", "Street, City, State"],
  ];

  return <article className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5">
    <div className="mb-3 flex items-start justify-between gap-3"><div><p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--gbp-text2)]"><Building2 className="h-3.5 w-3.5" /> QuickBooks® Online vendor profile</p><p className="mt-1 text-sm text-[var(--gbp-text2)]">Used as the vendor identity for invoices delivered to R365.</p></div><button type="button" onClick={() => editing ? void save() : setEditing(true)} disabled={saving} className="rounded-lg bg-[var(--gbp-accent)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? "Saving..." : editing ? "Save" : "Edit"}</button></div>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label, placeholder]) => <label key={key} className={`grid gap-1 text-xs font-semibold text-[var(--gbp-text2)] ${key === "address" || key === "company" ? "sm:col-span-2" : ""}`}>{label}<input type={key === "email" ? "email" : "text"} value={profile[key]} onChange={(event) => setProfile((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} disabled={!editing || saving} className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] disabled:cursor-not-allowed disabled:bg-[var(--gbp-bg)] disabled:text-[var(--gbp-muted)]" /></label>)}</div>
    {notice && <p className="mt-3 text-xs text-[var(--gbp-text2)]">{notice}</p>}
  </article>;
}

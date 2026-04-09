"use client";

import { useMemo, useState } from "react";

type CustomDomainRow = {
  id: string;
  domain: string;
  status: string;
  statusLabel: string;
  is_primary: boolean;
  dns_target: string | null;
  verification_error: string | null;
  verified_at: string | null;
  activated_at: string | null;
  last_checked_at: string | null;
};

type CustomDomainSettingsCardProps = {
  enabled: boolean;
  initialRows: CustomDomainRow[];
  defaultCnameTarget: string;
};

function statusClass(status: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "verifying_ssl") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "error") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-neutral-200 bg-neutral-100 text-neutral-600";
}

export function CustomDomainSettingsCard({
  enabled,
  initialRows,
  defaultCnameTarget,
}: CustomDomainSettingsCardProps) {
  const [domainInput, setDomainInput] = useState("");
  const [rows, setRows] = useState<CustomDomainRow[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const primaryRow = useMemo(() => rows.find((row) => row.is_primary) ?? null, [rows]);

  async function refreshRows() {
    const response = await fetch("/api/company/custom-domains", { method: "GET", cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; rows?: CustomDomainRow[]; error?: string }
      | null;

    if (!response.ok || !payload?.ok || !Array.isArray(payload.rows)) {
      return;
    }

    setRows(payload.rows);
  }

  async function createDomain() {
    if (!domainInput.trim() || saving) return;
    setSaving(true);
    setNotice(null);

    const response = await fetch("/api/company/custom-domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domainInput.trim() }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setSaving(false);
      setNotice({ tone: "error", message: payload?.error ?? "No se pudo guardar el dominio" });
      return;
    }

    setDomainInput("");
    await refreshRows();
    setSaving(false);
    setNotice({ tone: "success", message: "Dominio guardado. Revisa estado de DNS/SSL." });
  }

  async function recheckDomain(domain: string) {
    if (saving) return;
    setSaving(true);
    setNotice(null);

    const response = await fetch("/api/company/custom-domains/recheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setSaving(false);
      setNotice({ tone: "error", message: payload?.error ?? "No se pudo revalidar" });
      return;
    }

    await refreshRows();
    setSaving(false);
    setNotice({ tone: "success", message: "Estado actualizado" });
  }

  async function setPrimary(domain: string) {
    if (saving) return;
    setSaving(true);
    setNotice(null);

    const response = await fetch("/api/company/custom-domains/set-primary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setSaving(false);
      setNotice({ tone: "error", message: payload?.error ?? "No se pudo cambiar dominio principal" });
      return;
    }

    await refreshRows();
    setSaving(false);
    setNotice({ tone: "success", message: "Dominio principal actualizado" });
  }

  async function removeDomain(domain: string) {
    if (saving) return;
    setSaving(true);
    setNotice(null);

    const response = await fetch(`/api/company/custom-domains?domain=${encodeURIComponent(domain)}`, {
      method: "DELETE",
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setSaving(false);
      setNotice({ tone: "error", message: payload?.error ?? "No se pudo eliminar dominio" });
      return;
    }

    await refreshRows();
    setSaving(false);
    setNotice({ tone: "success", message: "Dominio eliminado" });
  }

  return (
    <article className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5">
      <p className="mb-1 text-sm font-semibold text-[var(--gbp-text)]">Dominio personalizado</p>
      <p className="text-xs text-[var(--gbp-text2)]">
        Configura tu acceso como <strong>app.tuempresa.com</strong>.
      </p>

      {enabled ? (
        <>
          <div className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3 text-xs text-[var(--gbp-text2)]">
            <p className="font-semibold text-[var(--gbp-text)]">Registro DNS requerido</p>
            <p className="mt-1">Tipo: CNAME</p>
            <p>Host/Name: app</p>
            <p>Destino/Value: {primaryRow?.dns_target || defaultCnameTarget}</p>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={domainInput}
              onChange={(event) => setDomainInput(event.target.value)}
              placeholder="app.nombreempresa.com"
              className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]"
            />
            <button
              type="button"
              onClick={() => void createDomain()}
              disabled={saving}
              className="rounded-lg bg-[var(--gbp-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--gbp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Guardando..." : "Guardar dominio"}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--gbp-text)]">{row.domain}</p>
                    <p className="text-xs text-[var(--gbp-text2)]">
                      {row.is_primary ? "Dominio principal" : "Dominio secundario"}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(row.status)}`}>
                    {row.statusLabel}
                  </span>
                </div>

                {row.verification_error ? (
                  <p className="mt-2 text-xs text-rose-700">{row.verification_error}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void recheckDomain(row.domain)}
                    disabled={saving}
                    className="rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] disabled:opacity-60"
                  >
                    Revalidar
                  </button>
                  {!row.is_primary ? (
                    <button
                      type="button"
                      onClick={() => void setPrimary(row.domain)}
                      disabled={saving || row.status !== "active"}
                      className="rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] disabled:opacity-60"
                    >
                      Activar como principal
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void removeDomain(row.domain)}
                    disabled={saving}
                    className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}

            {!rows.length ? (
              <p className="text-xs text-[var(--gbp-text2)]">
                Aun no hay dominios configurados.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3 text-xs text-[var(--gbp-text2)]">
          El modulo <strong>Custom Branding</strong> debe estar activo para usar dominio personalizado.
        </div>
      )}

      {notice ? (
        <p className={`mt-3 text-xs font-semibold ${notice.tone === "success" ? "text-emerald-700" : "text-rose-700"}`}>
          {notice.message}
        </p>
      ) : null}
    </article>
  );
}

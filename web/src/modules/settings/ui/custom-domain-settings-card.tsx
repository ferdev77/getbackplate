"use client";

import { CheckCircle2, CircleAlert, Copy, Globe2, Plus, RefreshCw, Star, Trash2, AlertTriangle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type NoticeState = { tone: "success" | "error"; message: string } | null;

function statusClass(status: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "verifying_ssl") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "error") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-neutral-200 bg-neutral-100 text-neutral-600";
}

function formatLastChecked(value: string | null) {
  if (!value) return "Sin verificacion reciente";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin verificacion reciente";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

type ConfirmModalProps = {
  domain: string;
  isPrimary: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmDeleteModal({ domain, isPrimary, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-[0_20px_60px_rgba(0,0,0,.25)]">
        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 rounded-md p-1 text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50">
          <AlertTriangle className="h-5 w-5 text-rose-600" />
        </div>

        <h2 id="confirm-delete-title" className="text-base font-bold text-[var(--gbp-text)]">
          Eliminar dominio
        </h2>
        <p className="mt-1 text-sm text-[var(--gbp-text2)]">
          ¿Estás seguro que querés eliminar{" "}
          <strong className="text-[var(--gbp-text)]">{domain}</strong>?
        </p>

        {isPrimary && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>Este es tu dominio principal.</strong> Al eliminarlo, se desactiva el acceso por
            dominio personalizado hasta que cargues uno nuevo.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CustomDomainSettingsCard({
  enabled,
  initialRows,
  defaultCnameTarget,
}: CustomDomainSettingsCardProps) {
  const [domainInput, setDomainInput] = useState("");
  const [rows, setRows] = useState<CustomDomainRow[]>(initialRows);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomDomainRow | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Throttle: one recheck per domain every 10 seconds.
  const recheckCooldowns = useRef<Record<string, boolean>>({});
  const recheckTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});

  const primaryRow = useMemo(() => rows.find((row) => row.is_primary) ?? null, [rows]);
  const dnsTarget = primaryRow?.dns_target || defaultCnameTarget;
  const hasRows = rows.length > 0;
  const hasConnectedDomain = rows.some(
    (row) => row.status === "active" || row.status === "verifying_ssl",
  );
  const showDomainCreateForm = !hasRows;
  const showDnsInstructions = !hasRows || !hasConnectedDomain;

  // Auto-dismiss notice after 5 s
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    const timers = recheckTimers.current;

    return () => {
      for (const domain of Object.keys(timers)) {
        const timer = timers[domain];
        if (timer) {
          clearTimeout(timer);
        }
      }
    };
  }, []);

  function isBusy(action: string) {
    return pendingAction === action;
  }

  const showNotice = useCallback((tone: "success" | "error", message: string) => {
    setNotice({ tone, message });
  }, []);

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showNotice("success", `${label} copiado`);
    } catch {
      showNotice("error", `No se pudo copiar ${label.toLowerCase()}`);
    }
  }

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
    if (!domainInput.trim() || pendingAction) return;
    setPendingAction("create");
    setNotice(null);

    const response = await fetch("/api/company/custom-domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domainInput.trim() }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setPendingAction(null);
      showNotice("error", payload?.error ?? "No se pudo guardar el dominio");
      return;
    }

    setDomainInput("");
    await refreshRows();
    setPendingAction(null);
    showNotice("success", "Dominio guardado. Revisa estado de DNS/SSL.");
  }

  async function recheckDomain(domain: string) {
    if (pendingAction) return;

    if (recheckCooldowns.current[domain]) {
      showNotice("error", "Espera 10s antes de revalidar este dominio de nuevo.");
      return;
    }

    recheckCooldowns.current[domain] = true;
    const existingTimer = recheckTimers.current[domain];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    recheckTimers.current[domain] = setTimeout(() => {
      delete recheckCooldowns.current[domain];
      delete recheckTimers.current[domain];
    }, 10_000);

    setPendingAction(`recheck:${domain}`);
    setNotice(null);

    const response = await fetch("/api/company/custom-domains/recheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setPendingAction(null);
      showNotice("error", payload?.error ?? "No se pudo revalidar");
      return;
    }

    await refreshRows();
    setPendingAction(null);
    showNotice("success", "Estado actualizado");
  }

  async function setPrimary(domain: string) {
    if (pendingAction) return;
    setPendingAction(`primary:${domain}`);
    setNotice(null);

    const response = await fetch("/api/company/custom-domains/set-primary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setPendingAction(null);
      showNotice("error", payload?.error ?? "No se pudo cambiar dominio principal");
      return;
    }

    await refreshRows();
    setPendingAction(null);
    showNotice("success", "Dominio principal actualizado");
  }

  function promptDelete(row: CustomDomainRow) {
    setConfirmDelete(row);
  }

  async function confirmAndRemove() {
    const row = confirmDelete;
    setConfirmDelete(null);
    if (!row) return;
    await removeDomain(row.domain);
  }

  async function removeDomain(domain: string) {
    if (pendingAction) return;
    setPendingAction(`delete:${domain}`);
    setNotice(null);

    const response = await fetch(`/api/company/custom-domains?domain=${encodeURIComponent(domain)}`, {
      method: "DELETE",
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setPendingAction(null);
      showNotice("error", payload?.error ?? "No se pudo eliminar dominio");
      return;
    }

    await refreshRows();
    setPendingAction(null);
    showNotice("success", "Dominio eliminado");
  }

  return (
    <>
      {confirmDelete ? (
        <ConfirmDeleteModal
          domain={confirmDelete.domain}
          isPrimary={confirmDelete.is_primary}
          onConfirm={() => void confirmAndRemove()}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}

      <article className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5">
        <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[var(--gbp-text2)] uppercase">
          <Globe2 className="h-3.5 w-3.5" /> Custom URL
        </p>
        <p className="text-base font-semibold text-[var(--gbp-text)]">Dominio personalizado</p>
        <p className="mt-1 text-sm text-[var(--gbp-text2)]">
          Publica tu acceso con identidad de marca: <strong>app.tuempresa.com</strong>
        </p>

        {enabled ? (
          <>
            {showDnsInstructions ? (
              <div className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[linear-gradient(160deg,var(--gbp-bg)_0%,var(--gbp-surface)_100%)] p-4 text-xs text-[var(--gbp-text2)]">
                <p className="font-semibold text-[var(--gbp-text)]">Configuracion DNS</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-2.5">
                    <p className="text-[10px] font-semibold tracking-[0.08em] uppercase">Tipo</p>
                    <p className="mt-1 font-semibold text-[var(--gbp-text)]">CNAME</p>
                  </div>
                  <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-2.5">
                    <p className="text-[10px] font-semibold tracking-[0.08em] uppercase">Host</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="font-semibold text-[var(--gbp-text)]">app</p>
                      <button
                        type="button"
                        onClick={() => void copyText("app", "Host")}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--gbp-border2)] px-2 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]"
                      >
                        <Copy className="h-3 w-3" /> Copiar
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-2.5">
                    <p className="text-[10px] font-semibold tracking-[0.08em] uppercase">Destino</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-[var(--gbp-text)]">{dnsTarget}</p>
                      <button
                        type="button"
                        onClick={() => void copyText(dnsTarget, "Destino")}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--gbp-border2)] px-2 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]"
                      >
                        <Copy className="h-3 w-3" /> Copiar
                      </button>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px]">Despues de guardar el CNAME, usa Revalidar para actualizar estado.</p>
              </div>
            ) : null}

            {showDomainCreateForm ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  id="custom-domain-input"
                  value={domainInput}
                  onChange={(event) => setDomainInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createDomain();
                  }}
                  placeholder="app.nombreempresa.com"
                  className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]"
                />
                <button
                  type="button"
                  onClick={() => void createDomain()}
                  disabled={Boolean(pendingAction)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-[var(--gbp-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--gbp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Plus className="h-4 w-4" />
                  {isBusy("create") ? "Guardando..." : "Guardar dominio"}
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3 text-xs text-[var(--gbp-text2)]">
                Solo se permite un dominio personalizado por empresa.
              </div>
            )}

            <div className="mt-4 space-y-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--gbp-text)]">{row.domain}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-xs text-[var(--gbp-text2)]">
                          {row.is_primary ? "Dominio principal" : "Dominio alternativo"}
                        </p>
                        {row.is_primary ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            <Star className="h-3 w-3" /> Principal
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(row.status)}`}>
                      {row.statusLabel}
                    </span>
                  </div>

                  <p className="mt-2 text-[11px] text-[var(--gbp-text2)]">
                    Ultima verificacion: {isMounted ? formatLastChecked(row.last_checked_at) : "..."}
                  </p>

                  {row.verification_error ? (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                      <CircleAlert className="h-3.5 w-3.5" /> {row.verification_error}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void recheckDomain(row.domain)}
                      disabled={Boolean(pendingAction)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] disabled:opacity-60"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {isBusy(`recheck:${row.domain}`) ? "Revalidando..." : "Revalidar"}
                    </button>
                    {!row.is_primary ? (
                      <button
                        type="button"
                        onClick={() => void setPrimary(row.domain)}
                        disabled={Boolean(pendingAction) || row.status !== "active"}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {isBusy(`primary:${row.domain}`) ? "Aplicando..." : "Activar principal"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => promptDelete(row)}
                      disabled={Boolean(pendingAction)}
                      className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isBusy(`delete:${row.domain}`) ? "Eliminando..." : "Eliminar"}
                    </button>
                  </div>
                </div>
              ))}

              {!hasRows ? (
                <div className="rounded-lg border border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-bg)] p-4 text-xs text-[var(--gbp-text2)]">
                  Aun no hay dominios configurados. Carga `app.tuempresa.com` para iniciar verificacion.
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3 text-xs text-[var(--gbp-text2)]">
            El modulo <strong>Custom Branding</strong> debe estar activo para usar dominio personalizado.
          </div>
        )}

        {notice ? (
          <p
            className={`mt-3 text-xs font-semibold transition-opacity ${
              notice.tone === "success" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {notice.message}
          </p>
        ) : null}
      </article>
    </>
  );
}

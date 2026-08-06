"use client";

import { useState } from "react";
import { CheckCircle2, Copy, KeyRound, LoaderCircle, ShieldCheck, XCircle } from "lucide-react";

type GoogleOAuthStatus = {
  configured: boolean;
  clientId: string;
  secretConfigured: boolean;
  status: "unconfigured" | "draft" | "active" | "failed" | "disabled";
  testedAt: string | null;
  failureCode: string | null;
  updatedAt: string | null;
};

export function GoogleOAuthSettingsCard({
  enabled,
  initialStatus,
  callbackUrls,
  disabledReason,
  result,
  resultMessage,
}: {
  enabled: boolean;
  initialStatus: GoogleOAuthStatus;
  callbackUrls: string[];
  disabledReason?: string;
  result?: string;
  resultMessage?: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [clientId, setClientId] = useState(initialStatus.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState<"save" | "disable" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(
    result === "success"
      ? { tone: "success", message: "La prueba fue exitosa. El acceso personalizado con Google está activo." }
      : result === "error"
        ? { tone: "error", message: resultMessage || "Google rechazó la configuración. Revisa las credenciales y vuelve a probar." }
        : null,
  );

  const canSubmit = enabled
    && !disabledReason
    && clientId.trim().length >= 20
    && (clientSecret.trim().length >= 8 || status.secretConfigured)
    && !busy;

  async function saveAndTest() {
    if (!canSubmit) return;
    setBusy("save");
    setNotice(null);
    try {
      const response = await fetch("/api/company/google-oauth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar la configuración.");
      setStatus(payload as GoogleOAuthStatus);
      window.location.assign("/api/company/google-oauth/test/start");
    } catch (caught) {
      setNotice({ tone: "error", message: caught instanceof Error ? caught.message : "No se pudo guardar la configuración." });
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("disable");
    setNotice(null);
    try {
      const response = await fetch("/api/company/google-oauth", { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo desactivar la configuración.");
      setStatus(payload as GoogleOAuthStatus);
      setNotice({ tone: "success", message: "Se desactivó el acceso personalizado. GetBackplate vuelve a gestionar Google." });
    } catch (caught) {
      setNotice({ tone: "error", message: caught instanceof Error ? caught.message : "No se pudo desactivar la configuración." });
    } finally {
      setBusy(null);
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setNotice({ tone: "success", message: "Dirección copiada." });
  }

  const active = status.status === "active";
  const statusLabel = active
    ? "Activo y verificado"
    : status.status === "failed"
      ? "La última prueba falló"
      : status.status === "disabled"
        ? "Desactivado"
        : status.configured
          ? "Pendiente de prueba"
          : "Sin configurar";

  return (
    <article id="google-oauth-branding" className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[var(--gbp-text2)] uppercase">
            <KeyRound className="h-3.5 w-3.5" /> Google OAuth
          </p>
          <p className="text-base font-semibold text-[var(--gbp-text)]">Marca propia en “Acceder con Google”</p>
          <p className="mt-1 max-w-3xl text-sm text-[var(--gbp-text2)]">
            Usa el proyecto de Google de tu empresa para mostrar su nombre y logo. Si no está activo, GetBackplate continúa gestionando el acceso como hasta ahora.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
          active
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : status.status === "failed"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"
        }`}>
          {active ? <CheckCircle2 className="h-3.5 w-3.5" /> : status.status === "failed" ? <XCircle className="h-3.5 w-3.5" /> : null}
          {statusLabel}
        </span>
      </div>

      {enabled && !disabledReason ? (
        <>
          <div className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[linear-gradient(160deg,var(--gbp-bg)_0%,var(--gbp-surface)_100%)] p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--gbp-accent)]" />
              <div className="text-xs leading-5 text-[var(--gbp-text2)]">
                <p className="font-semibold text-[var(--gbp-text)]">Antes de probar</p>
                <p>En Google Cloud configura el nombre, logo, dominio, privacidad y términos. Después agrega estas direcciones como <strong>Authorized redirect URIs</strong>:</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {callbackUrls.map((url) => (
                <div key={url} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2">
                  <code className="min-w-0 break-all text-[11px] text-[var(--gbp-text)]">{url}</code>
                  <button type="button" onClick={() => void copy(url)} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--gbp-border2)] px-2 py-1 text-[10px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]">
                    <Copy className="h-3 w-3" /> Copiar
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--gbp-text2)]">
              Google Client ID
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="000000000000-abc.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2.5 text-sm font-normal text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--gbp-text2)]">
              Google Client Secret
              <input
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder={status.secretConfigured ? "Guardado de forma segura; déjalo vacío para conservarlo" : "GOCSPX-..."}
                autoComplete="new-password"
                className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2.5 text-sm font-normal text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveAndTest()}
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--gbp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "save" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy === "save" ? "Guardando..." : "Guardar y probar configuración"}
            </button>
            {status.configured && status.status !== "disabled" ? (
              <button type="button" onClick={() => void disable()} disabled={Boolean(busy)} className="rounded-lg border border-[var(--gbp-border2)] px-4 py-2.5 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] disabled:opacity-60">
                {busy === "disable" ? "Desactivando..." : "Desactivar"}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3 text-xs text-[var(--gbp-text2)]">
          {disabledReason ?? <>El módulo <strong>Custom Branding</strong> debe estar activo para configurar una identidad propia en Google.</>}
        </div>
      )}

      {notice ? <p className={`mt-3 text-xs font-semibold ${notice.tone === "success" ? "text-emerald-700" : "text-rose-700"}`}>{notice.message}</p> : null}
      <p className="mt-3 text-[11px] text-[var(--gbp-muted)]">El Client Secret se cifra al guardarse y nunca vuelve a mostrarse.</p>
    </article>
  );
}

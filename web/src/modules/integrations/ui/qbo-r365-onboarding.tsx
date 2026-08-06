"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, Link2, ArrowRight, X, Layers, Minus } from "lucide-react";
import { toast } from "sonner";
import { createTranslator } from "@/modules/integrations/ui/qbo-r365.i18n";
import { ConnectToQuickBooksButton } from "@/shared/ui/connect-to-quickbooks-button";

type VendorProfile = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  website: string;
};

type Props = {
  locale?: "es" | "en";
  qboConnected: boolean;
  vendorProfile: Partial<VendorProfile> | null;
  maxConnections: number | null;
  syncConfigsCount: number;
  planName: string;
  onComplete: () => void;
  onConfigureConnections: () => void;
};

type Step = "auth" | "vendor" | "slots";

function useSteps(t: (s: string) => string): { id: Step; label: string }[] {
  return [
    { id: "auth",   label: t("Conectar QuickBooks") },
    { id: "vendor", label: t("Tu empresa") },
    { id: "slots",  label: t("Conexiones") },
  ];
}

function StepIndicator({
  current,
  completed,
  skipped,
  steps,
}: {
  current: Step;
  completed: Set<Step>;
  skipped: Set<Step>;
  steps: { id: Step; label: string }[];
}) {
  const order: Step[] = ["auth", "vendor", "slots"];
  const currentIdx = order.indexOf(current);

  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, i) => {
        const done = completed.has(step.id);
        const omitted = skipped.has(step.id) && !done;
        const active = order[currentIdx] === step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                done    ? "bg-[var(--gbp-success)] text-white" :
                omitted ? "border-2 border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-muted)]" :
                active  ? "bg-[var(--gbp-accent)] text-white" :
                          "border-2 border-[var(--gbp-border)] text-[var(--gbp-muted)]"
              }`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : omitted ? <Minus className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-3 h-px w-8 ${done ? "bg-[var(--gbp-success)]" : "bg-[var(--gbp-border)]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function QboR365Onboarding({ qboConnected, vendorProfile, maxConnections, syncConfigsCount, planName, onComplete, onConfigureConnections }: Props) {
  // The integration setup is a QuickBooks-specific workflow and is always English.
  const t = useMemo(() => createTranslator("en"), []);
  const STEPS = useSteps(t);
  const [step, setStep] = useState<Step>(qboConnected ? "vendor" : "auth");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skippedSteps, setSkippedSteps] = useState<Set<Step>>(new Set());
  const [vendorComplete, setVendorComplete] = useState(Boolean(
    vendorProfile?.company?.trim()
    && vendorProfile?.contactName?.trim()
    && vendorProfile?.email?.trim(),
  ));

  const [company,     setCompany]     = useState(vendorProfile?.company     ?? "");
  const [contactName, setContactName] = useState(vendorProfile?.contactName ?? "");
  const [email] = useState(vendorProfile?.email ?? "");
  const [phone,       setPhone]       = useState(vendorProfile?.phone       ?? "");
  const [address,     setAddress]     = useState(vendorProfile?.address     ?? "");
  const [website,     setWebsite]     = useState(vendorProfile?.website     ?? "");

  useEffect(() => {
    if (qboConnected) {
      setStep((current) => current === "auth" ? "vendor" : current);
      setSkippedSteps((current) => {
        const next = new Set(current);
        next.delete("auth");
        return next;
      });
    }
  }, [qboConnected]);

  const completedSteps = new Set<Step>();
  if (qboConnected) completedSteps.add("auth");
  if (vendorComplete) completedSteps.add("vendor");
  if (syncConfigsCount > 0) completedSteps.add("slots");

  async function connectQbo() {
    setOauthLoading(true);
    try {
      const res = await fetch("/api/company/integrations/qbo-r365/oauth/start", { cache: "no-store" });
      const payload = await res.json() as { authorizeUrl?: string; error?: string };
      if (!res.ok || !payload.authorizeUrl) throw new Error(payload.error ?? "Error OAuth");
      window.location.href = payload.authorizeUrl;
    } catch {
      toast.error(t("No se pudo iniciar la conexión con QuickBooks"));
      setOauthLoading(false);
    }
  }

  async function updateOnboarding(input: { vendorProfile?: VendorProfile; complete?: boolean; skip?: boolean }, busySetter: (value: boolean) => void) {
    busySetter(true);
    try {
      const res = await fetch("/api/company/integrations/qbo-r365/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error();
      return true;
    } catch {
      toast.error(t("No se pudo guardar la configuración"));
      return false;
    } finally {
      busySetter(false);
    }
  }

  async function saveVendorAndContinue() {
    if (!company.trim() || !contactName.trim() || !email.trim()) {
      toast.error(t("Completa compañía, nombre de contacto y email."));
      return;
    }
    const saved = await updateOnboarding(
      { vendorProfile: { company, contactName, email, phone, address, website } },
      setSaving,
    );
    if (saved) {
      setVendorComplete(true);
      setSkippedSteps((current) => {
        const next = new Set(current);
        next.delete("vendor");
        return next;
      });
      setStep("slots");
    }
  }

  async function finishOnboarding() {
    if (syncConfigsCount === 0) {
      onComplete();
      onConfigureConnections();
      return;
    }
    const completed = await updateOnboarding({ complete: true }, setSkipping);
    if (!completed) return;
    toast.success(t("¡Onboarding completado! Ya puedes gestionar tus conexiones."));
    onComplete();
  }

  async function skipOnboarding() {
    const skipped = await updateOnboarding({ skip: true }, setSkipping);
    if (!skipped) return;
    toast.info(t("Puedes completar la configuración más tarde desde Integraciones."));
    onComplete();
  }

  function skipStep(current: Step, next: Step) {
    setSkippedSteps((steps) => new Set(steps).add(current));
    setStep(next);
  }

  const inputCls = "w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-[var(--gbp-accent)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_oklab,var(--gbp-accent)_15%,transparent)] transition";
  const labelCls = "block mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-[2rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-2xl">

        {/* Header */}
        <div className="border-b border-[var(--gbp-border)] px-8 py-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-accent)]">
                {t("Plan")} {planName} · {t("Configuración inicial")}
              </p>
              <h2 className="mt-0.5 text-xl font-bold text-foreground">{t("Activa tu integración QuickBooks → R365")}</h2>
            </div>
            <button
              type="button"
              onClick={() => void skipOnboarding()}
              className="rounded-xl p-2 text-muted-foreground transition hover:bg-muted"
              title={t("Configurar más tarde")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <StepIndicator current={step} completed={completedSteps} skipped={skippedSteps} steps={STEPS} />
        </div>

        {/* Body */}
        <div className="max-h-[55vh] overflow-y-auto px-8 py-6 scrollbar-hide">

          {/* ── Step 1: Auth ── */}
          {step === "auth" && (
            <div className="space-y-5">
              <div className={`rounded-2xl border p-5 ${qboConnected ? "border-emerald-200 bg-emerald-50" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)]"}`}>
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-lg ${qboConnected ? "bg-emerald-500 text-white" : "bg-[#2CA01C] text-white"}`}>
                    <Link2 className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground">QuickBooks® Online</p>
                    <p className="text-xs text-muted-foreground">
                      {qboConnected ? t("Cuenta conectada correctamente") : t("Necesitas autorizar el acceso a tus facturas de QuickBooks.")}
                    </p>
                  </div>
                  {qboConnected && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                </div>
                {!qboConnected && (
                  <ConnectToQuickBooksButton
                    onClick={() => void connectQbo()}
                    disabled={oauthLoading}
                    className="mt-4"
                  />
                )}
              </div>
              {qboConnected && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  ✓ {t("QuickBooks ya está conectado. Puedes continuar al siguiente paso.")}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Vendor data ── */}
          {step === "vendor" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                {t("Esta información identifica a tu empresa como vendor en las facturas que se envían a R365.")}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>{t("Compañía")}</label>
                  <input className={inputCls} value={company} onChange={e => setCompany(e.target.value)} placeholder="Prodel Distribution Inc" />
                </div>
                <div>
                  <label className={labelCls}>{t("Nombre de contacto")}</label>
                  <input className={inputCls} value={contactName} onChange={e => setContactName(e.target.value)} placeholder={t("Nombre Apellido")} />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input className={`${inputCls} cursor-not-allowed opacity-75`} type="email" value={email} readOnly aria-readonly="true" />
                </div>
                <div>
                  <label className={labelCls}>{t("Teléfono")}</label>
                  <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 0000" />
                </div>
                <div>
                  <label className={labelCls}>{t("Sitio web")}</label>
                  <input className={inputCls} value={website} onChange={e => setWebsite(e.target.value)} placeholder="company.com" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>{t("Dirección")}</label>
                  <input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder={t("Calle, Ciudad, Estado")} />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Slots overview ── */}
          {step === "slots" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--gbp-accent-glow)]">
                    <Layers className="h-5 w-5 text-[var(--gbp-accent)]" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{t("Plan")} {planName}</p>
                    <p className="text-xs text-muted-foreground">
                      {maxConnections != null
                        ? `${maxConnections} R365 connection slots available`
                        : t("Conexiones ilimitadas a R365")}
                    </p>
                  </div>
                </div>

                {/* Slot summary grid */}
                <div className={`grid gap-2 ${maxConnections && maxConnections <= 4 ? "grid-cols-" + maxConnections : "grid-cols-3"}`}>
                  {maxConnections != null && Array.from({ length: maxConnections }).map((_, i) => {
                    const isFilled = i < syncConfigsCount;
                    return (
                      <div key={i} className={`flex items-center justify-center rounded-xl border py-4 text-xs font-semibold ${
                        isFilled
                          ? "border-[var(--gbp-accent)]/40 bg-[var(--gbp-accent)]/5 text-[var(--gbp-accent)]"
                          : "border-dashed border-[var(--gbp-border)] text-muted-foreground"
                      }`}>
                        {isFilled ? `● ${t("Configurado")}` : `○ ${t("Libre")}`}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">{t("¿Cómo configurar una conexión?")}</p>
                <p className="mt-1 text-xs leading-relaxed">
                  {t("Desde el dashboard de integración puedes configurar cada slot: nombre del cliente en R365, Account Number de QuickBooks y credenciales FTP del servidor de R365. Puedes hacerlo ahora o en cualquier momento.")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--gbp-border)] px-8 py-5">
          <button
            type="button"
            onClick={() => void skipOnboarding()}
            disabled={saving || skipping}
            className="text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            {skipping ? <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> : null}
            {t("Configurar más tarde")}
          </button>

          <div className="flex gap-3">
            {step === "vendor" && (
              <button
                type="button"
                onClick={() => setStep("auth")}
                className="rounded-xl border border-[var(--gbp-border)] px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
              >
                ← {t("Atrás")}
              </button>
            )}
            {step === "slots" && (
              <button
                type="button"
                onClick={() => setStep("vendor")}
                className="rounded-xl border border-[var(--gbp-border)] px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
              >
                ← {t("Atrás")}
              </button>
            )}

            {step === "auth" && (
              <>
                {!qboConnected && (
                  <button
                    type="button"
                    onClick={() => skipStep("auth", "vendor")}
                    className="rounded-xl border border-[var(--gbp-border)] px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
                  >
                    {t("Omitir por ahora")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep("vendor")}
                  disabled={!qboConnected}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("Continuar")} <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}

            {step === "vendor" && (
              <>
                <button
                  type="button"
                  onClick={() => skipStep("vendor", "slots")}
                  disabled={saving}
                  className="rounded-xl border border-[var(--gbp-border)] px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted disabled:opacity-50"
                >
                  {t("Omitir por ahora")}
                </button>
                <button
                  type="button"
                  onClick={() => void saveVendorAndContinue()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)] transition hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("Guardar y continuar")} <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}

            {step === "slots" && (
              <button
                type="button"
                onClick={() => void finishOnboarding()}
                disabled={skipping}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)] transition hover:opacity-90 disabled:opacity-60"
              >
                {skipping ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("Guardando...")}</> : <>{syncConfigsCount > 0 ? t("Finalizar") : t("Configurar primera conexión")} <ArrowRight className="h-4 w-4" /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

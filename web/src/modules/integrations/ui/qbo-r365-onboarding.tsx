"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight, Loader2, Link2, Zap, ArrowRight, X, Layers } from "lucide-react";
import { toast } from "sonner";

type VendorProfile = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  website: string;
};

type Props = {
  qboConnected: boolean;
  vendorProfile: Partial<VendorProfile> | null;
  maxConnections: number | null;
  syncConfigsCount: number;
  planName: string;
  onComplete: () => void;
};

type Step = "auth" | "vendor" | "slots";

const STEPS: { id: Step; label: string }[] = [
  { id: "auth",   label: "Conectar QBO" },
  { id: "vendor", label: "Tu empresa" },
  { id: "slots",  label: "Conexiones" },
];

function StepIndicator({ current, connected }: { current: Step; connected: boolean }) {
  const order: Step[] = ["auth", "vendor", "slots"];
  const currentIdx = order.indexOf(current);

  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => {
        const done = i < currentIdx || (step.id === "auth" && connected && currentIdx > 0);
        const active = order[currentIdx] === step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                done    ? "bg-[var(--gbp-success)] text-white" :
                active  ? "bg-[var(--gbp-accent)] text-white" :
                          "border-2 border-[var(--gbp-border)] text-[var(--gbp-muted)]"
              }`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mx-3 h-px w-8 ${i < currentIdx ? "bg-[var(--gbp-success)]" : "bg-[var(--gbp-border)]"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function QboR365Onboarding({ qboConnected: initialQboConnected, vendorProfile, maxConnections, syncConfigsCount, planName, onComplete }: Props) {
  const [step, setStep] = useState<Step>(initialQboConnected ? "vendor" : "auth");
  const [qboConnected, setQboConnected] = useState(initialQboConnected);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const [company,     setCompany]     = useState(vendorProfile?.company     ?? "");
  const [contactName, setContactName] = useState(vendorProfile?.contactName ?? "");
  const [email,       setEmail]       = useState(vendorProfile?.email       ?? "");
  const [phone,       setPhone]       = useState(vendorProfile?.phone       ?? "");
  const [address,     setAddress]     = useState(vendorProfile?.address     ?? "");
  const [website,     setWebsite]     = useState(vendorProfile?.website     ?? "");

  async function connectQbo() {
    setOauthLoading(true);
    try {
      const res = await fetch("/api/company/integrations/qbo-r365/oauth/start", { cache: "no-store" });
      const payload = await res.json() as { authorizeUrl?: string; error?: string };
      if (!res.ok || !payload.authorizeUrl) throw new Error(payload.error ?? "Error OAuth");
      window.location.href = payload.authorizeUrl;
    } catch {
      toast.error("No se pudo iniciar la conexión con QuickBooks");
      setOauthLoading(false);
    }
  }

  async function completeOnboarding(skipVendor = false) {
    const fn = skipVendor ? setSkipping : setSaving;
    fn(true);
    try {
      const res = await fetch("/api/company/integrations/qbo-r365/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorProfile: skipVendor ? null : { company, contactName, email, phone, address, website },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("¡Onboarding completado! Ya podés gestionar tus conexiones.");
      onComplete();
    } catch {
      toast.error("No se pudo guardar la configuración");
    } finally {
      fn(false);
    }
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
                Plan {planName} · Configuración inicial
              </p>
              <h2 className="mt-0.5 text-xl font-bold text-foreground">Activá tu integración QBO → R365</h2>
            </div>
            <button
              type="button"
              onClick={() => void completeOnboarding(true)}
              className="rounded-xl p-2 text-muted-foreground transition hover:bg-muted"
              title="Configurar más tarde"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <StepIndicator current={step} connected={qboConnected} />
        </div>

        {/* Body */}
        <div className="max-h-[55vh] overflow-y-auto px-8 py-6 scrollbar-hide">

          {/* ── Step 1: Auth ── */}
          {step === "auth" && (
            <div className="space-y-5">
              <div className={`rounded-2xl border p-5 ${qboConnected ? "border-emerald-200 bg-emerald-50" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)]"}`}>
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-lg ${qboConnected ? "bg-emerald-500 text-white" : "bg-[#2CA01C] text-white"}`}>
                    QB
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground">QuickBooks Online</p>
                    <p className="text-xs text-muted-foreground">
                      {qboConnected ? "Cuenta conectada correctamente" : "Necesitás autorizar el acceso de solo lectura a tus facturas."}
                    </p>
                  </div>
                  {qboConnected && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                </div>
                {!qboConnected && (
                  <button
                    type="button"
                    onClick={() => void connectQbo()}
                    disabled={oauthLoading}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2CA01C] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#23830f] disabled:opacity-60"
                  >
                    {oauthLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Conectando...</> : <><Link2 className="h-4 w-4" /> Conectar QuickBooks</>}
                  </button>
                )}
              </div>
              {qboConnected && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  ✓ QuickBooks ya está conectado. Podés continuar al siguiente paso.
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Vendor data ── */}
          {step === "vendor" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Esta información identifica a tu empresa como vendor en las facturas que se envían a R365.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Compañía</label>
                  <input className={inputCls} value={company} onChange={e => setCompany(e.target.value)} placeholder="Prodel Distribution Inc" />
                </div>
                <div>
                  <label className={labelCls}>Nombre de contacto</label>
                  <input className={inputCls} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nombre Apellido" />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ops@empresa.com" />
                </div>
                <div>
                  <label className={labelCls}>Teléfono</label>
                  <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 0000" />
                </div>
                <div>
                  <label className={labelCls}>Sitio web</label>
                  <input className={inputCls} value={website} onChange={e => setWebsite(e.target.value)} placeholder="empresa.com" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Dirección</label>
                  <input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder="Calle, Ciudad, Estado" />
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
                    <p className="font-bold text-foreground">Plan {planName}</p>
                    <p className="text-xs text-muted-foreground">
                      {maxConnections != null
                        ? `${maxConnections} slots de conexión R365 disponibles`
                        : "Conexiones ilimitadas a R365"}
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
                        {isFilled ? "● Configurado" : "○ Libre"}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">¿Cómo configurar una conexión?</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Desde el dashboard de integración podés configurar cada slot: nombre del cliente en R365, Account Number de QBO y credenciales FTP del servidor de R365. Podés hacerlo ahora o en cualquier momento.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--gbp-border)] px-8 py-5">
          <button
            type="button"
            onClick={() => void completeOnboarding(true)}
            disabled={saving || skipping}
            className="text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            {skipping ? <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> : null}
            Configurar más tarde
          </button>

          <div className="flex gap-3">
            {step === "vendor" && (
              <button
                type="button"
                onClick={() => setStep("auth")}
                className="rounded-xl border border-[var(--gbp-border)] px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
              >
                ← Atrás
              </button>
            )}
            {step === "slots" && (
              <button
                type="button"
                onClick={() => setStep("vendor")}
                className="rounded-xl border border-[var(--gbp-border)] px-5 py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted"
              >
                ← Atrás
              </button>
            )}

            {step === "auth" && (
              <button
                type="button"
                onClick={() => setStep("vendor")}
                disabled={!qboConnected}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </button>
            )}

            {step === "vendor" && (
              <button
                type="button"
                onClick={() => setStep("slots")}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)] transition hover:opacity-90"
              >
                Continuar <ChevronRight className="h-4 w-4" />
              </button>
            )}

            {step === "slots" && (
              <button
                type="button"
                onClick={() => void completeOnboarding(false)}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-6 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)] transition hover:opacity-90 disabled:opacity-60"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <>Finalizar <ArrowRight className="h-4 w-4" /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";

import { GetBackplateLogo } from "@/shared/ui/getbackplate-logo";

type LaunchMode = "checkout" | "portal";

type Props = {
  mode: LaunchMode;
  brandName: string;
  logoUrl: string;
  customBrandingEnabled: boolean;
  planId?: string;
  billingPeriod?: "monthly" | "yearly";
};

export function StripeLaunchBridge({
  mode,
  brandName,
  logoUrl,
  customBrandingEnabled,
  planId,
  billingPeriod = "monthly",
}: Props) {
  const router = useRouter();
  const startedRef = useRef(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState<string | null>(null);

  const title = mode === "checkout" ? "Conectando con Stripe Checkout" : "Abriendo portal de pagos";
  const description = mode === "checkout"
    ? "Estamos preparando una sesión de pago segura para continuar con tu suscripción."
    : "Estamos conectando tu cuenta con el portal de facturación seguro de Stripe.";

  const billingLabel = billingPeriod === "yearly" ? "Anual" : "Mensual";

  const endpoint = mode === "checkout" ? "/api/stripe/checkout" : "/api/stripe/billing-portal";
  const payload = useMemo(() => {
    if (mode !== "checkout") return null;
    return {
      planId,
      billingPeriod,
    };
  }, [billingPeriod, mode, planId]);

  const resolveStripeUrl = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data?.message === "string" ? data.message : typeof data?.error === "string" ? data.error : "No se pudo abrir Stripe");
      }

      if (typeof data?.url !== "string" || !data.url) {
        throw new Error("Stripe no devolvió una URL de redirección válida.");
      }

      setTargetUrl(data.url);
      setState("ready");
      window.location.assign(data.url);
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Error de conexión con Stripe");
    }
  }, [endpoint, payload]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void resolveStripeUrl();
  }, [resolveStripeUrl]);

  return (
    <main className="min-h-screen bg-[radial-gradient(1000px_420px_at_10%_-10%,rgba(40,169,93,0.14),transparent),radial-gradient(900px_420px_at_100%_0%,rgba(26,129,255,0.10),transparent),#f7faf8] px-4 py-10">
      <div className="mx-auto w-full max-w-[760px]">
        <button
          type="button"
          onClick={() => router.push("/app/dashboard")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(9,33,19,0.08)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#274335] backdrop-blur hover:bg-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al panel
        </button>

        <section className="mt-4 overflow-hidden rounded-2xl border border-[rgba(9,33,19,0.1)] bg-white shadow-[0_24px_80px_rgba(9,33,19,0.14)]">
          <div className="h-1 w-full bg-[linear-gradient(90deg,#1cbf73,#2f8fff)]" />
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#f0f7f3] text-[#1b9b61]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#4b7b64]">Pago seguro</p>
                  <h1 className="text-[22px] font-bold text-[#143126]">{title}</h1>
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(9,33,19,0.1)] bg-[#f9fcfa] px-3 py-2">
                {customBrandingEnabled && logoUrl ? (
                  <Image src={logoUrl} alt={`Logo de ${brandName}`} width={160} height={36} className="h-7 w-auto object-contain" />
                ) : (
                  <GetBackplateLogo variant="light" width={156} height={28} className="h-7 w-auto" />
                )}
                <p className="mt-1 text-right text-[10px] font-semibold text-[#5b7368]">{brandName}</p>
              </div>
            </div>

            <p className="mt-4 text-sm text-[#456357]">{description}</p>

            {mode === "checkout" ? (
              <div className="mt-4 grid gap-2 rounded-xl border border-[rgba(9,33,19,0.1)] bg-[#f8fcfa] p-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#5e7a6d]">Plan</p>
                  <p className="mt-1 text-sm font-semibold text-[#19382c]">{planId ? `ID ${planId.slice(0, 8)}...` : "Plan seleccionado"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#5e7a6d]">Facturación</p>
                  <p className="mt-1 text-sm font-semibold text-[#19382c]">{billingLabel}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-5 rounded-xl border border-[rgba(9,33,19,0.1)] bg-white p-4">
              {state === "loading" ? (
                <div className="flex items-center gap-2.5 text-sm font-semibold text-[#1d4b38]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparando redirección segura a Stripe...
                </div>
              ) : null}

              {state === "ready" ? (
                <p className="text-sm font-semibold text-[#1d4b38]">Sesión lista. Si no redirige automáticamente, continúa manualmente.</p>
              ) : null}

              {state === "error" ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 text-sm text-[#7c2d2d]">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <p>{errorMessage ?? "No se pudo conectar con Stripe en este momento."}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void resolveStripeUrl()}
                    className="rounded-lg bg-[#1d9d62] px-3 py-2 text-xs font-bold text-white hover:bg-[#168653]"
                  >
                    Reintentar conexión
                  </button>
                </div>
              ) : null}

              {state === "ready" && targetUrl ? (
                <button
                  type="button"
                  onClick={() => window.location.assign(targetUrl)}
                  className="mt-3 rounded-lg bg-[#1d9d62] px-3 py-2 text-xs font-bold text-white hover:bg-[#168653]"
                >
                  Continuar a Stripe
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

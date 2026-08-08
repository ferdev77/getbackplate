"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { publishDevelopmentReportAction, saveDevelopmentReportPricesAction } from "./actions";

type PriceState = Record<string, string>;

export function DevelopmentReportViewer({ reportId, title, editable, initialPrices }: {
  reportId: string;
  title: string;
  editable: boolean;
  initialPrices: PriceState;
}) {
  const pricesRef = useRef(initialPrices);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const [publishing, startPublishing] = useTransition();

  useEffect(() => {
    if (!editable) return;
    function receivePrices(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== "development-report-prices" || event.data?.reportId !== reportId) return;
      const next = event.data.prices;
      if (!next || typeof next !== "object" || Array.isArray(next)) return;
      pricesRef.current = next as PriceState;
      setSaveState("dirty");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaveState("saving");
        const result = await saveDevelopmentReportPricesAction(reportId, pricesRef.current);
        if (result.ok) setSaveState("saved");
        else {
          setSaveState("dirty");
          toast.error(result.error);
        }
      }, 650);
    }
    window.addEventListener("message", receivePrices);
    return () => {
      window.removeEventListener("message", receivePrices);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [editable, reportId]);

  function publish() {
    if (!window.confirm("¿Publicar este período? Después de publicarlo no se podrán cambiar los precios.")) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    startPublishing(async () => {
      const result = await publishDevelopmentReportAction(reportId, pricesRef.current);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Período publicado");
        window.location.reload();
      }
    });
  }

  return <section className="overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-white shadow-xl">
    {editable && <div className="flex flex-col gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-black">Borrador privado de fer@soliz.com</p>
        <p className="flex items-center gap-1.5 text-xs text-amber-800">
          {saveState === "saving" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          {saveState === "saved" && <CheckCircle2 className="h-3.5 w-3.5" />}
          {saveState === "saving" ? "Guardando precios..." : saveState === "dirty" ? "Cambios pendientes" : "Precios guardados"}
        </p>
      </div>
      <button type="button" disabled={publishing} onClick={publish} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
        <Send className="h-4 w-4" />{publishing ? "Publicando..." : "Publicar período"}
      </button>
    </div>}
    <iframe
      src={`/api/superadmin/development-reports/${reportId}`}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      className="h-[calc(100vh-13rem)] min-h-[720px] w-full bg-white"
    />
  </section>;
}

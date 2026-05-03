"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Search, X, RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2, Settings } from "lucide-react";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { EmptyState } from "@/shared/ui/empty-state";
import { saveIntegrationConfigAction } from "@/modules/integrations/qbo-r365/actions";
import { toast } from "sonner";

type StatCard = { label: string; value: string; subLabel: string; tone: "default" | "success" | "warning" | "muted" };
type ConnectionInfo = { status: string; realmId?: string | null; host?: string | null; lastRefreshed?: string | null };
type RunRow = {
  id: string; startedAt: string; completedAt: string | null; status: string; triggerSource: string;
  invoicesDetected: number; invoicesUploaded: number; invoicesSkipped: number; invoicesFailed: number;
  fileName: string | null; templateMode?: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null; dryRun: boolean; errorMessage: string | null;
};
type DashboardData = {
  generatedAt: string;
  connections: { qbo: ConnectionInfo; ftp: ConnectionInfo };
  statCards: StatCard[];
  runs: RunRow[];
  invoiceHistory: Array<{
    sourceInvoiceId: string;
    invoiceNumber: string | null;
    vendor: string | null;
    mappedCode: string | null;
    lastStatus: string;
    lastSeenAt: string;
    lastRunId: string | null;
    templateMode: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null;
    sentToR365: boolean;
    timesSeen: number;
  }>;
};
type PreviewRow = {
  status: string;
  sourceInvoiceId: string | null;
  sourceLineId: string | null;
  raw: { vendor: string | null; invoiceNumber: string | null; description: string | null; amount: number | null };
  mapped: {
    vendor: string | null;
    invoiceNumber: string | null;
    targetCode: string | null;
    description: string | null;
    quantity: number | null;
    unitPrice: number | null;
    lineAmount: number | null;
    taxAmount: number | null;
    totalAmount: number | null;
  };
};
type ConfigSnapshot = {
  settings?: {
    template?: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates";
  };
};
type Props = { organizationId: string; deferredDataUrl: string; className?: string };

function toneClass(tone: StatCard["tone"]) {
  if (tone === "success") return "text-[var(--gbp-success)]";
  if (tone === "warning") return "text-[var(--gbp-accent)]";
  if (tone === "muted") return "text-[var(--gbp-muted)]";
  return "text-[var(--gbp-text)]";
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    completed: { label: "Completado", cls: "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]", Icon: CheckCircle2 },
    completed_with_errors: { label: "Parcial", cls: "bg-[color-mix(in_oklab,var(--gbp-accent)_22%,transparent)] text-[var(--gbp-accent)]", Icon: AlertTriangle },
    failed: { label: "Error", cls: "bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]", Icon: XCircle },
    running: { label: "En curso", cls: "bg-blue-50 text-blue-600", Icon: Loader2 },
  };
  const s = map[status] ?? { label: status, cls: "bg-[var(--gbp-bg)] text-[var(--gbp-text2)]", Icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${s.cls}`}>
      <s.Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {s.label}
    </span>
  );
}

function triggerLabel(src: string) {
  if (src === "scheduled") return "Auto";
  if (src === "retry") return "Reintento";
  return "Manual";
}

function templateLabel(mode?: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null) {
  if (mode === "by_item_service_dates") return "by_item_service_dates";
  if (mode === "by_account_service_dates") return "by_account_service_dates";
  if (mode === "by_account") return "by_account";
  if (mode === "by_item") return "by_item";
  return "-";
}

function itemStatusLabel(status: string) {
  if (status === "uploaded" || status === "validated") return "Enviada";
  if (status === "skipped_duplicate") return "Saltada";
  if (status === "failed_delivery" || status === "failed_validation") return "Error";
  if (status === "exported") return "Preparada";
  return status;
}

function connDot(status: string) {
  if (status === "connected") return "bg-[var(--gbp-success)]";
  if (status === "error" || status === "expired") return "bg-[var(--gbp-error)]";
  return "bg-[var(--gbp-muted)]";
}

function connLabel(status: string) {
  if (status === "connected") return "Conectado";
  if (status === "error") return "Error";
  if (status === "expired") return "Expirado";
  return "Desconectado";
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

function normalizeApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function presentIntegrationError(errorMessage: string, context: "sync" | "oauth" | "prepare" | "preview" | "send") {
  const msg = errorMessage.toLowerCase();

  if (msg.includes("quickbooks") && msg.includes("no esta conectado")) {
    toast.error("QuickBooks no esta conectado", {
      description: "Conecta QuickBooks desde el boton 'Conectar QBO' y vuelve a intentar.",
    });
    return;
  }

  if (msg.includes("qbo_3100") || msg.includes("applicationauthorizationfailed")) {
    toast.error("QuickBooks requiere reconexion", {
      description: "La autorizacion actual no es valida para esa company. Usa 'Reconectar QBO' y vuelve a intentar.",
    });
    return;
  }

  if (msg.includes("restaurant365") && msg.includes("no esta conectado")) {
    toast.error("R365 FTP no esta conectado", {
      description: "Carga host, usuario y password en 'Configurar' antes de enviar.",
    });
    return;
  }

  if (context === "sync") {
    toast.error("No se pudo ejecutar la sincronizacion", { description: errorMessage });
    return;
  }
  if (context === "oauth") {
    toast.error("No se pudo iniciar QuickBooks OAuth", { description: errorMessage });
    return;
  }
  if (context === "prepare") {
    toast.error("No se pudo preparar el lote", { description: errorMessage });
    return;
  }
  if (context === "preview") {
    toast.error("No se pudo cargar la vista previa", { description: errorMessage });
    return;
  }

  toast.error("No se pudo enviar a R365", { description: errorMessage });
}

export function QboR365Dashboard({ organizationId, deferredDataUrl, className }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [mode, setMode] = useState<"operation" | "developer">("operation");
  const [preparing, setPreparing] = useState(false);
  const [sendingPrepared, setSendingPrepared] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"raw" | "json" | "csv" | "txt" | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configTemplate, setConfigTemplate] = useState<"by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates">("by_item");
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch data
  useEffect(() => {
    const ctrl = new AbortController();
    void fetch(deferredDataUrl, { cache: "no-store", signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => { if (!ctrl.signal.aborted) setData(d as DashboardData); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [deferredDataUrl, refreshKey]);

  // Realtime
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const orgFilter = `organization_id=eq.${organizationId}`;
    const channel = supabase
      .channel(`qbo-r365-dashboard-${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "integration_runs", filter: orgFilter }, () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => setRefreshKey((p) => p + 1), 500);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "integration_connections", filter: orgFilter }, () => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => setRefreshKey((p) => p + 1), 500);
      })
      .subscribe();
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); supabase.removeChannel(channel); };
  }, [organizationId]);

  // Polling
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") setRefreshKey((p) => p + 1); }, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isConfigOpen) return;
    const ctrl = new AbortController();
    setIsLoadingConfig(true);
    void fetch("/api/company/integrations/qbo-r365/config", { cache: "no-store", signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (ctrl.signal.aborted) return;
        const snap = d as ConfigSnapshot;
        setConfigTemplate(snap.settings?.template ?? "by_item");
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) setIsLoadingConfig(false);
      });

    return () => ctrl.abort();
  }, [isConfigOpen, mode]);

  const filteredRuns = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.runs.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      return (r.fileName?.toLowerCase().includes(q) || r.triggerSource.toLowerCase().includes(q) || r.status.toLowerCase().includes(q));
    });
  }, [data, query, statusFilter]);

  const selectedRun = useMemo(() => data?.runs.find((r) => r.id === selectedRunId) ?? null, [data, selectedRunId]);

  const preparedRun = useMemo(() => {
    if (!data?.runs?.length) return null;
    return data.runs.find((r) => r.invoicesUploaded === 0 && r.invoicesDetected > 0 && r.status !== "failed") ?? null;
  }, [data]);

  const developerRunForExport = useMemo(() => {
    if (selectedRun) return selectedRun;
    if (preparedRun) return preparedRun;
    return data?.runs?.[0] ?? null;
  }, [selectedRun, preparedRun, data]);

  async function handleSync(dryRun: boolean) {
    setSyncing(true);
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; runId?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Fallo de sincronizacion");
      }

      toast.success(dryRun ? "Dry run completado" : "Sincronizacion ejecutada", {
        description: payload.runId ? `Corrida registrada: ${payload.runId.slice(0, 8)}...` : "Revisa el historial para ver resultados.",
      });
      setTimeout(() => setRefreshKey((p) => p + 1), 1000);
    } catch (error) {
      presentIntegrationError(normalizeApiError(error, "Fallo de sincronizacion"), "sync");
    }
    setSyncing(false);
  }

  async function handleConnectQbo() {
    setOauthConnecting(true);
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/oauth/start", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { authorizeUrl?: string; error?: string };
      if (!response.ok || !payload.authorizeUrl) {
        throw new Error(payload.error || "No se pudo iniciar conexion OAuth");
      }
      toast.info("Redirigiendo a QuickBooks", {
        description: "Completa el consentimiento en Intuit y volveras automaticamente.",
      });
      const popup = window.open(payload.authorizeUrl, "_blank", "noopener,noreferrer");
      if (!popup) {
        toast.warning("No se pudo abrir una nueva pestana", {
          description: "Tu navegador bloqueo el popup. Abriremos QuickBooks en esta misma pestana.",
        });
        window.location.assign(payload.authorizeUrl);
      }
    } catch (error) {
      presentIntegrationError(normalizeApiError(error, "No se pudo iniciar conexion OAuth"), "oauth");
      setOauthConnecting(false);
    }
  }

  async function handlePrepareBatch() {
    setPreparing(true);
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/prepare", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo preparar lote");
      if (payload.runId) setSelectedRunId(payload.runId);
      toast.success("Lote preparado desde QuickBooks", {
        description: payload.runId ? `Run ${payload.runId.slice(0, 8)} listo para preview/envio.` : "Ya puedes abrir la vista previa.",
      });
      setRefreshKey((p) => p + 1);
    } catch (error) {
      presentIntegrationError(normalizeApiError(error, "No se pudo preparar lote"), "prepare");
    }
    setPreparing(false);
  }

  async function handleLoadPreview(runId: string) {
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/company/integrations/qbo-r365/preview?runId=${encodeURIComponent(runId)}&limit=40`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { rows?: PreviewRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo cargar preview");
      setPreviewRows(payload.rows ?? []);
      toast.success("Vista previa cargada", {
        description: `Mostrando ${payload.rows?.length ?? 0} filas de ejemplo para validar mapeo.`,
      });
    } catch (error) {
      presentIntegrationError(normalizeApiError(error, "No se pudo cargar preview"), "preview");
      setPreviewRows([]);
    }
    setPreviewLoading(false);
  }

  async function handleSendPrepared(runId: string) {
    setSendingPrepared(true);
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; uploaded?: number; fileName?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo enviar lote");
      toast.success("Archivo enviado a R365", {
        description: payload.fileName
          ? `Archivo ${payload.fileName} subido (${payload.uploaded ?? 0} lineas).`
          : "El lote se envio correctamente.",
      });
      setRefreshKey((p) => p + 1);
    } catch (error) {
      presentIntegrationError(normalizeApiError(error, "No se pudo enviar lote"), "send");
    }
    setSendingPrepared(false);
  }

  async function handleExport(format: "raw" | "json" | "csv" | "txt") {
    if (!developerRunForExport?.id) {
      toast.error("No hay corrida para exportar", {
        description: "Primero ejecuta 'Traer datos QBO' para generar una corrida.",
      });
      return;
    }

    setExportingFormat(format);
    try {
      const url = `/api/company/integrations/qbo-r365/export?runId=${encodeURIComponent(developerRunForExport.id)}&format=${format}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "No se pudo exportar");
      }

      const blob = await response.blob();
      const dispo = response.headers.get("content-disposition") ?? "";
      const fileNameMatch = dispo.match(/filename=\"([^\"]+)\"/i);
      const fileName = fileNameMatch?.[1] || `qbo-r365-export.${format}`;

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(blobUrl);

      toast.success(`Exportacion ${format.toUpperCase()} lista`, {
        description: `Archivo ${fileName} descargado correctamente.`,
      });
    } catch (error) {
      toast.error("No se pudo exportar la corrida", {
        description: normalizeApiError(error, "Error de exportacion"),
      });
    }
    setExportingFormat(null);
  }

  const statCards = data?.statCards ?? [];
  const conns = data?.connections ?? { qbo: { status: "disconnected" }, ftp: { status: "disconnected" } };
  const invoiceHistory = data?.invoiceHistory ?? [];

  return (
    <main className={className}>
      {/* Header */}
      <section className="mb-6 rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--gbp-muted)]">Integraciones</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Integración QuickBooks → R365</h1>
            <p className="mt-1 text-sm text-[var(--gbp-text2)]">{data?.generatedAt ?? "Cargando..."}</p>
          </div>
          <div className="flex gap-2">
            <div className="mr-2 inline-flex rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-0.5">
              <button
                type="button"
                onClick={() => setMode("operation")}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold ${mode === "operation" ? "bg-[var(--gbp-text)] text-white" : "text-[var(--gbp-text2)]"}`}
              >
                Operacion
              </button>
              <button
                type="button"
                onClick={() => setMode("developer")}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold ${mode === "developer" ? "bg-[var(--gbp-text)] text-white" : "text-[var(--gbp-text2)]"}`}
              >
                Developer
              </button>
            </div>
            <button type="button" onClick={() => setIsConfigOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50">
              <Settings className="h-3.5 w-3.5" /> Configurar
            </button>
            <button type="button" disabled={syncing || mode === "developer"} onClick={() => handleSync(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Dry Run
            </button>
            <button type="button" disabled={syncing || mode === "developer"} onClick={() => handleSync(false)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--gbp-accent)] disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync Now
            </button>
          </div>
        </div>
      </section>

      {mode === "developer" && (
        <section className="mb-6 rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-bold text-[var(--gbp-text)]">Flujo developer (separado por etapas)</p>
            <button
              type="button"
              disabled={preparing}
              onClick={handlePrepareBatch}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${preparing ? "animate-spin" : ""}`} /> 1) Traer datos QBO
            </button>
            <button
              type="button"
              disabled={!preparedRun || previewLoading}
              onClick={() => preparedRun && handleLoadPreview(preparedRun.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
            >
              <Search className="h-3.5 w-3.5" /> 2) Ver preview
            </button>
            <button
              type="button"
              disabled={!preparedRun || sendingPrepared}
              onClick={() => preparedRun && handleSendPrepared(preparedRun.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--gbp-accent)] disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" /> 3) Enviar a R365
            </button>
            <button
              type="button"
              disabled={!developerRunForExport || exportingFormat !== null}
              onClick={() => handleExport("raw")}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
            >
              RAW
            </button>
            <button
              type="button"
              disabled={!developerRunForExport || exportingFormat !== null}
              onClick={() => handleExport("json")}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
            >
              JSON
            </button>
            <button
              type="button"
              disabled={!developerRunForExport || exportingFormat !== null}
              onClick={() => handleExport("csv")}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
            >
              CSV
            </button>
            <button
              type="button"
              disabled={!developerRunForExport || exportingFormat !== null}
              onClick={() => handleExport("txt")}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
            >
              TXT
            </button>
          </div>

          {previewRows.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-lg border border-[var(--gbp-border)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Raw Vendor</th>
                      <th className="px-3 py-2">Raw Invoice</th>
                      <th className="px-3 py-2">Mapped Code</th>
                      <th className="px-3 py-2">Descripcion</th>
                      <th className="px-3 py-2">Monto</th>
                      <th className="px-3 py-2">Tax</th>
                      <th className="px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={`${row.sourceInvoiceId ?? "x"}-${row.sourceLineId ?? "y"}-${idx}`} className="border-b border-[var(--gbp-border)]">
                        <td className="px-3 py-2 text-xs text-[var(--gbp-text2)]">{row.status}</td>
                        <td className="px-3 py-2 text-xs text-[var(--gbp-text)]">{row.raw.vendor ?? "-"}</td>
                        <td className="px-3 py-2 text-xs text-[var(--gbp-text)]">{row.raw.invoiceNumber ?? "-"}</td>
                        <td className="px-3 py-2 text-xs font-semibold text-[var(--gbp-accent)]">{row.mapped.targetCode ?? "-"}</td>
                        <td className="px-3 py-2 text-xs text-[var(--gbp-text2)]">{row.mapped.description ?? "-"}</td>
                        <td className="px-3 py-2 text-xs text-[var(--gbp-text)]">{row.mapped.lineAmount ?? "-"}</td>
                        <td className="px-3 py-2 text-xs text-[var(--gbp-text)]">{row.mapped.taxAmount ?? "-"}</td>
                        <td className="px-3 py-2 text-xs text-[var(--gbp-text)]">{row.mapped.totalAmount ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Stat Cards */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4 transition hover:shadow-[var(--gbp-shadow-md)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${toneClass(card.tone)}`}>{card.value}</p>
            <p className="mt-1 text-xs text-[var(--gbp-muted)]">{card.subLabel}</p>
          </article>
        ))}
      </section>

      {/* Connection Cards */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        <article className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${connDot(conns.qbo.status)}`} />
            <p className="text-sm font-bold text-[var(--gbp-text)]">QuickBooks Online</p>
            <span className="ml-auto rounded-full bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--gbp-text2)]">{connLabel(conns.qbo.status)}</span>
          </div>
          {conns.qbo.realmId && <p className="mt-2 text-xs text-[var(--gbp-text2)]">Realm: {String(conns.qbo.realmId).slice(0, 12)}...</p>}
          {conns.qbo.lastRefreshed && <p className="mt-1 text-[11px] text-[var(--gbp-muted)]">Última actualización: {relativeTime(conns.qbo.lastRefreshed)}</p>}
          <button
            type="button"
            disabled={oauthConnecting}
            onClick={handleConnectQbo}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
          >
            <Link2 className="h-3.5 w-3.5" /> {oauthConnecting ? "Conectando..." : (conns.qbo.status === "connected" ? "Reconectar QBO" : "Conectar QBO")}
          </button>
        </article>
        <article className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${connDot(conns.ftp.status)}`} />
            <p className="text-sm font-bold text-[var(--gbp-text)]">Restaurant365 FTP</p>
            <span className="ml-auto rounded-full bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--gbp-text2)]">{connLabel(conns.ftp.status)}</span>
          </div>
          {conns.ftp.host && <p className="mt-2 text-xs text-[var(--gbp-text2)]">Host: {String(conns.ftp.host)}</p>}
        </article>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Historial de Facturas</h2>
        <div className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">
                  <th className="px-4 py-3">Factura</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Enviada</th>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Mapped Code</th>
                  <th className="px-4 py-3">Vistas</th>
                  <th className="px-4 py-3">Ultima vez</th>
                </tr>
              </thead>
              <tbody>
                {invoiceHistory.map((item) => (
                  <tr key={item.sourceInvoiceId} className="border-b border-[var(--gbp-border)]">
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text)]">{item.invoiceNumber ?? item.sourceInvoiceId}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{item.vendor ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{itemStatusLabel(item.lastStatus)}</td>
                    <td className="px-4 py-3 text-xs">
                      {item.sentToR365
                        ? <span className="rounded-full bg-[var(--gbp-success-soft)] px-2 py-0.5 font-bold text-[var(--gbp-success)]">Si</span>
                        : <span className="rounded-full bg-[var(--gbp-bg)] px-2 py-0.5 font-bold text-[var(--gbp-text2)]">No</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{templateLabel(item.templateMode)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[var(--gbp-accent)]">{item.mappedCode ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{item.timesSeen}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{new Date(item.lastSeenAt).toLocaleString("es-AR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!invoiceHistory.length && (
            <EmptyState icon={Search} title="Sin historial de facturas" description="Aun no hay facturas procesadas para mostrar." />
          )}
        </div>
      </section>

      {/* Runs Table */}
      <section>
        <h2 className="mb-3 text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Historial de Sincronizaciones</h2>
        <div className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--gbp-border)] px-4 py-3">
            <p className="mr-auto text-sm font-bold text-[var(--gbp-text)]">Todas las corridas</p>
            <label className="inline-flex w-full items-center gap-2 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 sm:w-auto">
              <Search className="h-4 w-4 text-[var(--gbp-muted)]" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar..."
                className="h-9 w-full min-w-0 bg-transparent text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:outline-none sm:w-[170px]" />
            </label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm text-[var(--gbp-text2)]">
              <option value="">Todos los estados</option>
              <option value="completed">Completado</option>
              <option value="completed_with_errors">Parcial</option>
              <option value="failed">Error</option>
              <option value="running">En curso</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Detectadas</th>
                  <th className="px-4 py-3">Enviadas</th>
                  <th className="px-4 py-3">Errores</th>
                  <th className="px-4 py-3">Archivo</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run) => {
                  const dateObj = new Date(run.startedAt);
                  const dateLabel = dateObj.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
                  const timeLabel = dateObj.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <tr key={run.id} onClick={() => setSelectedRunId(run.id)}
                      className="cursor-pointer border-b border-[var(--gbp-border)] transition hover:bg-[var(--gbp-bg)]">
                      <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{dateLabel} · {timeLabel}</td>
                      <td className="px-4 py-3">{statusBadge(run.status)}{run.dryRun && <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-500">DRY</span>}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-[var(--gbp-text2)]">{templateLabel(run.templateMode)}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--gbp-text2)]">{triggerLabel(run.triggerSource)}</span></td>
                      <td className="px-4 py-3 text-sm font-semibold text-[var(--gbp-text)]">{run.invoicesDetected}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[var(--gbp-success)]">{run.invoicesUploaded}</td>
                      <td className="px-4 py-3">{run.invoicesFailed > 0
                        ? <span className="inline-flex h-5 items-center gap-1 rounded bg-[var(--gbp-error-soft)] px-1.5 text-[10px] font-extrabold text-[var(--gbp-error)]">⚑ {run.invoicesFailed}</span>
                        : <span className="text-[11px] font-bold text-[var(--gbp-success)]">✓</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--gbp-muted)]">{run.fileName ? run.fileName.slice(0, 20) + "..." : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!filteredRuns.length && <EmptyState icon={Link2} title="Sin sincronizaciones" description="No se encontraron corridas para los filtros aplicados." />}
        </div>
      </section>

      {/* Side Panel */}
      {selectedRun && (
        <>
          <button type="button" onClick={() => setSelectedRunId(null)} className="fixed inset-0 z-[150] bg-black/40" />
          <aside className="fixed inset-y-0 right-0 z-[151] flex w-full max-w-[520px] flex-col bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-lg)]">
            <header className="flex items-start justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Detalle de Corrida</h3>
                <p className="text-xs text-[var(--gbp-text2)]">{new Date(selectedRun.startedAt).toLocaleString("es-AR")} · {triggerLabel(selectedRun.triggerSource)}</p>
              </div>
              <button type="button" onClick={() => setSelectedRunId(null)}
                className="grid h-8 w-8 place-items-center rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-accent)] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-5 grid grid-cols-3 gap-2">
                <div className="rounded-[10px] bg-[var(--gbp-bg)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Detectadas</p>
                  <p className="text-lg font-bold text-[var(--gbp-text)]">{selectedRun.invoicesDetected}</p>
                </div>
                <div className="rounded-[10px] bg-[var(--gbp-bg)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Enviadas</p>
                  <p className="text-lg font-bold text-[var(--gbp-success)]">{selectedRun.invoicesUploaded}</p>
                </div>
                <div className="rounded-[10px] bg-[var(--gbp-bg)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Errores</p>
                  <p className={`text-lg font-bold ${selectedRun.invoicesFailed > 0 ? "text-[var(--gbp-error)]" : "text-[var(--gbp-muted)]"}`}>{selectedRun.invoicesFailed}</p>
                </div>
              </div>

              <div className="mb-4">{statusBadge(selectedRun.status)}{selectedRun.dryRun && <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-500">Modo Dry Run</span>}</div>

              <div className="space-y-3">
                <div className="rounded-[10px] border border-[var(--gbp-border)] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Archivo generado</p>
                  <p className="mt-1 break-all text-sm text-[var(--gbp-text)]">{selectedRun.fileName ?? "Sin archivo"}</p>
                </div>
                <div className="rounded-[10px] border border-[var(--gbp-border)] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Duplicadas (saltadas)</p>
                  <p className="mt-1 text-sm text-[var(--gbp-text)]">{selectedRun.invoicesSkipped}</p>
                </div>
                {selectedRun.completedAt && (
                  <div className="rounded-[10px] border border-[var(--gbp-border)] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Duración</p>
                    <p className="mt-1 text-sm text-[var(--gbp-text)]">{Math.round((new Date(selectedRun.completedAt).getTime() - new Date(selectedRun.startedAt).getTime()) / 1000)}s</p>
                  </div>
                )}
                {selectedRun.errorMessage && (
                  <div className="rounded-xl border-[1.5px] border-[color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] p-4">
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-[var(--gbp-error)]">Error</p>
                    <p className="break-words text-sm text-[var(--gbp-error)]">{selectedRun.errorMessage}</p>
                  </div>
                )}
              </div>
            </div>
            <footer className="flex gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
              <button type="button" onClick={() => setSelectedRunId(null)}
                className="flex-1 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-surface2)]">
                Cerrar
              </button>
            </footer>
          </aside>
        </>
      )}

      {/* Config Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <button type="button" onClick={() => setIsConfigOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[20px] bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-xl)]">
            <header className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-4">
              <h3 className="text-xl font-bold tracking-tight text-[var(--gbp-text)]">Credenciales de Integración</h3>
              <button type="button" onClick={() => setIsConfigOpen(false)} className="rounded-lg p-1.5 text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]">
                <X className="h-5 w-5" />
              </button>
            </header>
            <form action={async (fd) => {
              setIsSavingConfig(true);
              const res = await saveIntegrationConfigAction(fd);
              setIsSavingConfig(false);
              if (res.status === "success") {
                toast.success("Configuracion guardada", {
                  description: "Credenciales y parametros actualizados correctamente.",
                });
                setIsConfigOpen(false);
              } else {
                toast.error("No se pudo guardar la configuracion", {
                  description: res.message,
                });
              }
            }}>
              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                <div className="mb-6 space-y-4 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4">
                  <h4 className="text-sm font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">QuickBooks Online</h4>
                  {isLoadingConfig && <p className="text-[11px] text-[var(--gbp-muted)]">Cargando configuracion guardada...</p>}
                  <p className="text-xs text-[var(--gbp-text2)]">
                    Las credenciales developer de QuickBooks se administran de forma global por Super Admin.
                    Desde esta pantalla solo necesitas conectar tu empresa con el boton <strong>Conectar QBO</strong>.
                  </p>
                </div>

                <div className="mb-2 space-y-4">
                  {mode === "developer" && (
                    <div className="mb-6 space-y-4 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4">
                      <h4 className="text-sm font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">Parametros de mapeo (Developer)</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Template</span>
                          <select
                            name="settingsTemplate"
                            value={configTemplate}
                            onChange={(e) => setConfigTemplate(e.target.value as "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates")}
                            className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none"
                          >
                            <option value="by_item">by_item</option>
                            <option value="by_item_service_dates">by_item_service_dates</option>
                            <option value="by_account">by_account</option>
                            <option value="by_account_service_dates">by_account_service_dates</option>
                          </select>
                        </label>
                        <p className="pt-8 text-[11px] text-[var(--gbp-muted)]">Solo cambia como se calcula el <code>Mapped Code</code> (item vs cuenta).</p>
                      </div>
                    </div>
                  )}

                  <h4 className="text-sm font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">Restaurant365 FTP</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Host</span>
                      <input name="ftpHost" type="text" className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Usuario</span>
                      <input name="ftpUsername" type="text" className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Contraseña</span>
                      <input name="ftpPassword" type="password" className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Puerto</span>
                      <input name="ftpPort" type="number" defaultValue={21} className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Remote Path</span>
                      <input name="ftpRemotePath" type="text" defaultValue="/APImports/R365" className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                    </label>
                    <div className="flex items-center gap-3 pt-6">
                      <input name="ftpSecure" type="checkbox" value="true" defaultChecked className="h-5 w-5 rounded border-[var(--gbp-border)] accent-[var(--gbp-accent)]" />
                      <span className="text-sm font-bold text-[var(--gbp-text)]">Usar conexión segura (FTPS/SFTP)</span>
                    </div>
                  </div>
                </div>
              </div>
              <footer className="flex gap-3 border-t-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-6 py-4">
                <button type="button" onClick={() => setIsConfigOpen(false)}
                  className="flex-1 rounded-lg border-[1.5px] border-[var(--gbp-border)] px-4 py-2.5 text-sm font-bold text-[var(--gbp-text)] transition hover:bg-[var(--gbp-surface2)]">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingConfig}
                  className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--gbp-accent-hover)] disabled:opacity-50">
                  {isSavingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar Credenciales"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

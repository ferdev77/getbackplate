"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Search, X, RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2, Plus, Play, Trash2, Pause, Eye, ChevronDown, ChevronUp, Server } from "lucide-react";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { EmptyState } from "@/shared/ui/empty-state";
import { saveIntegrationConfigAction } from "@/modules/integrations/qbo-r365/actions";
import { toast } from "sonner";

type StatCard = { label: string; value: string; subLabel: string; tone: "default" | "success" | "warning" | "muted" };
type ConnectionInfo = { status: string; realmId?: string | null; host?: string | null; lastRefreshed?: string | null };
type RunRow = {
  id: string; startedAt: string; completedAt: string | null; status: string; triggerSource: string;
  invoicesDetected: number; invoicesUploaded: number; invoicesSkipped: number; invoicesFailed: number;
  syncConfigId?: string | null;
  fileName: string | null; templateMode?: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null; dryRun: boolean; errorMessage: string | null;
};
type DashboardData = {
  generatedAt: string;
  connections: { qbo: ConnectionInfo; ftp: ConnectionInfo };
  statCards: StatCard[];
  statCardsByMode?: { operation: StatCard[]; developer: StatCard[] };
  runs: RunRow[];
  invoiceHistory: Array<{
    sourceInvoiceId: string;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    totalAmount: number | null;
    currency: string | null;
    transactionTypeCode: "1" | "2" | null;
    qboBalance: number | null;
    qboPaymentStatus: "paid" | "unpaid" | "partial" | "not_applicable" | "unknown" | null;
    qboStatusRaw: string | null;
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
type InvoiceLineDetail = {
  sourceLineId: string;
  targetCode: string | null;
  sourceItemCode: string | null;
  sku: string | null;
  itemName: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineAmount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  location: string | null;
  memo: string | null;
  status: string;
  runId: string;
};
type InvoiceDetailData = {
  sourceInvoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  vendor: string | null;
  currency: string | null;
  transactionTypeCode: "1" | "2" | null;
  qboBalance: number | null;
  qboPaymentStatus: string | null;
  qboStatusRaw: string | null;
  poNumber: string | null;
  terms: string | null;
  memo: string | null;
  lines: InvoiceLineDetail[];
  subtotal: number;
  totalTax: number;
  grandTotal: number;
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
    incrementalLookbackHours?: number;
  };
  qbo?: {
    useSandbox?: boolean;
  };
};
type SyncConfigSummary = {
  id: string;
  name: string;
  qboCustomerId: string;
  qboCustomerName: string;
  scheduleInterval: "manual" | "daily" | "weekly";
  template: string;
  taxMode: string;
  status: "active" | "paused";
  lastRunAt: string | null;
  hasFtp: boolean;
  createdAt: string;
};

type QboCustomer = { id: string; displayName: string };

type Props = { organizationId: string; deferredDataUrl: string; showDeveloperMode?: boolean; className?: string };

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

function formatQboDate(value: string | null | undefined) {
  if (!value) return "-";
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}$/);
  if (dateOnly) {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    return new Date(year, month - 1, day).toLocaleDateString("es-AR");
  }
  return new Date(value).toLocaleDateString("es-AR");
}

function formatCurrencyLabel(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  if (normalized === "usd" || normalized === "us dollar" || normalized === "united states dollar" || normalized === "dolar estadounidense") {
    return "USD";
  }
  return value;
}

function qboPaymentStatusLabel(status: "paid" | "unpaid" | "partial" | "not_applicable" | "unknown" | null) {
  if (status === "paid") return "Pagada";
  if (status === "partial") return "Parcial";
  if (status === "unpaid") return "Sin pagar";
  if (status === "not_applicable") return "No aplica";
  return "Sin dato";
}

function invoiceTypeLabel(code: "1" | "2" | null) {
  if (code === "2") return "Nota de credito";
  if (code === "1") return "Factura";
  return "Sin dato";
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

type TemplateCol = { col: string; r365Name: string; qboSource: string; scope: "header" | "detail"; highlight?: boolean };
const TEMPLATE_COLS: Record<"by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates", TemplateCol[]> = {
  by_item: [
    { col: "A", r365Name: "Vendor", qboSource: "CustomerRef.name", scope: "header" },
    { col: "B", r365Name: "Location", qboSource: "N° cuenta R365", scope: "header", highlight: true },
    { col: "C", r365Name: "Document Number", qboSource: "DocNumber", scope: "header" },
    { col: "D", r365Name: "Date", qboSource: "TxnDate", scope: "header" },
    { col: "E", r365Name: "Gl Date", qboSource: "TxnDate", scope: "detail" },
    { col: "F", r365Name: "Vendor Item Number", qboSource: "ItemRef → SKU", scope: "detail", highlight: true },
    { col: "G", r365Name: "Vendor Item Name", qboSource: "Line.Description", scope: "detail" },
    { col: "H", r365Name: "UofM", qboSource: "—", scope: "detail" },
    { col: "I", r365Name: "Qty", qboSource: "SalesItemLineDetail.Qty", scope: "detail" },
    { col: "J", r365Name: "Unit Price", qboSource: "SalesItemLineDetail.UnitPrice", scope: "detail" },
    { col: "K", r365Name: "Total", qboSource: "Line.Amount", scope: "detail" },
    { col: "L", r365Name: "Break Flag", qboSource: "—", scope: "detail" },
  ],
  by_item_service_dates: [
    { col: "A", r365Name: "Vendor", qboSource: "CustomerRef.name", scope: "header" },
    { col: "B", r365Name: "Location", qboSource: "N° cuenta R365", scope: "header", highlight: true },
    { col: "C", r365Name: "Document Number", qboSource: "DocNumber", scope: "header" },
    { col: "D", r365Name: "Date", qboSource: "TxnDate", scope: "header" },
    { col: "E", r365Name: "Gl Date", qboSource: "TxnDate", scope: "detail" },
    { col: "F", r365Name: "Vendor Item Number", qboSource: "ItemRef → SKU", scope: "detail", highlight: true },
    { col: "G", r365Name: "Vendor Item Name", qboSource: "Line.Description", scope: "detail" },
    { col: "H", r365Name: "UofM", qboSource: "—", scope: "detail" },
    { col: "I", r365Name: "Qty", qboSource: "SalesItemLineDetail.Qty", scope: "detail" },
    { col: "J", r365Name: "Unit Price", qboSource: "SalesItemLineDetail.UnitPrice", scope: "detail" },
    { col: "K", r365Name: "Total", qboSource: "Line.Amount", scope: "detail" },
    { col: "L", r365Name: "Break Flag", qboSource: "—", scope: "detail" },
    { col: "M", r365Name: "Start Date of Service", qboSource: "—", scope: "detail" },
    { col: "N", r365Name: "End Date of Service", qboSource: "—", scope: "detail" },
  ],
  by_account: [
    { col: "A", r365Name: "Type", qboSource: "TransactionType (1/2)", scope: "header" },
    { col: "B", r365Name: "Location", qboSource: "N° cuenta R365", scope: "header", highlight: true },
    { col: "C", r365Name: "Vendor", qboSource: "CustomerRef.name", scope: "header" },
    { col: "D", r365Name: "Number", qboSource: "DocNumber", scope: "header" },
    { col: "E", r365Name: "Date", qboSource: "TxnDate", scope: "detail" },
    { col: "F", r365Name: "Gl Date", qboSource: "TxnDate", scope: "detail" },
    { col: "G", r365Name: "Amount", qboSource: "TotalAmt (invoice total)", scope: "detail" },
    { col: "H", r365Name: "Payment Terms", qboSource: "—", scope: "detail" },
    { col: "I", r365Name: "Due Date", qboSource: "DueDate", scope: "detail" },
    { col: "J", r365Name: "Comment", qboSource: "PrivateNote / Memo", scope: "detail" },
    { col: "K", r365Name: "Detail Account", qboSource: "AccountRef → R365 code", scope: "detail", highlight: true },
    { col: "L", r365Name: "Detail Amount", qboSource: "Line.Amount", scope: "detail" },
    { col: "M", r365Name: "Detail Location", qboSource: "N° cuenta R365", scope: "detail", highlight: true },
    { col: "N", r365Name: "Detail Comment", qboSource: "Line.Description", scope: "detail" },
  ],
  by_account_service_dates: [
    { col: "A", r365Name: "Type", qboSource: "TransactionType (1/2)", scope: "header" },
    { col: "B", r365Name: "Location", qboSource: "N° cuenta R365", scope: "header", highlight: true },
    { col: "C", r365Name: "Vendor", qboSource: "CustomerRef.name", scope: "header" },
    { col: "D", r365Name: "Number", qboSource: "DocNumber", scope: "header" },
    { col: "E", r365Name: "Date", qboSource: "TxnDate", scope: "detail" },
    { col: "F", r365Name: "Gl Date", qboSource: "TxnDate", scope: "detail" },
    { col: "G", r365Name: "Amount", qboSource: "TotalAmt (invoice total)", scope: "detail" },
    { col: "H", r365Name: "Payment Terms", qboSource: "—", scope: "detail" },
    { col: "I", r365Name: "Due Date", qboSource: "DueDate", scope: "detail" },
    { col: "J", r365Name: "Comment", qboSource: "PrivateNote / Memo", scope: "detail" },
    { col: "K", r365Name: "Detail Account", qboSource: "AccountRef → R365 code", scope: "detail", highlight: true },
    { col: "L", r365Name: "Detail Amount", qboSource: "Line.Amount", scope: "detail" },
    { col: "M", r365Name: "Detail Location", qboSource: "N° cuenta R365", scope: "detail", highlight: true },
    { col: "N", r365Name: "Detail Comment", qboSource: "Line.Description", scope: "detail" },
    { col: "O", r365Name: "Start Date of Service", qboSource: "—", scope: "detail" },
    { col: "P", r365Name: "End Date of Service", qboSource: "—", scope: "detail" },
  ],
};

export function QboR365Dashboard({ organizationId, deferredDataUrl, showDeveloperMode = false, className }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetailData | null>(null);
  const [invoiceDetailLoading, setInvoiceDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [mode, setMode] = useState<"operation" | "developer">("operation");
  const [preparing, setPreparing] = useState(false);
  const [sendingPrepared, setSendingPrepared] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [invoiceDetailRefreshKey, setInvoiceDetailRefreshKey] = useState(0);
  const [invoiceTemplate, setInvoiceTemplate] = useState<"by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates">("by_item");
  const [showMappingPreview, setShowMappingPreview] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][]; rowCount: number } | null>(null);
  const [previewingCsv, setPreviewingCsv] = useState(false);
  const [showInvoiceFtp, setShowInvoiceFtp] = useState(false);
  const [invoiceFtpHost, setInvoiceFtpHost] = useState("");
  const [invoiceFtpUser, setInvoiceFtpUser] = useState("");
  const [invoiceFtpPass, setInvoiceFtpPass] = useState("");
  const [invoiceFtpPath, setInvoiceFtpPath] = useState("/APImports/R365");
  const [invoiceFtpSecure, setInvoiceFtpSecure] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"raw" | "json" | "csv" | "txt" | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isSavingSandbox, setIsSavingSandbox] = useState(false);
  const [configUseSandbox, setConfigUseSandbox] = useState<boolean>(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync configs
  const [syncConfigs, setSyncConfigs] = useState<SyncConfigSummary[]>([]);
  const [syncConfigsLoading, setSyncConfigsLoading] = useState(false);
  const [isCreateSyncOpen, setIsCreateSyncOpen] = useState(false);
  const [runningSyncId, setRunningSyncId] = useState<string | null>(null);
  const [deletingSyncId, setDeletingSyncId] = useState<string | null>(null);
  // Form state for new sync config
  const [newSyncCustomerId, setNewSyncCustomerId] = useState("");
  const [newSyncCustomerName, setNewSyncCustomerName] = useState("");
  const [newSyncSchedule, setNewSyncSchedule] = useState<"manual" | "daily" | "weekly">("daily");
  const [newSyncLookbackHours, setNewSyncLookbackHours] = useState<number>(48);
  const [newSyncTemplate, setNewSyncTemplate] = useState<"by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates">("by_item");
  const [newSyncTaxMode, setNewSyncTaxMode] = useState<"line" | "header" | "none">("none");
  const [newSyncFtpHost, setNewSyncFtpHost] = useState("");
  const [newSyncFtpUser, setNewSyncFtpUser] = useState("");
  const [newSyncFtpPass, setNewSyncFtpPass] = useState("");
  const [newSyncFtpPath, setNewSyncFtpPath] = useState("/APImports/R365");
  const [newSyncFtpSecure, setNewSyncFtpSecure] = useState(false);
  const [isSavingSync, setIsSavingSync] = useState(false);
  const [qboCustomers, setQboCustomers] = useState<QboCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  // Historial filtrado por sync config
  const [syncHistoryFilter, setSyncHistoryFilter] = useState<{ id: string; name: string } | null>(null);
  const [syncHistoryItems, setSyncHistoryItems] = useState<DashboardData["invoiceHistory"]>([]);
  const [syncHistoryLoading, setSyncHistoryLoading] = useState(false);
  const [developerSyncConfigId, setDeveloperSyncConfigId] = useState<string>("");
  const [developerRunId, setDeveloperRunId] = useState<string | null>(null);
  const hasLoadedSyncConfigsRef = useRef(false);
  const invoiceHistorySectionRef = useRef<HTMLElement>(null);

  // Leer resultado del callback OAuth desde la URL y limpiarla
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const message = params.get("message");
    if (!status) return;
    window.history.replaceState({}, "", "/app/integrations/quickbooks");
    if (status === "ok") {
      toast.success("QuickBooks conectado", {
        description: "La conexión con QuickBooks Online se realizó correctamente.",
      });
    } else if (status === "error") {
      toast.error("Error al conectar QuickBooks", {
        description: message ?? "No se pudo completar la conexión.",
      });
    }
  }, []);

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
    if (mode !== "developer") return;
    const ctrl = new AbortController();
    void fetch("/api/company/integrations/qbo-r365/config", { cache: "no-store", signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (ctrl.signal.aborted) return;
        const snap = d as ConfigSnapshot;
        setConfigUseSandbox(snap.qbo?.useSandbox ?? false);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [mode]);

  // Cargar sync configs al montar
  useEffect(() => {
    if (!hasLoadedSyncConfigsRef.current) {
      setSyncConfigsLoading(true);
    }
    void fetch("/api/company/integrations/qbo-r365/sync-configs", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { configs?: SyncConfigSummary[] }) => {
        const configs = d.configs ?? [];
        setSyncConfigs(configs);
        hasLoadedSyncConfigsRef.current = true;
        setDeveloperSyncConfigId((prev) => {
          if (prev && configs.some((c) => c.id === prev)) return prev;
          return configs[0]?.id ?? "";
        });
      })
      .catch(() => {})
      .finally(() => setSyncConfigsLoading(false));
  }, [refreshKey]);

  // Cargar clientes QBO al abrir el modal
  useEffect(() => {
    if (!isCreateSyncOpen || qboCustomers.length > 0) return;
    setCustomersLoading(true);
    void fetch("/api/company/integrations/qbo-r365/customers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { customers?: QboCustomer[] }) => setQboCustomers(d.customers ?? []))
      .catch(() => {})
      .finally(() => setCustomersLoading(false));
  }, [isCreateSyncOpen, qboCustomers.length]);

  async function handleRunSyncConfig(id: string, dryRun = false) {
    setRunningSyncId(id);
    try {
      const response = await fetch(`/api/company/integrations/qbo-r365/sync-configs/${id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; runId?: string };
      if (!response.ok) throw new Error(payload.error || "Error en sincronizacion");
      toast.success("Sincronizacion ejecutada", {
        description: payload.runId ? `Corrida ${payload.runId.slice(0, 8)} completada.` : "Revisa el historial.",
      });
      setRefreshKey((p) => p + 1);
      return payload.runId ?? null;
    } catch (error) {
      toast.error("No se pudo ejecutar", { description: error instanceof Error ? error.message : "Error" });
      return null;
    } finally {
      setRunningSyncId(null);
    }
  }

  async function handleToggleSyncStatus(config: SyncConfigSummary) {
    const newStatus = config.status === "active" ? "paused" : "active";
    try {
      const response = await fetch(`/api/company/integrations/qbo-r365/sync-configs/${config.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error("Error al actualizar");
      setSyncConfigs((prev) => prev.map((c) => c.id === config.id ? { ...c, status: newStatus } : c));
    } catch {
      toast.error("No se pudo cambiar el estado");
    }
  }

  async function handleDeleteSyncConfig(id: string) {
    if (!confirm("¿Eliminar esta sincronización? Los runs históricos quedarán sin referencia.")) return;
    setDeletingSyncId(id);
    try {
      const response = await fetch(`/api/company/integrations/qbo-r365/sync-configs/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Error al eliminar");
      setSyncConfigs((prev) => prev.filter((c) => c.id !== id));
      toast.success("Sincronización eliminada");
    } catch {
      toast.error("No se pudo eliminar");
    }
    setDeletingSyncId(null);
  }

  function handleCustomerPick(customer: QboCustomer) {
    setNewSyncCustomerId(customer.id);
    setNewSyncCustomerName(customer.displayName);
    setCustomerSearch(customer.displayName);
    setCustomerDropdownOpen(false);
  }

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return qboCustomers;
    return qboCustomers.filter((c) => c.displayName.toLowerCase().includes(q));
  }, [qboCustomers, customerSearch]);

  async function handleCreateSync(e: React.FormEvent) {
    e.preventDefault();
    if (!newSyncCustomerId) { toast.error("Selecciona un cliente QBO"); return; }
    setIsSavingSync(true);
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/sync-configs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          developerMode: mode === "developer",
          name: newSyncCustomerName,
          qboCustomerId: newSyncCustomerId,
          qboCustomerName: newSyncCustomerName,
          scheduleInterval: newSyncSchedule,
          lookbackHours: newSyncLookbackHours,
          template: newSyncTemplate,
          taxMode: newSyncTaxMode,
          r365FtpHost: newSyncFtpHost,
          r365FtpPort: 21,
          r365FtpUsername: newSyncFtpUser,
          r365FtpPassword: newSyncFtpPass,
          r365FtpRemotePath: newSyncFtpPath,
          r365FtpSecure: newSyncFtpSecure,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!response.ok) throw new Error(payload.error || "Error al crear");
      toast.success("Sincronización creada");
      setIsCreateSyncOpen(false);
      setNewSyncCustomerId(""); setNewSyncCustomerName("");
      setCustomerSearch(""); setCustomerDropdownOpen(false);
      setNewSyncFtpHost(""); setNewSyncFtpUser(""); setNewSyncFtpPass("");
      setRefreshKey((p) => p + 1);
    } catch (error) {
      toast.error("No se pudo crear", { description: error instanceof Error ? error.message : "Error" });
    }
    setIsSavingSync(false);
  }

  async function handleViewSyncHistory(config: SyncConfigSummary) {
    setSyncHistoryFilter({ id: config.id, name: config.name });
    setSyncHistoryItems([]);
    setSyncHistoryLoading(true);
    try {
      const response = await fetch(`/api/company/integrations/qbo-r365/sync-configs/${config.id}/invoice-history`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { items?: DashboardData["invoiceHistory"]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Error al cargar historial");
      setSyncHistoryItems(payload.items ?? []);
    } catch (error) {
      toast.error("No se pudo cargar el historial", { description: error instanceof Error ? error.message : "Error" });
      setSyncHistoryFilter(null);
    }
    setSyncHistoryLoading(false);
    setTimeout(() => invoiceHistorySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  async function handleSandboxToggle(checked: boolean) {
    setConfigUseSandbox(checked);
    setIsSavingSandbox(true);
    try {
      const fd = new FormData();
      fd.append("__sandboxVisible", "1");
      if (checked) fd.append("useSandboxQbo", "true");
      const res = await saveIntegrationConfigAction(fd);
      if (res.status !== "success") {
        toast.error("No se pudo guardar", { description: res.message });
      } else {
        toast.success("Modo QBO actualizado", { description: res.message });
      }
    } catch {
      toast.error("No se pudo guardar el modo sandbox");
    }
    setIsSavingSandbox(false);
  }

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
  const selectedInvoice = useMemo(
    () => data?.invoiceHistory.find((item) => item.sourceInvoiceId === selectedInvoiceId) ?? null,
    [data, selectedInvoiceId],
  );

  useEffect(() => {
    if (!selectedInvoiceId) {
      setInvoiceDetail(null);
      return;
    }
    setInvoiceDetail(null);
    setInvoiceDetailLoading(true);
    fetch(`/api/company/integrations/qbo-r365/invoice-detail?sourceInvoiceId=${encodeURIComponent(selectedInvoiceId)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((payload: { detail?: InvoiceDetailData; error?: string }) => {
        if (payload.detail) setInvoiceDetail(payload.detail);
      })
      .catch(() => { /* silencioso */ })
      .finally(() => setInvoiceDetailLoading(false));
  }, [selectedInvoiceId, invoiceDetailRefreshKey]);

  useEffect(() => {
    if (!selectedInvoiceId) return;
    const inv = data?.invoiceHistory.find((i) => i.sourceInvoiceId === selectedInvoiceId)
      ?? syncHistoryItems.find((i) => i.sourceInvoiceId === selectedInvoiceId);
    setInvoiceTemplate(inv?.templateMode ?? "by_item");
    setShowMappingPreview(false);
    setCsvPreview(null);
    setPreviewingCsv(false);
    setShowInvoiceFtp(false);
    setInvoiceFtpHost("");
    setInvoiceFtpUser("");
    setInvoiceFtpPass("");
    setInvoiceFtpPath("/APImports/R365");
    setInvoiceFtpSecure(false);
  }, [selectedInvoiceId]);

  const selectedDeveloperSync = useMemo(
    () => syncConfigs.find((config) => config.id === developerSyncConfigId) ?? null,
    [syncConfigs, developerSyncConfigId],
  );

  const developerRunForExport = useMemo(() => {
    if (developerRunId) {
      const run = data?.runs?.find((entry) => entry.id === developerRunId);
      if (run) return run;
    }
    if (selectedRun) return selectedRun;
    return data?.runs?.[0] ?? null;
  }, [developerRunId, selectedRun, data]);

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
      window.location.href = payload.authorizeUrl;
    } catch (error) {
      presentIntegrationError(normalizeApiError(error, "No se pudo iniciar conexion OAuth"), "oauth");
      setOauthConnecting(false);
    }
  }

  async function handlePrepareBatch() {
    if (!developerSyncConfigId) {
      toast.error("Selecciona una sincronizacion", {
        description: "Primero elige una sincronizacion para traer datos del cliente correcto.",
      });
      return;
    }
    setPreparing(true);
    const loadingToastId = toast.loading("Consultando QuickBooks sandbox", {
      description: "Ejecutando la sincronizacion seleccionada...",
    });
    try {
      const runId = await handleRunSyncConfig(developerSyncConfigId, true);
      if (!runId) {
        throw new Error("No se pudo ejecutar la sincronizacion seleccionada");
      }
      setDeveloperRunId(runId);
      setSelectedRunId(runId);
      toast.dismiss(loadingToastId);
      toast.success("Sincronizacion ejecutada", {
        description: `Run ${runId.slice(0, 8)} listo para preview, envio y exportacion.`,
      });
      setRefreshKey((p) => p + 1);
    } catch (error) {
      toast.dismiss(loadingToastId);
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

  async function handleSendSingleInvoice(
    sourceInvoiceId: string,
    syncConfigId?: string | null,
    ftpOverride?: { host: string; port: number; username: string; password: string; remotePath: string; secure: boolean } | null,
    templateOverride?: string | null,
  ) {
    setSendingInvoice(true);
    const loadingToastId = toast.loading("Enviando factura a R365...");
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/send-invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceInvoiceId,
          syncConfigId: syncConfigId ?? null,
          ftp: ftpOverride ?? null,
          template: templateOverride ?? null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; uploaded?: number; fileName?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo enviar la factura");
      toast.dismiss(loadingToastId);
      toast.success("Factura enviada a R365", {
        description: payload.fileName
          ? `Archivo ${payload.fileName} subido (${payload.uploaded ?? 0} líneas).`
          : "Enviado correctamente.",
      });
      setRefreshKey((p) => p + 1);
      setInvoiceDetailRefreshKey((p) => p + 1);
    } catch (error) {
      toast.dismiss(loadingToastId);
      toast.error("No se pudo enviar la factura", {
        description: error instanceof Error ? error.message : "Error",
      });
    }
    setSendingInvoice(false);
  }

  async function handlePreviewCsv(sourceInvoiceId: string, syncConfigId: string | null, template: string) {
    setPreviewingCsv(true);
    setCsvPreview(null);
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/preview-invoice-csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceInvoiceId, syncConfigId, template }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        headers?: string[];
        rows?: string[][];
        rowCount?: number;
      };
      if (!response.ok) throw new Error(payload.error || "No se pudo generar la previsualización");
      setCsvPreview({ headers: payload.headers ?? [], rows: payload.rows ?? [], rowCount: payload.rowCount ?? 0 });
    } catch (error) {
      toast.error("No se pudo previsualizar", {
        description: error instanceof Error ? error.message : "Error",
      });
    }
    setPreviewingCsv(false);
  }

  async function handleInvoiceExport(format: "csv" | "json" | "pdf" | "txt") {
    if (!invoiceDetail) return;
    const inv = invoiceDetail;
    const safeName = (inv.invoiceNumber ?? inv.sourceInvoiceId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const curLabel = formatCurrencyLabel(inv.currency);
    const cur = curLabel ? ` ${curLabel}` : "";

    if (format === "pdf") {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();

      // Header izquierda
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("FACTURA", 14, 18);

      // Header derecha: N°, Fecha, Terms, Vencimiento
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      let rightY = 13;
      doc.text(`N°`, pageW - 14 - 30, rightY, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.text(`${inv.invoiceNumber ?? inv.sourceInvoiceId}`, pageW - 14, rightY, { align: "right" });
      rightY += 6;
      doc.setFont("helvetica", "bold");
      doc.text("Fecha:", pageW - 14 - 30, rightY, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.text(formatQboDate(inv.invoiceDate), pageW - 14, rightY, { align: "right" });
      if (inv.terms) {
        rightY += 6;
        doc.setFont("helvetica", "bold");
        doc.text("Terms:", pageW - 14 - 30, rightY, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.text(inv.terms, pageW - 14, rightY, { align: "right" });
      }
      rightY += 6;
      doc.setFont("helvetica", "bold");
      doc.text("Venc.:", pageW - 14 - 30, rightY, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.text(formatQboDate(inv.dueDate), pageW - 14, rightY, { align: "right" });

      // Header izquierda: Bill To + PO#
      let leftY = 28;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Bill To", 14, leftY);
      leftY += 6;
      doc.setFont("helvetica", "normal");
      doc.text(inv.vendor ?? "-", 14, leftY);
      if (inv.poNumber ?? inv.memo) {
        leftY += 7;
        doc.setFont("helvetica", "bold");
        doc.text("PO#", 14, leftY);
        leftY += 5;
        doc.setFont("helvetica", "normal");
        doc.text(inv.poNumber ?? inv.memo ?? "-", 14, leftY);
      }

      const tableStartY = Math.max(leftY + 8, rightY + 10);

      // Table
      autoTable(doc, {
        startY: tableStartY,
        head: [["Cant.", "SKU", "Ítem", "Descripción", "Precio", "Importe", "ID QBO"]],
        body: inv.lines.map((l) => {
          const shortName = l.itemName ? l.itemName.split(":").pop()!.trim() : (l.targetCode ?? "-");
          return [
            l.quantity != null ? String(l.quantity) : "-",
            l.sku ?? "-",
            shortName,
            l.description ?? "-",
            l.unitPrice != null ? l.unitPrice.toFixed(2) : "-",
            l.lineAmount != null ? l.lineAmount.toFixed(2) : "-",
            l.targetCode ?? "-",
          ];
        }),
        headStyles: { fillColor: [40, 40, 40], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { halign: "right", cellWidth: 11 },
          1: { halign: "left", cellWidth: 22, textColor: [80, 80, 80], fontSize: 7 },
          4: { halign: "right", cellWidth: 18 },
          5: { halign: "right", cellWidth: 20 },
          6: { halign: "left", cellWidth: 20, textColor: [140, 140, 140], fontSize: 7 },
        },
        styles: { overflow: "linebreak" },
        margin: { left: 14, right: 14 },
      });

      // Totales: debajo de la tabla, separados visualmente, alineados a la derecha
      const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 200);
      const totalsStartY = finalY + 10;
      const labelX = pageW - 14 - 35;
      const valueX = pageW - 14;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text("Subtotal", labelX, totalsStartY, { align: "right" });
      doc.text(inv.subtotal.toFixed(2) + cur, valueX, totalsStartY, { align: "right" });
      doc.text("Impuesto", labelX, totalsStartY + 7, { align: "right" });
      doc.text(inv.totalTax.toFixed(2) + cur, valueX, totalsStartY + 7, { align: "right" });
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.4);
      doc.line(labelX - 5, totalsStartY + 11, valueX, totalsStartY + 11);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text("TOTAL", labelX, totalsStartY + 18, { align: "right" });
      doc.text(inv.grandTotal.toFixed(2) + cur, valueX, totalsStartY + 18, { align: "right" });

      doc.save(`factura-${safeName}.pdf`);
      return;
    }

    let content = "";
    let mime = "";

    if (format === "csv") {
      const esc = (v: string | number | null | undefined) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const curLabel = formatCurrencyLabel(inv.currency);
      const metaRows = [
        ["Factura N°", inv.invoiceNumber ?? inv.sourceInvoiceId ?? ""].map(esc).join(","),
        ["Cliente", inv.vendor ?? ""].map(esc).join(","),
        ["Fecha", formatQboDate(inv.invoiceDate) ?? ""].map(esc).join(","),
        ["Vencimiento", formatQboDate(inv.dueDate) ?? ""].map(esc).join(","),
        ...(inv.terms ? [["Terminos", inv.terms].map(esc).join(",")] : []),
        ...(inv.poNumber ? [["PO#", inv.poNumber].map(esc).join(",")] : []),
        ...(inv.memo ? [["Memo", inv.memo].map(esc).join(",")] : []),
        ["Moneda", curLabel || inv.currency || ""].map(esc).join(","),
        ["Estado QBO", inv.qboStatusRaw ?? inv.qboPaymentStatus ?? ""].map(esc).join(","),
        ["", ""].join(","),
      ];
      const header = ["Cant.", "SKU", "Item", "Descripcion", "Precio", "Importe", "Impuesto", "Total", "ID.QBO"].map(esc).join(",");
      const rows = inv.lines.map((l) => {
        const shortName = l.itemName ? l.itemName.split(":").pop()!.trim() : (l.targetCode ?? "");
        return [l.quantity, l.sku ?? "", shortName, l.description, l.unitPrice?.toFixed(2), l.lineAmount?.toFixed(2), l.taxAmount?.toFixed(2), l.totalAmount?.toFixed(2), l.targetCode].map(esc).join(",");
      });
      rows.push(["", "", "", "SUBTOTAL", inv.subtotal.toFixed(2), "", "", ""].map(esc).join(","));
      rows.push(["", "", "", "IMPUESTO", inv.totalTax.toFixed(2), "", "", ""].map(esc).join(","));
      rows.push(["", "", "", "TOTAL", inv.grandTotal.toFixed(2), "", "", ""].map(esc).join(","));
      content = [...metaRows, header, ...rows].join("\r\n");
      mime = "text/csv;charset=utf-8;";
    } else if (format === "txt") {
      const pad = (s: string, n: number, right = false) => right ? s.slice(0, n).padStart(n) : s.slice(0, n).padEnd(n);
      const sep = "-".repeat(90);
      const hdr = [
        `FACTURA N° ${inv.invoiceNumber ?? inv.sourceInvoiceId}`,
        `Cliente   : ${inv.vendor ?? "-"}`,
        `Fecha     : ${formatQboDate(inv.invoiceDate)}   Vencimiento: ${formatQboDate(inv.dueDate)}`,
        ...(inv.terms ? [`Terms     : ${inv.terms}`] : []),
        ...(inv.poNumber ?? inv.memo ? [`PO#       : ${inv.poNumber ?? inv.memo ?? "-"}`] : []),
        `Estado QBO: ${inv.qboStatusRaw ?? inv.qboPaymentStatus ?? "-"}`,
        sep,
        `${pad("CANT", 6, true)}  ${pad("SKU", 18)}  ${pad("ÍTEM", 28)}  ${pad("DESCRIPCIÓN", 20)}  ${pad("PRECIO", 9, true)}  ${pad("IMPORTE", 10, true)}`,
        sep,
      ];
      const bodyLines = inv.lines.map((l) => {
        const shortName = l.itemName ? l.itemName.split(":").pop()!.trim() : (l.targetCode ?? "-");
        return `${pad(String(l.quantity ?? "-"), 6, true)}  ${pad(l.sku ?? "-", 18)}  ${pad(shortName, 28)}  ${pad(l.description ?? "-", 20)}  ${pad(l.unitPrice?.toFixed(2) ?? "-", 9, true)}  ${pad(l.lineAmount?.toFixed(2) ?? "-", 10, true)}`;
      });
      const ftr = [
        sep,
        `${pad("", 6)}  ${pad("", 32)}  ${pad("", 22)}  ${pad("SUBTOTAL", 9, true)}  ${pad(inv.subtotal.toFixed(2) + cur, 10, true)}`,
        `${pad("", 6)}  ${pad("", 32)}  ${pad("", 22)}  ${pad("IMPUESTO", 9, true)}  ${pad(inv.totalTax.toFixed(2) + cur, 10, true)}`,
        `${pad("", 6)}  ${pad("", 32)}  ${pad("", 22)}  ${pad("TOTAL", 9, true)}  ${pad(inv.grandTotal.toFixed(2) + cur, 10, true)}`,
      ];
      content = [...hdr, ...bodyLines, ...ftr].join("\n");
      mime = "text/plain;charset=utf-8;";
    } else {
      content = JSON.stringify(inv, null, 2);
      mime = "application/json";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `factura-${safeName}.${format === "json" ? "json" : format === "txt" ? "txt" : "csv"}`;
    link.click();
    URL.revokeObjectURL(url);
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
      const invoicesCountHeader = response.headers.get("x-qbo-invoices-count");
      const linesCountHeader = response.headers.get("x-qbo-lines-count");
      const invoicesCount = invoicesCountHeader ? Number(invoicesCountHeader) : null;
      const linesCount = linesCountHeader ? Number(linesCountHeader) : null;
      const fileNameMatch = dispo.match(/filename=\"([^\"]+)\"/i);
      const fileName = fileNameMatch?.[1] || `qbo-r365-export.${format}`;

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(blobUrl);

      toast.success(`Exportacion ${format.toUpperCase()} lista`, {
        description: Number.isFinite(invoicesCount) && Number.isFinite(linesCount)
          ? `Archivo ${fileName} descargado. Facturas: ${invoicesCount} · Lineas exportadas: ${linesCount}.`
          : `Archivo ${fileName} descargado correctamente.`,
      });
    } catch (error) {
      toast.error("No se pudo exportar la corrida", {
        description: normalizeApiError(error, "Error de exportacion"),
      });
    }
    setExportingFormat(null);
  }

  const statCards = data?.statCardsByMode?.[mode] ?? data?.statCards ?? [];
  const conns = data?.connections ?? { qbo: { status: "disconnected" }, ftp: { status: "disconnected" } };
  const invoiceHistory = data?.invoiceHistory ?? [];
  const activeInvoiceHistory = syncHistoryFilter ? syncHistoryItems : invoiceHistory;

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
            {showDeveloperMode && (
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
            )}
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
            <label className="inline-flex items-center gap-2 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)]">
              <span>Sync</span>
              <select
                value={developerSyncConfigId}
                onChange={(e) => setDeveloperSyncConfigId(e.target.value)}
                className="min-w-[170px] bg-transparent text-xs font-semibold text-[var(--gbp-text)] outline-none"
                disabled={syncConfigsLoading || syncConfigs.length === 0}
              >
                {syncConfigs.length === 0 && <option value="">Sin sincronizaciones</option>}
                {syncConfigs.map((config) => (
                  <option key={config.id} value={config.id}>{config.name}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] cursor-pointer select-none">
              {isSavingSandbox
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gbp-muted)]" />
                : <input type="checkbox" checked={configUseSandbox} onChange={(e) => { void handleSandboxToggle(e.target.checked); }} className="h-3.5 w-3.5 accent-[var(--gbp-accent)]" />}
              Sandbox QBO (pruebas)
            </label>
            <button
              type="button"
              disabled={preparing || !developerSyncConfigId}
              onClick={handlePrepareBatch}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${preparing ? "animate-spin" : ""}`} /> 1) Ejecutar sync
            </button>
            <button
              type="button"
              disabled={!developerRunForExport || previewLoading}
              onClick={() => developerRunForExport && handleLoadPreview(developerRunForExport.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
            >
              <Search className="h-3.5 w-3.5" /> 2) Ver preview
            </button>
            <button
              type="button"
              disabled={!developerRunForExport || sendingPrepared}
              onClick={() => developerRunForExport && handleSendPrepared(developerRunForExport.id)}
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

          <p className="mt-2 text-xs text-[var(--gbp-muted)]">
            {selectedDeveloperSync
              ? `Sync activa: ${selectedDeveloperSync.name}. Las acciones 2 y 3 usan el run ${developerRunForExport ? developerRunForExport.id.slice(0, 8) : "mas reciente"}.`
              : "Crea una sincronizacion para poder ejecutar el flujo developer por cliente."}
          </p>
          <p className="mt-1 text-xs text-[var(--gbp-muted)]">
            En Developer, el paso 1 corre en modo prueba (dry run): consulta y mapea datos de QBO sin enviar por FTP.
          </p>

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

      {/* Sincronizaciones */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Sincronizaciones</h2>
          <button
            type="button"
            onClick={() => setIsCreateSyncOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--gbp-accent)]"
          >
            <Plus className="h-3.5 w-3.5" /> Crear sincronización
          </button>
        </div>

        {syncConfigsLoading && (
          <p className="text-sm text-[var(--gbp-muted)]">Cargando...</p>
        )}

        {!syncConfigsLoading && syncConfigs.length === 0 && (
          <div className="rounded-[14px] border-[1.5px] border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-10 text-center">
            <p className="text-sm font-semibold text-[var(--gbp-text2)]">No hay sincronizaciones configuradas</p>
            <p className="mt-1 text-xs text-[var(--gbp-muted)]">Crea una sincronización para enviar facturas de un cliente a R365.</p>
          </div>
        )}

        {syncConfigs.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {syncConfigs.map((config) => (
              <article key={config.id} className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--gbp-text)]">{config.name}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--gbp-text2)]">{config.qboCustomerName}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${config.status === "active" ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]" : "bg-[var(--gbp-bg)] text-[var(--gbp-muted)]"}`}>
                    {config.status === "active" ? "Activa" : "Pausada"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] text-[var(--gbp-text2)]">{config.scheduleInterval}</span>
                  <span className="rounded bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] text-[var(--gbp-text2)]">{config.template}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] ${config.hasFtp ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]" : "bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]"}`}>
                    {config.hasFtp ? "FTP ok" : "Sin FTP"}
                  </span>
                </div>
                {config.lastRunAt && (
                  <p className="mt-2 text-[11px] text-[var(--gbp-muted)]">Última ejecución: {relativeTime(config.lastRunAt)}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={runningSyncId === config.id}
                    onClick={() => handleRunSyncConfig(config.id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[var(--gbp-accent)] disabled:opacity-50"
                  >
                    {runningSyncId === config.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Play className="h-3 w-3" />}
                    Ejecutar
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleViewSyncHistory(config); }}
                    title="Ver historial de facturas"
                    className={`inline-flex items-center justify-center gap-1 rounded-lg border-[1.5px] px-2.5 py-1.5 text-[11px] transition ${syncHistoryFilter?.id === config.id ? "border-[var(--gbp-accent)] bg-[color-mix(in_oklab,var(--gbp-accent)_12%,transparent)] text-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)]"}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSyncStatus(config)}
                    title={config.status === "active" ? "Pausar" : "Activar"}
                    className="inline-flex items-center justify-center rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2.5 py-1.5 text-[11px] text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)]"
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={deletingSyncId === config.id}
                    onClick={() => handleDeleteSyncConfig(config.id)}
                    className="inline-flex items-center justify-center rounded-lg border-[1.5px] border-[var(--gbp-error-soft)] bg-[var(--gbp-error-soft)] px-2.5 py-1.5 text-[11px] text-[var(--gbp-error)] transition hover:opacity-80 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Modal: Crear sincronización */}
      {isCreateSyncOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-4">
              <h3 className="text-base font-bold text-[var(--gbp-text)]">Crear sincronización</h3>
              <button type="button" onClick={() => setIsCreateSyncOpen(false)}
                className="rounded-lg p-1 text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => { void handleCreateSync(e); }} className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
              {/* Cliente QBO */}
              <div>
                <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">Cliente QuickBooks</h4>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Cliente *</span>
                  {customersLoading
                    ? <p className="text-xs text-[var(--gbp-muted)]">Cargando clientes de QBO...</p>
                    : (
                      <div className="relative">
                        <input
                          ref={customerInputRef}
                          type="text"
                          value={customerSearch}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setCustomerDropdownOpen(true);
                            if (!e.target.value) { setNewSyncCustomerId(""); setNewSyncCustomerName(""); }
                          }}
                          onFocus={() => setCustomerDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setCustomerDropdownOpen(false), 150)}
                          placeholder="Buscar cliente..."
                          className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none"
                        />
                        {newSyncCustomerId && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--gbp-success)]">✓</span>
                        )}
                        {customerDropdownOpen && filteredCustomers.length > 0 && (
                          <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-lg">
                            {filteredCustomers.map((c) => (
                              <li
                                key={c.id}
                                onMouseDown={() => handleCustomerPick(c)}
                                className={`cursor-pointer px-3 py-2 text-sm hover:bg-[var(--gbp-bg)] ${newSyncCustomerId === c.id ? "font-bold text-[var(--gbp-accent)]" : "text-[var(--gbp-text)]"}`}
                              >
                                {c.displayName}
                              </li>
                            ))}
                          </ul>
                        )}
                        {customerDropdownOpen && customerSearch.length > 0 && filteredCustomers.length === 0 && (
                          <div className="absolute z-50 mt-1 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-muted)] shadow-lg">
                            Sin resultados
                          </div>
                        )}
                      </div>
                    )}
                </label>
              </div>
              {/* Frecuencia y template */}
              <div>
                <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">Configuración</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Frecuencia</span>
                    <select value={newSyncSchedule} onChange={(e) => setNewSyncSchedule(e.target.value as typeof newSyncSchedule)}
                      className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none">
                      <option value="manual">Manual</option>
                      <option value="daily">Diaria</option>
                      <option value="weekly">Semanal</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Período de búsqueda</span>
                    <select value={newSyncLookbackHours} onChange={(e) => setNewSyncLookbackHours(Number(e.target.value))}
                      className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none">
                      <option value={0}>Todas (sin filtro)</option>
                      <option value={24}>Últimas 24 h</option>
                      <option value={48}>Últimas 48 h</option>
                      <option value={168}>Últimos 7 días</option>
                      <option value={336}>Últimos 14 días</option>
                      <option value={720}>Últimos 30 días</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Template</span>
                    <select value={newSyncTemplate} onChange={(e) => setNewSyncTemplate(e.target.value as typeof newSyncTemplate)}
                      className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none">
                      <option value="by_item">by_item</option>
                      <option value="by_item_service_dates">by_item_service_dates</option>
                      <option value="by_account">by_account</option>
                      <option value="by_account_service_dates">by_account_service_dates</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Tax mode</span>
                    <select value={newSyncTaxMode} onChange={(e) => setNewSyncTaxMode(e.target.value as typeof newSyncTaxMode)}
                      className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none">
                      <option value="none">none</option>
                      <option value="line">line</option>
                      <option value="header">header</option>
                    </select>
                  </label>
                </div>
              </div>
              {/* FTP de R365 */}
              <div>
                <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">R365 FTP del cliente *</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Host</span>
                    <input required={mode !== "developer"} type="text" value={newSyncFtpHost} onChange={(e) => setNewSyncFtpHost(e.target.value)}
                      className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Usuario</span>
                    <input required={mode !== "developer"} type="text" autoComplete="off" data-lpignore="true" value={newSyncFtpUser} onChange={(e) => setNewSyncFtpUser(e.target.value)}
                      className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Contraseña</span>
                    <input required={mode !== "developer"} type="password" autoComplete="new-password" data-lpignore="true" value={newSyncFtpPass} onChange={(e) => setNewSyncFtpPass(e.target.value)}
                      className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Remote Path</span>
                    <input type="text" value={newSyncFtpPath} onChange={(e) => setNewSyncFtpPath(e.target.value)}
                      className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                  </label>
                  <div className="flex items-center gap-2 pt-6">
                    <input type="checkbox" checked={newSyncFtpSecure} onChange={(e) => setNewSyncFtpSecure(e.target.checked)}
                      className="h-5 w-5 rounded border-[var(--gbp-border)] accent-[var(--gbp-accent)]" />
                    <span className="text-sm font-bold text-[var(--gbp-text)]">Conexión segura (FTPS)</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsCreateSyncOpen(false)}
                  className="flex-1 rounded-lg border-[1.5px] border-[var(--gbp-border)] px-4 py-2.5 text-sm font-bold text-[var(--gbp-text)] transition hover:bg-[var(--gbp-bg)]">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingSync}
                  className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50">
                  {isSavingSync ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear sincronización"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="mb-6" ref={invoiceHistorySectionRef}>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Historial de Facturas</h2>
          {syncHistoryFilter && (
            <div className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--gbp-accent)] bg-[color-mix(in_oklab,var(--gbp-accent)_10%,transparent)] pl-3 pr-1.5 py-1">
              <span className="text-[11px] font-bold text-[var(--gbp-accent)]">{syncHistoryFilter.name}</span>
              <button
                type="button"
                onClick={() => { setSyncHistoryFilter(null); setSyncHistoryItems([]); }}
                className="rounded-full p-0.5 text-[var(--gbp-accent)] hover:bg-[var(--gbp-accent)] hover:text-white transition"
                title="Ver todo el historial"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {syncHistoryLoading && <Loader2 className="h-4 w-4 animate-spin text-[var(--gbp-muted)]" />}
        </div>
        <div className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">
                  <th className="px-4 py-3">Fecha factura</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Tipo de factura</th>
                  <th className="px-4 py-3">Estado QBO</th>
                  <th className="px-4 py-3">Estado GBP</th>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Detecciones</th>
                  <th className="px-4 py-3">Ultima vez</th>
                </tr>
              </thead>
              <tbody>
                {activeInvoiceHistory.map((item) => (
                  <tr
                    key={item.sourceInvoiceId}
                    className="cursor-pointer border-b border-[var(--gbp-border)] transition hover:bg-[var(--gbp-bg)]"
                    onClick={() => setSelectedInvoiceId(item.sourceInvoiceId)}
                  >
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text)]">{formatQboDate(item.invoiceDate)}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{item.vendor ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{invoiceTypeLabel(item.transactionTypeCode)}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{item.qboStatusRaw ?? qboPaymentStatusLabel(item.qboPaymentStatus)}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{itemStatusLabel(item.lastStatus)}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{templateLabel(item.templateMode)}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{item.timesSeen}</td>
                    <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{new Date(item.lastSeenAt).toLocaleString("es-AR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!activeInvoiceHistory.length && !syncHistoryLoading && (
            <EmptyState
              icon={Search}
              title={syncHistoryFilter ? `Sin facturas para ${syncHistoryFilter.name}` : "Sin historial de facturas"}
              description={syncHistoryFilter ? "Esta sincronización aún no procesó facturas." : "Aun no hay facturas procesadas para mostrar."}
            />
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
                      <td className="px-4 py-3">{statusBadge(run.status)}{run.dryRun && <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-500">DRY</span>}{developerSyncConfigId && run.syncConfigId === developerSyncConfigId && <span className="ml-1.5 rounded bg-[color-mix(in_oklab,var(--gbp-accent)_12%,transparent)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--gbp-accent)]">SYNC ACTIVA</span>}</td>
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

      {selectedInvoice && (
        <>
          <button
            type="button"
            onClick={() => setSelectedInvoiceId(null)}
            className="fixed inset-0 z-[110] bg-black/30"
            aria-label="Cerrar detalle de factura"
          />
          <aside className="fixed right-0 top-0 z-[120] flex h-full w-full max-w-2xl flex-col border-l-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-xl)]">
            {/* Header */}
            <header className="flex items-start justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Detalle de factura</p>
                <h3 className="mt-1 text-lg font-bold text-[var(--gbp-text)]">
                  {invoiceDetail?.invoiceNumber ?? selectedInvoice.invoiceNumber ?? "Sin numero"}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--gbp-text2)]">
                  {invoiceTypeLabel(invoiceDetail?.transactionTypeCode ?? selectedInvoice.transactionTypeCode)}
                  {(invoiceDetail?.currency ?? selectedInvoice.currency) ? ` · ${formatCurrencyLabel(invoiceDetail?.currency ?? selectedInvoice.currency)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {invoiceDetail && invoiceDetail.lines.length > 0 && (
                  <div className="flex items-center gap-1">
                    {(["csv", "txt", "json", "pdf"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => handleInvoiceExport(fmt)}
                        className="rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)]"
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceId(null)}
                  className="rounded-lg p-1.5 text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              {/* Encabezado estilo invoice */}
              <div className="border-b border-[var(--gbp-border)] px-6 py-5 text-sm">
                {/* Fila 1: Bill To + datos de factura */}
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Bill To</p>
                    <p className="mt-1 text-base font-bold text-[var(--gbp-text)]">{invoiceDetail?.vendor ?? selectedInvoice.vendor ?? "-"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs">
                      <span className="font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Invoice</span>
                      <span className="font-semibold text-[var(--gbp-text)]">{invoiceDetail?.invoiceNumber ?? selectedInvoice.invoiceNumber ?? "-"}</span>
                      <span className="font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Date</span>
                      <span className="text-[var(--gbp-text)]">{formatQboDate(invoiceDetail?.invoiceDate ?? selectedInvoice.invoiceDate)}</span>
                      {(invoiceDetail?.terms) && (
                        <>
                          <span className="font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Terms</span>
                          <span className="text-[var(--gbp-text)]">{invoiceDetail.terms}</span>
                        </>
                      )}
                      <span className="font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Due Date</span>
                      <span className="text-[var(--gbp-text)]">{formatQboDate(invoiceDetail?.dueDate ?? selectedInvoice.dueDate)}</span>
                    </div>
                  </div>
                </div>

                {/* Fila 2: PO# + moneda */}
                {(invoiceDetail?.poNumber ?? invoiceDetail?.memo) && (
                  <div className="mt-3 flex gap-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">PO#</p>
                      <p className="mt-0.5 font-semibold text-[var(--gbp-text)]">{invoiceDetail?.poNumber ?? invoiceDetail?.memo}</p>
                    </div>
                    {(invoiceDetail?.currency ?? selectedInvoice.currency) && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Moneda</p>
                        <p className="mt-0.5 text-[var(--gbp-text)]">{formatCurrencyLabel(invoiceDetail?.currency ?? selectedInvoice.currency)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Fila 3: estados en grid compacto */}
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--gbp-border)] pt-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Estado QBO</p>
                    <p className="mt-0.5 font-semibold text-[var(--gbp-text)]">{invoiceDetail?.qboStatusRaw ?? selectedInvoice.qboStatusRaw ?? qboPaymentStatusLabel(selectedInvoice.qboPaymentStatus)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Estado GBP</p>
                    <p className="mt-0.5 font-semibold text-[var(--gbp-text)]">{itemStatusLabel(selectedInvoice.lastStatus)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Enviada a R365</p>
                    <p className="mt-0.5 font-semibold text-[var(--gbp-text)]">{selectedInvoice.sentToR365 ? "Sí" : "No"}</p>
                  </div>
                  {invoiceDetail?.qboBalance != null && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Balance Due</p>
                      <p className="mt-0.5 font-bold text-[var(--gbp-text)]">{invoiceDetail.qboBalance.toFixed(2)}</p>
                    </div>
                  )}
                </div>

                {/* QBO ID pequeño al fondo */}
                <p className="mt-3 font-mono text-[10px] text-[var(--gbp-muted)]">QBO ID: {selectedInvoice.sourceInvoiceId}</p>
              </div>

              {/* ── Developer pipeline panel (solo modo Developer) ── */}
              {showDeveloperMode && (() => {
                const isMapped =
                  selectedInvoice.sentToR365 ||
                  selectedInvoice.mappedCode != null ||
                  selectedInvoice.lastStatus === "exported" ||
                  selectedInvoice.lastStatus === "uploaded" ||
                  selectedInvoice.lastStatus === "validated" ||
                  selectedInvoice.lastStatus === "skipped_duplicate";
                const isSent = selectedInvoice.sentToR365;

                const mappedLabel = (() => {
                  if (!isMapped) return "Pendiente";
                  const code = selectedInvoice.mappedCode;
                  if (!code) return "Mapeada";
                  return code.length > 18 ? `${code.slice(0, 18)}…` : code;
                })();

                const mappedSub = (() => {
                  if (!isMapped) return "";
                  const tmpl = selectedInvoice.templateMode ? templateLabel(selectedInvoice.templateMode) : "";
                  if (!invoiceDetail) return tmpl;
                  const linesCount = invoiceDetail.lines.length;
                  const lineStr = `${linesCount} línea${linesCount !== 1 ? "s" : ""}`;
                  return tmpl ? `${tmpl} · ${lineStr}` : lineStr;
                })();

                const steps: Array<{ key: string; done: boolean; label: string; meta: string; sub: string }> = [
                  {
                    key: "detected",
                    done: true,
                    label: "Lectura",
                    meta: `${selectedInvoice.timesSeen} detección${selectedInvoice.timesSeen !== 1 ? "es" : ""}`,
                    sub: relativeTime(selectedInvoice.lastSeenAt),
                  },
                  {
                    key: "mapped",
                    done: isMapped,
                    label: "Mapeo",
                    meta: mappedLabel,
                    sub: mappedSub,
                  },
                  {
                    key: "sent",
                    done: isSent,
                    label: "Envío",
                    meta: isSent ? "Enviada a R365" : "Pendiente",
                    sub: isSent ? relativeTime(selectedInvoice.lastSeenAt) : "",
                  },
                ];

                const hasFtpOverride = showInvoiceFtp && invoiceFtpHost.trim().length > 0;
                const templateCols = TEMPLATE_COLS[invoiceTemplate];

                return (
                  <div className="divide-y divide-[var(--gbp-border)] border-b border-[var(--gbp-border)]">

                    {/* ── 1. Pipeline steps ── */}
                    <div className="px-6 py-5">
                      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
                        Pipeline de procesamiento
                      </p>
                      <div className="relative grid grid-cols-3">
                        <div
                          className="absolute top-4 h-0.5 bg-[var(--gbp-border)]"
                          style={{ left: "calc(100% / 6)", right: "calc(100% / 6)" }}
                        />
                        {isMapped && (
                          <div
                            className="absolute top-4 h-0.5 bg-[var(--gbp-success)] transition-all duration-500"
                            style={{ left: "calc(100% / 6)", width: "calc(100% / 3)" }}
                          />
                        )}
                        {isSent && (
                          <div
                            className="absolute top-4 h-0.5 bg-[var(--gbp-success)] transition-all duration-500"
                            style={{ left: "50%", width: "calc(100% / 3)" }}
                          />
                        )}
                        {steps.map((step) => (
                          <div key={step.key} className="flex flex-col items-center gap-1 text-center">
                            <div
                              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                                step.done
                                  ? "border-[var(--gbp-success)] bg-[color-mix(in_oklab,var(--gbp-success)_15%,transparent)]"
                                  : "border-[var(--gbp-border)] bg-[var(--gbp-surface)]"
                              }`}
                            >
                              {step.done
                                ? <CheckCircle2 className="h-4 w-4 text-[var(--gbp-success)]" />
                                : <Clock className="h-3.5 w-3.5 text-[var(--gbp-muted)]" />
                              }
                            </div>
                            <span className={`mt-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${step.done ? "text-[var(--gbp-text)]" : "text-[var(--gbp-muted)]"}`}>
                              {step.label}
                            </span>
                            <span
                              className={`max-w-[90px] truncate text-[11px] font-semibold ${step.done ? "text-[var(--gbp-text)]" : "text-[var(--gbp-text2)]"}`}
                              title={step.meta}
                            >
                              {step.meta}
                            </span>
                            {step.sub && (
                              <span className="text-[10px] text-[var(--gbp-text2)]">{step.sub}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── 2. Template selector + mapping preview + csv preview ── */}
                    <div className="px-6 py-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-muted)]">
                          Template R365
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => { setShowMappingPreview((p) => !p); setCsvPreview(null); }}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-accent)]"
                          >
                            {showMappingPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {showMappingPreview ? "Ocultar columnas" : "Ver columnas"}
                          </button>
                          <button
                            type="button"
                            disabled={previewingCsv}
                            onClick={() => {
                              setCsvPreview(null);
                              setShowMappingPreview(false);
                              handlePreviewCsv(
                                selectedInvoice.sourceInvoiceId,
                                syncHistoryFilter?.id ?? null,
                                invoiceTemplate,
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
                          >
                            {previewingCsv
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Eye className="h-3 w-3" />
                            }
                            {previewingCsv ? "Generando..." : csvPreview ? "Ocultar datos" : "Previsualizar"}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(["by_item", "by_item_service_dates", "by_account", "by_account_service_dates"] as const).map((tmpl) => (
                          <button
                            key={tmpl}
                            type="button"
                            onClick={() => { setInvoiceTemplate(tmpl); setCsvPreview(null); }}
                            className={`rounded-full px-3 py-1 text-[10px] font-bold transition ${
                              invoiceTemplate === tmpl
                                ? "bg-[var(--gbp-accent)] text-white"
                                : "border-[1.5px] border-[var(--gbp-border)] text-[var(--gbp-text2)] hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)]"
                            }`}
                          >
                            {tmpl}
                          </button>
                        ))}
                      </div>

                      {/* Tabla de columnas abstracta */}
                      {showMappingPreview && (
                        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--gbp-border)]">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)]">
                                <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Col</th>
                                <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">R365</th>
                                <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">QBO Fuente</th>
                                <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Alcance</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--gbp-border)]">
                              {templateCols.map((col) => (
                                <tr
                                  key={col.col}
                                  className={col.highlight ? "bg-[color-mix(in_oklab,var(--gbp-accent)_8%,transparent)]" : ""}
                                >
                                  <td className="px-2 py-1.5 font-mono font-bold text-[var(--gbp-text)]">{col.col}</td>
                                  <td className="px-2 py-1.5 text-[var(--gbp-text)]">
                                    {col.r365Name}
                                    {col.highlight && (
                                      <span className="ml-1.5 rounded-sm bg-[var(--gbp-accent)] px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                                        clave
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 font-mono text-[10px] text-[var(--gbp-text2)]">{col.qboSource}</td>
                                  <td className="px-2 py-1.5">
                                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                      col.scope === "header"
                                        ? "bg-blue-50 text-blue-600"
                                        : "bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"
                                    }`}>
                                      {col.scope === "header" ? "Cabecera" : "Detalle"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Previsualización de datos reales en CSV */}
                      {csvPreview && (
                        <div className="mt-3">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[var(--gbp-muted)]">
                              {csvPreview.rowCount} fila{csvPreview.rowCount !== 1 ? "s" : ""} · {invoiceTemplate}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  [csvPreview.headers, ...csvPreview.rows].map((r) => r.join(",")).join("\n"),
                                );
                                toast.success("CSV copiado al portapapeles");
                              }}
                              className="text-[10px] font-bold text-[var(--gbp-text2)] underline-offset-2 hover:text-[var(--gbp-accent)] hover:underline"
                            >
                              Copiar CSV
                            </button>
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-[var(--gbp-border)]">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)]">
                                  {csvPreview.headers.map((h, i) => (
                                    <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--gbp-border)]">
                                {csvPreview.rows.map((row, ri) => (
                                  <tr key={ri} className="hover:bg-[var(--gbp-bg)]">
                                    {row.map((cell, ci) => (
                                      <td key={ci} className="max-w-[140px] truncate whitespace-nowrap px-2 py-1.5 font-mono text-[var(--gbp-text)]" title={cell}>
                                        {cell || <span className="text-[var(--gbp-muted)]">—</span>}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── 3. FTP personalizado (colapsable) ── */}
                    <div className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setShowInvoiceFtp((p) => !p)}
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)] transition hover:text-[var(--gbp-accent)]"
                      >
                        <Server className="h-3 w-3" />
                        FTP personalizado
                        {!showInvoiceFtp && (
                          <span className="font-normal normal-case tracking-normal text-[var(--gbp-muted)]">
                            — opcional
                          </span>
                        )}
                        {showInvoiceFtp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {showInvoiceFtp && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <input
                            className="col-span-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:outline-none"
                            placeholder="Host (ej. ftp.r365.com)"
                            value={invoiceFtpHost}
                            onChange={(e) => setInvoiceFtpHost(e.target.value)}
                          />
                          <input
                            className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:outline-none"
                            placeholder="Usuario"
                            value={invoiceFtpUser}
                            onChange={(e) => setInvoiceFtpUser(e.target.value)}
                          />
                          <input
                            type="password"
                            className="col-span-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:outline-none"
                            placeholder="Contraseña"
                            value={invoiceFtpPass}
                            onChange={(e) => setInvoiceFtpPass(e.target.value)}
                          />
                          <input
                            className="col-span-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:outline-none"
                            placeholder="Ruta remota (ej. /APImports/R365)"
                            value={invoiceFtpPath}
                            onChange={(e) => setInvoiceFtpPath(e.target.value)}
                          />
                          <label className="col-span-2 flex items-center gap-2 text-xs text-[var(--gbp-text2)]">
                            <input
                              type="checkbox"
                              checked={invoiceFtpSecure}
                              onChange={(e) => setInvoiceFtpSecure(e.target.checked)}
                              className="h-3.5 w-3.5"
                            />
                            SFTP / TLS seguro
                          </label>
                        </div>
                      )}
                    </div>

                    {/* ── 4. Enviar ── */}
                    <div className="flex items-center justify-between px-6 py-4">
                      <span className={`text-[10px] ${hasFtpOverride ? "font-bold text-[var(--gbp-accent)]" : "text-[var(--gbp-muted)]"}`}>
                        {hasFtpOverride ? `FTP: ${invoiceFtpHost.trim()}` : "Usando FTP configurado"}
                      </span>
                      <button
                        type="button"
                        disabled={sendingInvoice}
                        onClick={() => handleSendSingleInvoice(
                          selectedInvoice.sourceInvoiceId,
                          syncHistoryFilter?.id ?? null,
                          hasFtpOverride
                            ? {
                                host: invoiceFtpHost.trim(),
                                port: 21,
                                username: invoiceFtpUser,
                                password: invoiceFtpPass,
                                remotePath: invoiceFtpPath || "/APImports/R365",
                                secure: invoiceFtpSecure,
                              }
                            : null,
                          invoiceTemplate,
                        )}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${
                          isSent
                            ? "border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)]"
                            : "bg-[var(--gbp-accent)] text-white hover:opacity-90"
                        }`}
                      >
                        {sendingInvoice
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : isSent
                            ? <RefreshCw className="h-3.5 w-3.5" />
                            : <Play className="h-3.5 w-3.5" />
                        }
                        {sendingInvoice ? "Enviando..." : isSent ? "Reenviar" : "Enviar a R365"}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Líneas */}
              <div className="px-4 py-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
                  Ítems
                  {invoiceDetail && ` · ${invoiceDetail.lines.length} línea${invoiceDetail.lines.length !== 1 ? "s" : ""}`}
                </p>

                {invoiceDetailLoading && (
                  <div className="flex items-center gap-2 py-8 text-sm text-[var(--gbp-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando líneas...
                  </div>
                )}

                {!invoiceDetailLoading && invoiceDetail && invoiceDetail.lines.length === 0 && (
                  <p className="py-6 text-center text-sm text-[var(--gbp-muted)]">Sin líneas registradas</p>
                )}

                {!invoiceDetailLoading && invoiceDetail && invoiceDetail.lines.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border-[1.5px] border-[var(--gbp-border)]">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead>
                        <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)]">
                          <th className="px-3 py-2 text-right font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Cant.</th>
                          <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">SKU</th>
                          <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Ítem</th>
                          <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Descripción</th>
                          <th className="px-3 py-2 text-right font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Precio</th>
                          <th className="px-3 py-2 text-right font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Importe</th>
                          <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">ID QBO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--gbp-border)]">
                        {invoiceDetail.lines.map((line) => {
                          const shortName = line.itemName ? line.itemName.split(":").pop()!.trim() : null;
                          return (
                          <tr key={line.sourceLineId} className="hover:bg-[var(--gbp-bg)]">
                            <td className="px-3 py-2.5 text-right font-semibold text-[var(--gbp-text)]">{line.quantity != null ? line.quantity : "-"}</td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--gbp-text2)]">{line.sku ?? "-"}</td>
                            <td className="px-3 py-2.5">
                              {shortName ? (
                                <span className="font-semibold text-[var(--gbp-text)]">{shortName}</span>
                              ) : (
                                <span className="text-[var(--gbp-muted)]">{line.targetCode ?? "-"}</span>
                              )}
                            </td>
                            <td className="max-w-[180px] truncate px-3 py-2.5 text-[var(--gbp-text2)]" title={line.description ?? undefined}>
                              {line.description || "-"}
                              {(line.taxAmount ?? 0) > 0 && <span className="ml-1 text-[10px] font-bold text-[var(--gbp-accent)]">T</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-[var(--gbp-text)]">{line.unitPrice != null ? line.unitPrice.toFixed(2) : "-"}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-[var(--gbp-text)]">{line.lineAmount != null ? line.lineAmount.toFixed(2) : "-"}</td>
                            <td className="px-3 py-2.5 font-mono text-[10px] text-[var(--gbp-muted)]">{line.targetCode ?? "-"}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Totales */}
                {!invoiceDetailLoading && invoiceDetail && invoiceDetail.lines.length > 0 && (
                  <div className="mt-3 flex flex-col items-end gap-1 text-sm">
                    <div className="flex w-64 items-center justify-between gap-4 border-t border-[var(--gbp-border)] pt-2">
                      <span className="text-[var(--gbp-text2)]">Subtotal</span>
                      <span className="font-semibold text-[var(--gbp-text)]">{invoiceDetail.subtotal.toFixed(2)} {formatCurrencyLabel(invoiceDetail.currency)}</span>
                    </div>
                    <div className="flex w-64 items-center justify-between gap-4">
                      <span className="text-[var(--gbp-text2)]">Impuestos</span>
                      <span className="font-semibold text-[var(--gbp-text)]">{invoiceDetail.totalTax.toFixed(2)} {formatCurrencyLabel(invoiceDetail.currency)}</span>
                    </div>
                    <div className="flex w-64 items-center justify-between gap-4 rounded-lg bg-[var(--gbp-bg)] px-3 py-2">
                      <span className="font-bold text-[var(--gbp-text)]">Total</span>
                      <span className="text-base font-bold text-[var(--gbp-text)]">{invoiceDetail.grandTotal.toFixed(2)} {formatCurrencyLabel(invoiceDetail.currency)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Meta */}
              <div className="border-t border-[var(--gbp-border)] px-6 py-3">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--gbp-muted)]">Última detección</dt>
                    <dd className="text-[var(--gbp-text)]">{new Date(selectedInvoice.lastSeenAt).toLocaleString("es-AR")}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--gbp-muted)]">Detecciones</dt>
                    <dd className="text-[var(--gbp-text)]">{selectedInvoice.timesSeen}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </aside>
        </>
      )}

    </main>
  );
}

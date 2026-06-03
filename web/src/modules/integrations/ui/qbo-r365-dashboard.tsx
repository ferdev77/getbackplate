"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Search, X, RefreshCw, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2, Plus, Play, Trash2, Eye, ChevronDown, ChevronUp, ChevronsUpDown, Server, Layers } from "lucide-react";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { EmptyState } from "@/shared/ui/empty-state";
import { saveIntegrationConfigAction } from "@/modules/integrations/qbo-r365/actions";
import { resolveHistoryCustomerName } from "@/modules/integrations/qbo-r365/lib/resolve-customer-name";
import { toast } from "sonner";
import { QboR365Onboarding } from "@/modules/integrations/ui/qbo-r365-onboarding";

type StatCard = {
  label: string;
  value: string;
  subLabel: string;
  tone: "default" | "success" | "warning" | "muted";
  quota?: {
    used: number;
    limit: number | null;
    periodEnd: string | null;
    overageRate: number | null;
  };
};
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
    qboCustomerName: string | null;
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
  r365Location: string | null;
  r365VendorName: string | null;
  createdAt: string;
};

type QboCustomer = { id: string; displayName: string; acctNum?: string; raw?: Record<string, unknown> };
type UnifiedInvoiceRow = {
  id: string;
  entityId: string;
  entityType: "Invoice" | "CreditMemo";
  importSource: "sync" | "webhook" | "manual";
  pipelineStatus: "en_cola" | "capturada" | "mapeada" | "enviada";
  docNumber: string | null;
  txnDate: string | null;
  dueDate: string | null;
  totalAmount: number | null;
  currency: string | null;
  customerName: string | null;
  vendorName: string | null;
  rawEntity: Record<string, unknown> | null;
  fetchedAt: string | null;
  syncConfigId: string | null;
  createdAt: string;
};

type VendorProfile = { company?: string; contactName?: string; email?: string; phone?: string; address?: string; website?: string };
type Props = { organizationId: string; deferredDataUrl: string; showDeveloperMode?: boolean; className?: string; orgName?: string; orgLogoUrl?: string; maxR365Connections?: number | null; showOnboarding?: boolean; vendorProfile?: VendorProfile | null; planName?: string };

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

type TemplateCol = { col: string; r365Name: string; qboSource: string; scope: "header" | "detail"; highlight?: boolean; note?: boolean };
const TEMPLATE_COLS: Record<"by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates", TemplateCol[]> = {
  by_item: [
    { col: "A", r365Name: "Vendor", qboSource: "CustomerRef.name (nombre del proveedor configurado en el sync)", scope: "header" },
    { col: "B", r365Name: "Location", qboSource: "Customer.AcctNum en QBO — el campo «Account No.» del cliente, que contiene el código de ubicación en R365. Se cachea en el sync config.", scope: "header", highlight: true },
    { col: "C", r365Name: "Document Number", qboSource: "DocNumber", scope: "header" },
    { col: "D", r365Name: "Date", qboSource: "TxnDate", scope: "header" },
    { col: "E", r365Name: "Vendor Item Number", qboSource: "ItemRef.Value → buscado en tabla de SKUs; fallback: ItemRef.Name si no hay mapeo", scope: "detail", highlight: true },
    { col: "F", r365Name: "Vendor Item Name", qboSource: "ItemRef.Name — solo la parte final (después del último «:» si hay categorías)", scope: "detail" },
    { col: "G", r365Name: "UofM", qboSource: "Line.Description de la línea (o «EACH» cuando es la fila de impuesto)", scope: "detail" },
    { col: "H", r365Name: "Qty", qboSource: "SalesItemLineDetail.Qty", scope: "detail" },
    { col: "I", r365Name: "Unit Price", qboSource: "SalesItemLineDetail.UnitPrice", scope: "detail" },
    { col: "J", r365Name: "Total", qboSource: "Line.Amount", scope: "detail" },
    { col: "K", r365Name: "Break Flag", qboSource: "Siempre vacío", scope: "detail" },
    { col: "★", r365Name: "Fila impuesto (si TxnTaxDetail.TotalTax > 0)", qboSource: "Item 999999 · Vendor Item Name «Tax» · UofM «EACH» · Qty 1 · Unit Price = TxnTaxDetail.TotalTax", scope: "detail", note: true },
  ],
  by_item_service_dates: [
    { col: "A", r365Name: "Vendor", qboSource: "CustomerRef.name (nombre del proveedor configurado en el sync)", scope: "header" },
    { col: "B", r365Name: "Location", qboSource: "Customer.AcctNum en QBO — el campo «Account No.» del cliente, que contiene el código de ubicación en R365. Se cachea en el sync config.", scope: "header", highlight: true },
    { col: "C", r365Name: "Document Number", qboSource: "DocNumber", scope: "header" },
    { col: "D", r365Name: "Date", qboSource: "TxnDate", scope: "header" },
    { col: "E", r365Name: "Vendor Item Number", qboSource: "ItemRef.Value → buscado en tabla de SKUs; fallback: ItemRef.Name si no hay mapeo", scope: "detail", highlight: true },
    { col: "F", r365Name: "Vendor Item Name", qboSource: "ItemRef.Name — solo la parte final (después del último «:» si hay categorías)", scope: "detail" },
    { col: "G", r365Name: "UofM", qboSource: "Line.Description de la línea (o «EACH» cuando es la fila de impuesto)", scope: "detail" },
    { col: "H", r365Name: "Qty", qboSource: "SalesItemLineDetail.Qty", scope: "detail" },
    { col: "I", r365Name: "Unit Price", qboSource: "SalesItemLineDetail.UnitPrice", scope: "detail" },
    { col: "J", r365Name: "Total", qboSource: "Line.Amount", scope: "detail" },
    { col: "K", r365Name: "Break Flag", qboSource: "Siempre vacío", scope: "detail" },
    { col: "L", r365Name: "Start Date of Service", qboSource: "serviceStartDate (no mapeado desde QBO actualmente — queda vacío)", scope: "detail" },
    { col: "M", r365Name: "End Date of Service", qboSource: "serviceEndDate (no mapeado desde QBO actualmente — queda vacío)", scope: "detail" },
    { col: "★", r365Name: "Fila impuesto (si TxnTaxDetail.TotalTax > 0)", qboSource: "Item 999999 · Vendor Item Name «Tax» · UofM «EACH» · Qty 1 · Unit Price = TxnTaxDetail.TotalTax", scope: "detail", note: true },
  ],
  by_account: [
    { col: "A", r365Name: "Type", qboSource: "«1» = Invoice / «2» = Credit Memo", scope: "header" },
    { col: "B", r365Name: "Location", qboSource: "Customer.AcctNum en QBO — el campo «Account No.» del cliente, que contiene el código de ubicación en R365. Se cachea en el sync config.", scope: "header", highlight: true },
    { col: "C", r365Name: "Vendor", qboSource: "CustomerRef.name (nombre del proveedor configurado en el sync)", scope: "header" },
    { col: "D", r365Name: "Number", qboSource: "DocNumber", scope: "header" },
    { col: "E", r365Name: "Date", qboSource: "TxnDate", scope: "detail" },
    { col: "F", r365Name: "Gl Date", qboSource: "TxnDate (igual que Date)", scope: "detail" },
    { col: "G", r365Name: "Amount", qboSource: "Suma del total de todas las líneas de la factura (no el monto de la línea individual)", scope: "detail" },
    { col: "H", r365Name: "Payment Terms", qboSource: "Siempre vacío", scope: "detail" },
    { col: "I", r365Name: "Due Date", qboSource: "DueDate (fallback: TxnDate si no hay fecha de vencimiento)", scope: "detail" },
    { col: "J", r365Name: "Comment", qboSource: "PrivateNote / Memo de la factura", scope: "detail" },
    { col: "K", r365Name: "Detail Account", qboSource: "AccountBasedExpenseLineDetail.AccountRef.Value (código de cuenta contable)", scope: "detail", highlight: true },
    { col: "L", r365Name: "Detail Amount", qboSource: "Line.Amount", scope: "detail" },
    { col: "M", r365Name: "Detail Location", qboSource: "Customer.AcctNum en QBO (mismo valor que Location — col B)", scope: "detail", highlight: true },
    { col: "N", r365Name: "Detail Comment", qboSource: "Line.Description", scope: "detail" },
    { col: "★", r365Name: "Fila impuesto (si TxnTaxDetail.TotalTax > 0)", qboSource: "Item 999999 · Amount = TxnTaxDetail.TotalTax · Detail Account = 999999", scope: "detail", note: true },
  ],
  by_account_service_dates: [
    { col: "A", r365Name: "Type", qboSource: "«1» = Invoice / «2» = Credit Memo", scope: "header" },
    { col: "B", r365Name: "Location", qboSource: "Customer.AcctNum en QBO — el campo «Account No.» del cliente, que contiene el código de ubicación en R365. Se cachea en el sync config.", scope: "header", highlight: true },
    { col: "C", r365Name: "Vendor", qboSource: "CustomerRef.name (nombre del proveedor configurado en el sync)", scope: "header" },
    { col: "D", r365Name: "Number", qboSource: "DocNumber", scope: "header" },
    { col: "E", r365Name: "Date", qboSource: "TxnDate", scope: "detail" },
    { col: "F", r365Name: "Gl Date", qboSource: "TxnDate (igual que Date)", scope: "detail" },
    { col: "G", r365Name: "Amount", qboSource: "Suma del total de todas las líneas de la factura (no el monto de la línea individual)", scope: "detail" },
    { col: "H", r365Name: "Payment Terms", qboSource: "Siempre vacío", scope: "detail" },
    { col: "I", r365Name: "Due Date", qboSource: "DueDate (fallback: TxnDate si no hay fecha de vencimiento)", scope: "detail" },
    { col: "J", r365Name: "Comment", qboSource: "PrivateNote / Memo de la factura", scope: "detail" },
    { col: "K", r365Name: "Detail Account", qboSource: "AccountBasedExpenseLineDetail.AccountRef.Value (código de cuenta contable)", scope: "detail", highlight: true },
    { col: "L", r365Name: "Detail Amount", qboSource: "Line.Amount", scope: "detail" },
    { col: "M", r365Name: "Detail Location", qboSource: "Customer.AcctNum en QBO (mismo valor que Location — col B)", scope: "detail", highlight: true },
    { col: "N", r365Name: "Detail Comment", qboSource: "Line.Description", scope: "detail" },
    { col: "O", r365Name: "Start Date of Service", qboSource: "serviceStartDate (no mapeado desde QBO actualmente — queda vacío)", scope: "detail" },
    { col: "P", r365Name: "End Date of Service", qboSource: "serviceEndDate (no mapeado desde QBO actualmente — queda vacío)", scope: "detail" },
    { col: "★", r365Name: "Fila impuesto (si TxnTaxDetail.TotalTax > 0)", qboSource: "Item 999999 · Amount = TxnTaxDetail.TotalTax · Detail Account = 999999", scope: "detail", note: true },
  ],
};

export function QboR365Dashboard({ organizationId, deferredDataUrl, showDeveloperMode = false, className, orgName, orgLogoUrl, maxR365Connections, showOnboarding: initialShowOnboarding = false, vendorProfile = null, planName = "QBO" }: Props) {
  const [onboardingVisible, setOnboardingVisible] = useState(initialShowOnboarding);
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetailData | null>(null);
  const [invoiceDetailLoading, setInvoiceDetailLoading] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [mode, setMode] = useState<"operation" | "developer">("operation");
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [sendingUnifiedInvoice, setSendingUnifiedInvoice] = useState(false);
  const [mappingUnifiedInvoice, setMappingUnifiedInvoice] = useState(false);
  const [invoiceDetailRefreshKey, setInvoiceDetailRefreshKey] = useState(0);
  const [showMappingPreview, setShowMappingPreview] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][]; rowCount: number } | null>(null);
  const [previewingCsv, setPreviewingCsv] = useState(false);
  const [isSavingSandbox, setIsSavingSandbox] = useState(false);
  const [configUseSandbox, setConfigUseSandbox] = useState<boolean>(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unifiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unifiedHistoryKey, setUnifiedHistoryKey] = useState(0);
  const [unifiedSort, setUnifiedSort] = useState<{ col: "txnDate" | "createdAt"; dir: "asc" | "desc" }>({ col: "createdAt", dir: "desc" });

  // Sync configs
  const [syncConfigs, setSyncConfigs] = useState<SyncConfigSummary[]>([]);
  const [syncConfigsLoading, setSyncConfigsLoading] = useState(false);
  const [isCreateSyncOpen, setIsCreateSyncOpen] = useState(false);
  const [deletingSyncId, setDeletingSyncId] = useState<string | null>(null);
  // Form state for new sync config
  const [newSyncCustomerId, setNewSyncCustomerId] = useState("");
  const [newSyncCustomerName, setNewSyncCustomerName] = useState("");
  const [newSyncVendorName, setNewSyncVendorName] = useState("");
  const [newSyncLocation, setNewSyncLocation] = useState("");
  const [pickedCustomerRaw, setPickedCustomerRaw] = useState<Record<string, unknown> | null>(null);
  const [newSyncFtpHost, setNewSyncFtpHost] = useState("");
  const [newSyncFtpUser, setNewSyncFtpUser] = useState("");
  const [newSyncFtpPass, setNewSyncFtpPass] = useState("");
  const [showNewSyncFtpPass, setShowNewSyncFtpPass] = useState(false);
  const [newSyncFtpPath, setNewSyncFtpPath] = useState("/APImports/R365");
  const [isSavingSync, setIsSavingSync] = useState(false);
  const [newSyncBackfillEnabled, setNewSyncBackfillEnabled] = useState(false);
  const [newSyncBackfillFromDate, setNewSyncBackfillFromDate] = useState("");
  const [qboCustomers, setQboCustomers] = useState<QboCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  // Historial filtrado por sync config
  const [syncHistoryFilter, setSyncHistoryFilter] = useState<{ id: string; name: string } | null>(null);
  const [unifiedHistory, setUnifiedHistory] = useState<UnifiedInvoiceRow[]>([]);
  const [unifiedHistoryLoading, setUnifiedHistoryLoading] = useState(false);
  const [unifiedPage, setUnifiedPage] = useState(1);
  const hasLoadedSyncConfigsRef = useRef(false);
  const invoiceHistorySectionRef = useRef<HTMLElement>(null);
  // Fetch manual por DocNumber
  const [fetchDocNumber, setFetchDocNumber] = useState("");
  const [fetchDocNumberLoading, setFetchDocNumberLoading] = useState(false);
  const [fetchDocNumberResult, setFetchDocNumberResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    docNumber: string; entityType: string;
    pipelineStatus: string; importSource: string; sentAt: string | null;
  } | null>(null);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "qbo_unified_invoices", filter: orgFilter }, () => {
        if (unifiedTimerRef.current) clearTimeout(unifiedTimerRef.current);
        unifiedTimerRef.current = setTimeout(() => setUnifiedHistoryKey((p) => p + 1), 500);
      })
      .subscribe();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (unifiedTimerRef.current) clearTimeout(unifiedTimerRef.current);
      supabase.removeChannel(channel);
    };
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

  useEffect(() => {
    setUnifiedPage(1);
    setUnifiedHistoryLoading(true);
    const syncConfigParam = syncHistoryFilter ? `&syncConfigId=${encodeURIComponent(syncHistoryFilter.id)}` : "";
    void fetch(`/api/company/integrations/qbo-r365/unified-history?limit=200${syncConfigParam}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { rows?: UnifiedInvoiceRow[] }) => setUnifiedHistory(d.rows ?? []))
      .catch(() => {})
      .finally(() => setUnifiedHistoryLoading(false));
  }, [unifiedHistoryKey, syncHistoryFilter]);

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

  async function handleCustomerPick(customer: QboCustomer) {
    setNewSyncCustomerId(customer.id);
    setNewSyncCustomerName(customer.displayName);
    setNewSyncLocation(customer.acctNum ?? "");
    setCustomerSearch(customer.displayName);
    setCustomerDropdownOpen(false);
    setPickedCustomerRaw(null);

    // Fetch full customer by ID to get AcctNum + CustomField (SELECT query doesn't return these)
    try {
      const res = await fetch(`/api/company/integrations/qbo-r365/customers/${customer.id}`);
      if (res.ok) {
        const data = (await res.json()) as { customer?: QboCustomer };
        if (data.customer?.raw) setPickedCustomerRaw(data.customer.raw);
        if (data.customer?.acctNum) {
          setNewSyncLocation(data.customer.acctNum);
        }
      }
    } catch {
      // Silently fallback to what the SELECT already returned
    }
  }

  const filteredCustomers = useMemo(() => {
    const usedIds = new Set(syncConfigs.map((s) => s.qboCustomerId));
    const available = qboCustomers.filter((c) => !usedIds.has(c.id));
    const q = customerSearch.trim().toLowerCase();
    if (!q) return available;
    return available.filter((c) => c.displayName.toLowerCase().includes(q));
  }, [qboCustomers, customerSearch, syncConfigs]);

  async function handleCreateSync(e: React.FormEvent) {
    e.preventDefault();
    if (!newSyncCustomerId) { toast.error("Selecciona un cliente QBO"); return; }
    if (newSyncBackfillEnabled && !newSyncBackfillFromDate) {
      toast.error("Elegí una fecha de inicio para la importación histórica");
      return;
    }
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
          r365VendorName: newSyncVendorName,
          r365Location: newSyncLocation,
          r365FtpHost: newSyncFtpHost,
          r365FtpPort: 21,
          r365FtpUsername: newSyncFtpUser,
          r365FtpPassword: newSyncFtpPass,
          r365FtpRemotePath: newSyncFtpPath,
          backfillFromDate: newSyncBackfillEnabled ? newSyncBackfillFromDate : undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; id?: string; backfilling?: boolean };
      if (!response.ok) throw new Error(payload.error || "Error al crear");
      if (payload.backfilling) {
        toast.success("Sincronización creada", {
          description: `Importando facturas desde ${newSyncBackfillFromDate} en segundo plano. Aparecerán en el historial en instantes.`,
        });
      } else {
        toast.success("Sincronización creada");
      }
      setIsCreateSyncOpen(false);
      setNewSyncCustomerId(""); setNewSyncCustomerName("");
      setCustomerSearch(""); setCustomerDropdownOpen(false);
      setNewSyncVendorName(""); setNewSyncLocation("");
      setNewSyncFtpHost(""); setNewSyncFtpUser(""); setNewSyncFtpPass(""); setShowNewSyncFtpPass(false);
      setNewSyncBackfillEnabled(false); setNewSyncBackfillFromDate("");
      setRefreshKey((p) => p + 1);
    } catch (error) {
      toast.error("No se pudo crear", { description: error instanceof Error ? error.message : "Error" });
    }
    setIsSavingSync(false);
  }

  async function handleFetchByDocNumber(e: React.FormEvent) {
    e.preventDefault();
    const doc = fetchDocNumber.trim();
    if (!doc) return;
    setFetchDocNumberLoading(true);
    setFetchDocNumberResult(null);
    setPendingConfirm(null);
    try {
      const res = await fetch("/api/company/integrations/qbo-r365/fetch-by-docnumber", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docNumber: doc, force: false }),
      });
      const data = (await res.json()) as {
        entityId?: string; entityType?: string; docNumber?: string;
        alreadyExisted?: boolean; error?: string;
        existing?: { pipelineStatus: string; importSource: string; sentAt: string | null };
      };
      if (!res.ok) {
        setFetchDocNumberResult({ ok: false, message: data.error ?? "No se pudo traer la factura" });
      } else if (data.alreadyExisted && data.existing) {
        // La factura ya existe — pedir confirmación antes de reemplazar
        setPendingConfirm({
          docNumber: data.docNumber ?? doc,
          entityType: data.entityType ?? "Invoice",
          pipelineStatus: data.existing.pipelineStatus,
          importSource: data.existing.importSource,
          sentAt: data.existing.sentAt,
        });
      } else {
        const label = data.entityType === "CreditMemo" ? "Nota de crédito" : "Factura";
        setFetchDocNumberResult({ ok: true, message: `${label} ${data.docNumber} agregada al historial.` });
        setFetchDocNumber("");
        setUnifiedHistoryKey((p) => p + 1);
      }
    } catch {
      setFetchDocNumberResult({ ok: false, message: "Error de red — revisá la conexión e intentá de nuevo." });
    } finally {
      setFetchDocNumberLoading(false);
    }
  }

  async function handleConfirmReplace() {
    if (!pendingConfirm) return;
    setFetchDocNumberLoading(true);
    setPendingConfirm(null);
    setFetchDocNumberResult(null);
    try {
      const res = await fetch("/api/company/integrations/qbo-r365/fetch-by-docnumber", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docNumber: pendingConfirm.docNumber, force: true }),
      });
      const data = (await res.json()) as { entityType?: string; docNumber?: string; error?: string };
      if (!res.ok) {
        setFetchDocNumberResult({ ok: false, message: data.error ?? "No se pudo reemplazar la factura" });
      } else {
        const label = data.entityType === "CreditMemo" ? "Nota de crédito" : "Factura";
        setFetchDocNumberResult({ ok: true, message: `${label} ${data.docNumber} reemplazada en el historial.` });
        setFetchDocNumber("");
        setUnifiedHistoryKey((p) => p + 1);
      }
    } catch {
      setFetchDocNumberResult({ ok: false, message: "Error de red — revisá la conexión e intentá de nuevo." });
    } finally {
      setFetchDocNumberLoading(false);
    }
  }

  async function handleMapUnifiedInvoice(unifiedInvoiceId: string) {
    setMappingUnifiedInvoice(true);
    const loadingToastId = toast.loading("Mapeando factura...");
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/map-unified-invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unifiedInvoiceId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; mapped?: number };
      if (!response.ok) throw new Error(payload.error || "No se pudo mapear la factura");
      toast.dismiss(loadingToastId);
      toast.success("Factura mapeada", {
        description: `${payload.mapped ?? 0} línea(s) listas para enviar a R365.`,
      });
      setUnifiedHistoryKey((p) => p + 1);
    } catch (error) {
      toast.dismiss(loadingToastId);
      toast.error("No se pudo mapear la factura", {
        description: error instanceof Error ? error.message : "Error",
      });
    }
    setMappingUnifiedInvoice(false);
  }

  async function handleSendUnifiedInvoice(unifiedInvoiceId: string) {
    setSendingUnifiedInvoice(true);
    const loadingToastId = toast.loading("Enviando factura a R365...");
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/send-unified-invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unifiedInvoiceId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; uploaded?: number; fileName?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo enviar la factura");
      toast.dismiss(loadingToastId);
      toast.success("Factura enviada a R365", {
        description: payload.fileName
          ? `Archivo ${payload.fileName} subido (${payload.uploaded ?? 0} líneas).`
          : "Enviado correctamente.",
      });
      setUnifiedHistoryKey((p) => p + 1);
    } catch (error) {
      toast.dismiss(loadingToastId);
      toast.error("No se pudo enviar la factura", {
        description: error instanceof Error ? error.message : "Error",
      });
    }
    setSendingUnifiedInvoice(false);
  }

  function handleViewSyncHistory(config: SyncConfigSummary) {
    setSyncHistoryFilter({ id: config.id, name: config.name });
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
  const sortedUnifiedHistory = useMemo(() => {
    return [...unifiedHistory].sort((a, b) => {
      const aVal = unifiedSort.col === "txnDate" ? (a.txnDate ?? "") : a.createdAt;
      const bVal = unifiedSort.col === "txnDate" ? (b.txnDate ?? "") : b.createdAt;
      return unifiedSort.dir === "desc" ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    });
  }, [unifiedHistory, unifiedSort]);

  const selectedUnifiedRow = useMemo(
    () => unifiedHistory.find((item) => item.entityId === selectedInvoiceId) ?? null,
    [unifiedHistory, selectedInvoiceId],
  );
  const isCreditMemoSelected = useMemo(() => {
    if (invoiceDetail?.transactionTypeCode === "2") return true;
    if (selectedUnifiedRow?.entityType === "CreditMemo") return true;
    return false;
  }, [invoiceDetail, selectedUnifiedRow]);

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
    setShowMappingPreview(false);
    setCsvPreview(null);
    setPreviewingCsv(false);
  }, [selectedInvoiceId]);


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


  async function handlePreviewUnifiedCsv(unifiedInvoiceId: string) {
    setPreviewingCsv(true);
    setCsvPreview(null);
    try {
      const response = await fetch("/api/company/integrations/qbo-r365/preview-unified-invoice-csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unifiedInvoiceId }),
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

  async function handleInvoiceExport(
    format: "csv" | "json" | "pdf" | "txt",
    unifiedContext?: { id: string; docNumber: string | null; entityType: string; rawEntity: Record<string, unknown> | null; customerName: string | null },
  ) {
    if (!invoiceDetail) return;
    const inv = invoiceDetail;
    const safeName = (inv.invoiceNumber ?? inv.sourceInvoiceId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const typeSlug = unifiedContext ? (unifiedContext.entityType === "CreditMemo" ? "CM" : "INV") : null;
    const docSlug = unifiedContext ? (unifiedContext.docNumber ?? unifiedContext.id).replace(/[^a-zA-Z0-9_-]/g, "_") : null;
    const curLabel = formatCurrencyLabel(inv.currency);
    const cur = curLabel ? ` ${curLabel}` : "";

    if (format === "pdf") {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const isCreditMemo = unifiedContext?.entityType === "CreditMemo";

      // Load logo if available
      let logoDataUrl: string | null = null;
      if (orgLogoUrl) {
        try {
          const resp = await fetch(orgLogoUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            logoDataUrl = await new Promise<string | null>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
          }
        } catch { /* fall back to text */ }
      }

      const QBO_BLUE_R = 45, QBO_BLUE_G = 101, QBO_BLUE_B = 188;
      const imgFormat = logoDataUrl ? (logoDataUrl.split(";")[0].split("/")[1]?.toUpperCase() ?? "PNG") : "PNG";

      if (isCreditMemo) {
        // ── CREDIT MEMO LAYOUT ──

        // Top-left: logo or company name
        if (logoDataUrl) {
          doc.addImage(logoDataUrl, imgFormat, 14, 8, 45, 16);
        } else {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          doc.text(orgName ?? "Company", 14, 18);
        }

        // Top-right: "Credit Memo" in blue
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(QBO_BLUE_R, QBO_BLUE_G, QBO_BLUE_B);
        doc.text("Credit Memo", pageW - 14, 18, { align: "right" });

        // Separator
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(14, 27, pageW - 14, 27);

        // Left: CREDIT TO
        let leftY = 36;
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 120, 120);
        doc.text("CREDIT TO", 14, leftY);
        leftY += 5;
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(unifiedContext?.customerName ?? inv.vendor ?? "-", 14, leftY);

        // Right: CREDIT # and DATE
        let rightY = 36;
        const labelRX = pageW - 14 - 38;
        const valueRX = pageW - 14;
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 120, 120);
        doc.text("CREDIT #", labelRX, rightY, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(inv.invoiceNumber ?? inv.sourceInvoiceId, valueRX, rightY, { align: "right" });
        rightY += 6;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 120, 120);
        doc.text("DATE", labelRX, rightY, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(formatQboDate(inv.invoiceDate), valueRX, rightY, { align: "right" });

        const cmTableY = Math.max(leftY + 14, rightY + 14);

        autoTable(doc, {
          startY: cmTableY,
          head: [["QTY", "DESCRIPTION", "UNIT PRICE", "AMOUNT"]],
          body: inv.lines.map((l) => {
            const shortName = l.itemName ? l.itemName.split(":").pop()!.trim() : (l.description ?? "-");
            return [
              l.quantity != null ? String(l.quantity) : "-",
              shortName,
              l.unitPrice != null ? l.unitPrice.toFixed(2) : "-",
              l.lineAmount != null ? l.lineAmount.toFixed(2) : "-",
            ];
          }),
          headStyles: { fillColor: [QBO_BLUE_R, QBO_BLUE_G, QBO_BLUE_B], fontSize: 8, fontStyle: "bold" },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            0: { halign: "right", cellWidth: 14 },
            2: { halign: "right", cellWidth: 26 },
            3: { halign: "right", cellWidth: 28 },
          },
          styles: { overflow: "linebreak" },
          margin: { left: 14, right: 14 },
        });

        const cmFinalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 200);
        const cmTotY = cmFinalY + 10;
        const cmLabelX = pageW - 14 - 42;
        const cmValueX = pageW - 14;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        doc.text("Subtotal", cmLabelX, cmTotY, { align: "right" });
        doc.text(inv.subtotal.toFixed(2) + cur, cmValueX, cmTotY, { align: "right" });
        doc.text("Tax", cmLabelX, cmTotY + 7, { align: "right" });
        doc.text(inv.totalTax.toFixed(2) + cur, cmValueX, cmTotY + 7, { align: "right" });
        doc.text("Total", cmLabelX, cmTotY + 14, { align: "right" });
        doc.text(inv.grandTotal.toFixed(2) + cur, cmValueX, cmTotY + 14, { align: "right" });
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.4);
        doc.line(cmLabelX - 5, cmTotY + 18, cmValueX, cmTotY + 18);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(QBO_BLUE_R, QBO_BLUE_G, QBO_BLUE_B);
        doc.text("TOTAL CREDIT", cmLabelX, cmTotY + 26, { align: "right" });
        doc.setTextColor(0, 0, 0);
        doc.text(inv.grandTotal.toFixed(2) + cur, cmValueX, cmTotY + 26, { align: "right" });

        const cmName = unifiedContext && typeSlug && docSlug ? `credit_memo_${docSlug}.pdf` : `credit_memo_${safeName}.pdf`;
        doc.save(cmName);
        return;
      }

      // ── INVOICE LAYOUT ──

      // Top-left: logo or company name
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, imgFormat, 14, 8, 45, 16);
      } else {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(orgName ?? "Company", 14, 18);
      }

      // Top-right: "INVOICE" in blue
      doc.setFontSize(26);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(QBO_BLUE_R, QBO_BLUE_G, QBO_BLUE_B);
      doc.text("INVOICE", pageW - 14, 18, { align: "right" });

      // Separator
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(14, 27, pageW - 14, 27);

      // Right column: INVOICE #, DATE, TERMS, DUE DATE
      const labelRX = pageW - 14 - 38;
      const valueRX = pageW - 14;
      let rightY = 36;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(120, 120, 120);
      doc.text("INVOICE #", labelRX, rightY, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(inv.invoiceNumber ?? inv.sourceInvoiceId, valueRX, rightY, { align: "right" });
      rightY += 6;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(120, 120, 120);
      doc.text("DATE", labelRX, rightY, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(formatQboDate(inv.invoiceDate), valueRX, rightY, { align: "right" });
      if (inv.terms) {
        rightY += 6;
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 120, 120);
        doc.text("TERMS", labelRX, rightY, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(inv.terms, valueRX, rightY, { align: "right" });
      }
      rightY += 6;
      doc.setFont("helvetica", "bold");
      doc.setTextColor(120, 120, 120);
      doc.text("DUE DATE", labelRX, rightY, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(formatQboDate(inv.dueDate), valueRX, rightY, { align: "right" });

      // Left: BILL TO
      let leftY = 36;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(120, 120, 120);
      doc.text("BILL TO", 14, leftY);
      leftY += 5;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(unifiedContext?.customerName ?? inv.vendor ?? "-", 14, leftY);

      // PO Number if available
      if (inv.poNumber) {
        leftY += 10;
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 120, 120);
        doc.text("PO NUMBER", 14, leftY);
        leftY += 5;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text(inv.poNumber, 14, leftY);
      }

      const tableStartY = Math.max(leftY + 12, rightY + 12);

      autoTable(doc, {
        startY: tableStartY,
        head: [["QTY", "SKU", "ITEM / SERVICE", "DESCRIPTION", "RATE", "AMOUNT"]],
        body: inv.lines.map((l) => {
          const shortName = l.itemName ? l.itemName.split(":").pop()!.trim() : (l.targetCode ?? "-");
          return [
            l.quantity != null ? String(l.quantity) : "-",
            l.sku ?? "-",
            shortName,
            l.description ?? "-",
            l.unitPrice != null ? l.unitPrice.toFixed(2) : "-",
            l.lineAmount != null ? l.lineAmount.toFixed(2) : "-",
          ];
        }),
        headStyles: { fillColor: [QBO_BLUE_R, QBO_BLUE_G, QBO_BLUE_B], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { halign: "right", cellWidth: 12 },
          1: { halign: "left", cellWidth: 22, textColor: [80, 80, 80] as [number, number, number], fontSize: 7 },
          4: { halign: "right", cellWidth: 22 },
          5: { halign: "right", cellWidth: 24 },
        },
        styles: { overflow: "linebreak" },
        margin: { left: 14, right: 14 },
      });

      const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 200);
      const totY = finalY + 10;
      const labelX = pageW - 14 - 42;
      const valueX = pageW - 14;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text("Subtotal", labelX, totY, { align: "right" });
      doc.text(inv.subtotal.toFixed(2) + cur, valueX, totY, { align: "right" });
      doc.text("Tax", labelX, totY + 7, { align: "right" });
      doc.text(inv.totalTax.toFixed(2) + cur, valueX, totY + 7, { align: "right" });
      doc.text("Total", labelX, totY + 14, { align: "right" });
      doc.text(inv.grandTotal.toFixed(2) + cur, valueX, totY + 14, { align: "right" });
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.4);
      doc.line(labelX - 5, totY + 18, valueX, totY + 18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(QBO_BLUE_R, QBO_BLUE_G, QBO_BLUE_B);
      doc.text("BALANCE DUE", labelX, totY + 26, { align: "right" });
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(inv.grandTotal.toFixed(2) + cur, valueX, totY + 26, { align: "right" });

      // Customer signature line
      const sigY = totY + 46;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text("Customer Signature", 14, sigY);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.line(14, sigY + 8, 80, sigY + 8);
      doc.text("Date", 90, sigY);
      doc.line(90, sigY + 8, 130, sigY + 8);

      const invName = unifiedContext && typeSlug && docSlug ? `invoice_${docSlug}.pdf` : `invoice_${safeName}.pdf`;
      doc.save(invName);
      return;
    }

    let content = "";
    let mime = "";

    if (format === "csv") {
      if (unifiedContext) {
        const response = await fetch("/api/company/integrations/qbo-r365/preview-unified-invoice-csv", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ unifiedInvoiceId: unifiedContext.id }),
        });
        const payload = (await response.json().catch(() => ({}))) as { csv?: string; error?: string };
        if (!payload.csv) {
          toast.error(payload.error ?? "No se pudo generar el CSV R365");
          return;
        }
        content = payload.csv;
        mime = "text/csv;charset=utf-8;";
      } else {
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
      }
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
      content = JSON.stringify(unifiedContext ? unifiedContext.rawEntity : inv, null, 2);
      mime = "application/json";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    if (unifiedContext && typeSlug && docSlug) {
      if (format === "csv") link.download = `r365_${typeSlug}_${docSlug}.csv`;
      else if (format === "json") link.download = `qbo_raw_${typeSlug}_${docSlug}.json`;
      else if (format === "txt") link.download = `factura_${typeSlug}_${docSlug}.txt`;
      else link.download = `factura_${typeSlug}_${docSlug}.pdf`;
    } else {
      link.download = `factura-${safeName}.${format === "json" ? "json" : format === "txt" ? "txt" : "csv"}`;
    }
    link.click();
    URL.revokeObjectURL(url);
  }

  const statCards = data?.statCardsByMode?.[mode] ?? data?.statCards ?? [];
  const conns = data?.connections ?? { qbo: { status: "disconnected" }, ftp: { status: "disconnected" } };

  return (
    <main className={className}>
      {/* Onboarding overlay */}
      {onboardingVisible && (
        <QboR365Onboarding
          qboConnected={data?.connections?.qbo?.status === "connected"}
          vendorProfile={vendorProfile}
          maxConnections={maxR365Connections ?? null}
          syncConfigsCount={syncConfigs.length}
          planName={planName}
          onComplete={() => { setOnboardingVisible(false); }}
        />
      )}

      {/* Header */}
      <section className="mb-6 rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--gbp-muted)]">Integraciones</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Integración QuickBooks → R365</h1>
            <p className="mt-1 text-sm text-[var(--gbp-text2)]">{data?.generatedAt ?? "Cargando..."}</p>
          </div>
          {showDeveloperMode && (
            <div className="inline-flex rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-0.5">
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
        </div>
      </section>

      {/* Stat Cards + QBO connection en la misma fila */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4 transition hover:shadow-[var(--gbp-shadow-md)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${toneClass(card.tone)}`}>{card.value}</p>
            {card.quota?.limit ? (() => {
              const pct = Math.min(100, Math.round((card.quota.used / card.quota.limit) * 100));
              const isOver = card.quota.used > card.quota.limit;
              const renewDate = card.quota.periodEnd
                ? new Date(card.quota.periodEnd).toLocaleDateString("es-AR", { day: "numeric", month: "short" })
                : null;
              return (
                <>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--gbp-border)]">
                    <div
                      className={`h-full rounded-full transition-all ${isOver ? "bg-amber-500" : "bg-[var(--gbp-accent)]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--gbp-muted)]">
                    {card.subLabel}
                    {renewDate && <span className="ml-1">· Renueva {renewDate}</span>}
                  </p>
                </>
              );
            })() : (
              <p className="mt-1 text-xs text-[var(--gbp-muted)]">{card.subLabel}</p>
            )}
          </article>
        ))}
        <article className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4 transition hover:shadow-[var(--gbp-shadow-md)]">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${connDot(conns.qbo.status)}`} />
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">QuickBooks Online</p>
            <span className="ml-auto rounded-full bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--gbp-text2)]">{connLabel(conns.qbo.status)}</span>
          </div>
          {conns.qbo.realmId && <p className="mt-2 text-xs text-[var(--gbp-text2)]">Realm: {String(conns.qbo.realmId).slice(0, 12)}...</p>}
          {conns.qbo.lastRefreshed && <p className="mt-1 text-[11px] text-[var(--gbp-muted)]">Actualizado: {relativeTime(conns.qbo.lastRefreshed)}</p>}
          <button
            type="button"
            disabled={oauthConnecting}
            onClick={handleConnectQbo}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
          >
            <Link2 className="h-3.5 w-3.5" /> {oauthConnecting ? "Conectando..." : (conns.qbo.status === "connected" ? "Reconectar QBO" : "Conectar QBO")}
          </button>
        </article>
      </section>

      {/* Sincronizaciones / Slots */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Conexiones R365</h2>
            {maxR365Connections != null && (
              <p className="mt-0.5 text-xs text-[var(--gbp-muted)]">
                {syncConfigs.length} de {maxR365Connections} slots usados
              </p>
            )}
          </div>
          {(maxR365Connections == null || syncConfigs.length < maxR365Connections) && (
            <button
              type="button"
              onClick={() => setIsCreateSyncOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--gbp-accent)]"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva conexión
            </button>
          )}
        </div>

        {syncConfigsLoading && (
          <p className="text-sm text-[var(--gbp-muted)]">Cargando...</p>
        )}

        {!syncConfigsLoading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {/* Occupied slots */}
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
                  <span className="rounded bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] text-[var(--gbp-text2)]">{config.template}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] ${config.hasFtp ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]" : "bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]"}`}>
                    {config.hasFtp ? "FTP ok" : "Sin FTP"}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
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
                    disabled={deletingSyncId === config.id}
                    onClick={() => handleDeleteSyncConfig(config.id)}
                    className="inline-flex items-center justify-center rounded-lg border-[1.5px] border-[var(--gbp-error-soft)] bg-[var(--gbp-error-soft)] px-2.5 py-1.5 text-[11px] text-[var(--gbp-error)] transition hover:opacity-80 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <form onSubmit={(e) => { void handleFetchByDocNumber(e); }} className="mt-3 flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Doc Number"
                    value={fetchDocNumber}
                    onChange={(e) => { setFetchDocNumber(e.target.value); setFetchDocNumberResult(null); setPendingConfirm(null); }}
                    className="min-w-0 flex-1 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2.5 py-1.5 text-[11px] text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={fetchDocNumberLoading || !fetchDocNumber.trim()}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
                  >
                    {fetchDocNumberLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    Traer
                  </button>
                </form>
                {pendingConfirm && (
                  <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-[10px] font-bold text-amber-800">
                      {pendingConfirm.entityType === "CreditMemo" ? "Nota de crédito" : "Factura"} {pendingConfirm.docNumber} ya existe en el historial
                    </p>
                    <p className="mt-0.5 text-[10px] text-amber-700">
                      {"Estado: "}
                      {{ en_cola: "En cola", capturada: "Capturada", mapeada: "Mapeada", enviada: "Enviada" }[pendingConfirm.pipelineStatus] ?? pendingConfirm.pipelineStatus}
                      {" · Fuente: "}
                      {{ sync: "Sync", webhook: "Webhook", manual: "Manual" }[pendingConfirm.importSource] ?? pendingConfirm.importSource}
                      {pendingConfirm.sentAt ? ` · Enviada ${formatQboDate(pendingConfirm.sentAt.slice(0, 10))}` : ""}
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => { void handleConfirmReplace(); }}
                        disabled={fetchDocNumberLoading}
                        className="rounded-md bg-amber-600 px-2.5 py-1 text-[10px] font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
                      >
                        Reemplazar
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPendingConfirm(null); setFetchDocNumber(""); }}
                        className="rounded-md border border-amber-200 px-2.5 py-1 text-[10px] font-bold text-amber-700 transition hover:bg-amber-100"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                {fetchDocNumberResult && (
                  <p className={`mt-1.5 text-[10px] font-medium leading-snug ${fetchDocNumberResult.ok ? "text-[var(--gbp-success)]" : "text-[var(--gbp-error)]"}`}>
                    {fetchDocNumberResult.ok ? "✓" : "✗"} {fetchDocNumberResult.message}
                  </p>
                )}
              </article>
            ))}

            {/* Empty slots — only when plan has a defined limit */}
            {maxR365Connections != null && Array.from({ length: Math.max(0, maxR365Connections - syncConfigs.length) }).map((_, i) => (
              <button
                key={`empty-${i}`}
                type="button"
                onClick={() => setIsCreateSyncOpen(true)}
                className="group flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[var(--gbp-border)] bg-transparent px-5 py-6 text-center transition hover:border-[var(--gbp-accent)] hover:bg-[color-mix(in_oklab,var(--gbp-accent)_5%,transparent)]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--gbp-border)] text-[var(--gbp-muted)] transition group-hover:border-[var(--gbp-accent)] group-hover:text-[var(--gbp-accent)]">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--gbp-muted)] transition group-hover:text-[var(--gbp-accent)]">Slot libre</span>
                <span className="text-[10px] text-[var(--gbp-muted)]">Configurar conexión</span>
              </button>
            ))}

            {/* Empty state when no limit and no configs */}
            {maxR365Connections == null && syncConfigs.length === 0 && !syncConfigsLoading && (
              <div className="col-span-full rounded-[14px] border-[1.5px] border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-10 text-center">
                <p className="text-sm font-semibold text-[var(--gbp-text2)]">No hay conexiones configuradas</p>
                <p className="mt-1 text-xs text-[var(--gbp-muted)]">Creá una conexión para enviar facturas de un cliente a R365.</p>
              </div>
            )}
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
                                {mode === "developer" && c.raw && (
                                  <span className="ml-1.5 text-[10px] text-[var(--gbp-muted)]">({JSON.stringify(c.raw)})</span>
                                )}
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
                {mode === "developer" && pickedCustomerRaw && (
                  <div className="mt-2 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--gbp-accent)]">GET /Customer/{String(pickedCustomerRaw.Id ?? "")} — raw</p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-[var(--gbp-text2)]">{JSON.stringify(pickedCustomerRaw, null, 2)}</pre>
                  </div>
                )}
              </div>
              {/* Nombre del proveedor en R365 */}
              <div>
                <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">Proveedor en R365</h4>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Nombre del proveedor en R365</span>
                  <input
                    type="text"
                    placeholder="Ej: PRODEL DISTRIBUTION INC"
                    value={newSyncVendorName}
                    onChange={(e) => setNewSyncVendorName(e.target.value)}
                    className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none"
                  />
                  <span className="mt-1 block text-[10px] text-[var(--gbp-muted)]">Exactamente como aparece en R365 (case-sensitive)</span>
                </label>
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
                    <div className="relative">
                      <input required={mode !== "developer"} type={showNewSyncFtpPass ? "text" : "password"} autoComplete="new-password" data-lpignore="true" value={newSyncFtpPass} onChange={(e) => setNewSyncFtpPass(e.target.value)}
                        className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 pr-9 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                      <button type="button" onClick={() => setShowNewSyncFtpPass((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--gbp-muted)] hover:text-[var(--gbp-text2)]">
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Remote Path</span>
                    <input type="text" value={newSyncFtpPath} onChange={(e) => setNewSyncFtpPath(e.target.value)}
                      className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none" />
                  </label>
                </div>
              </div>
              {/* Importación histórica */}
              <div>
                <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">Importación histórica</h4>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={newSyncBackfillEnabled}
                    onChange={(e) => {
                      setNewSyncBackfillEnabled(e.target.checked);
                      if (!e.target.checked) setNewSyncBackfillFromDate("");
                    }}
                    className="mt-0.5 h-4 w-4 accent-[var(--gbp-accent)]"
                  />
                  <span className="text-sm text-[var(--gbp-text)]">
                    Traer facturas anteriores a la fecha de hoy
                  </span>
                </label>
                {newSyncBackfillEnabled && (
                  <div className="mt-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-[var(--gbp-text2)]">Desde *</span>
                      <input
                        required
                        type="date"
                        value={newSyncBackfillFromDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setNewSyncBackfillFromDate(e.target.value)}
                        className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm focus:border-[var(--gbp-accent)] focus:outline-none"
                      />
                      <span className="mt-1 block text-[10px] text-[var(--gbp-muted)]">
                        Se importarán todas las facturas y notas de crédito de este cliente desde esa fecha. Corre en segundo plano.
                      </span>
                    </label>
                  </div>
                )}
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

      {/* ─── Historial Unificado ─── */}
      <section className="mb-6" ref={invoiceHistorySectionRef}>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Historial de Facturas</h2>
          {syncHistoryFilter && (
            <div className="flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--gbp-accent)] bg-[color-mix(in_oklab,var(--gbp-accent)_10%,transparent)] pl-3 pr-1.5 py-1">
              <span className="text-[11px] font-bold text-[var(--gbp-accent)]">{syncHistoryFilter.name}</span>
              <button
                type="button"
                onClick={() => { setSyncHistoryFilter(null); }}
                className="rounded-full p-0.5 text-[var(--gbp-accent)] hover:bg-[var(--gbp-accent)] hover:text-white transition"
                title="Ver todo el historial"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {unifiedHistoryLoading && <Loader2 className="h-4 w-4 animate-spin text-[var(--gbp-muted)]" />}
        </div>
        {(() => {
          const PAGE_SIZE = 15;
          const totalPages = Math.max(1, Math.ceil(sortedUnifiedHistory.length / PAGE_SIZE));
          const pageRows = sortedUnifiedHistory.slice((unifiedPage - 1) * PAGE_SIZE, unifiedPage * PAGE_SIZE);
          function handleUnifiedSort(col: "txnDate" | "createdAt") {
            setUnifiedSort((prev) => prev.col === col ? { col, dir: prev.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" });
            setUnifiedPage(1);
          }
          function SortIcon({ col }: { col: "txnDate" | "createdAt" }) {
            if (unifiedSort.col !== col) return <ChevronsUpDown className="h-3 w-3 opacity-30" />;
            return unifiedSort.dir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />;
          }
          const pipelineColors: Record<string, string> = {
            en_cola: "bg-[var(--gbp-bg)] text-[var(--gbp-text2)]",
            capturada: "bg-blue-50 text-blue-600",
            mapeada: "bg-[color-mix(in_oklab,var(--gbp-accent)_15%,transparent)] text-[var(--gbp-accent)]",
            enviada: "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]",
          };
          const pipelineLabels: Record<string, string> = { en_cola: "En cola", capturada: "Capturada", mapeada: "Mapeada", enviada: "Enviada" };
          return (
            <div className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">
                      <th className="cursor-pointer select-none px-4 py-3 hover:text-[var(--gbp-text)]" onClick={() => handleUnifiedSort("txnDate")}>
                        <span className="inline-flex items-center gap-1">Fecha <SortIcon col="txnDate" /></span>
                      </th>
                      <th className="px-4 py-3">Doc #</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Monto</th>
                      <th className="px-4 py-3">Fuente</th>
                      <th className="px-4 py-3">Pipeline</th>
                      <th className="cursor-pointer select-none px-4 py-3 hover:text-[var(--gbp-text)]" onClick={() => handleUnifiedSort("createdAt")}>
                        <span className="inline-flex items-center gap-1">Recibida <SortIcon col="createdAt" /></span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((item) => (
                      <tr
                        key={item.id}
                        className="cursor-pointer border-b border-[var(--gbp-border)] transition hover:bg-[var(--gbp-bg)]"
                        onClick={() => setSelectedInvoiceId(item.entityId)}
                      >
                        <td className="px-4 py-3 text-xs text-[var(--gbp-text)]">{formatQboDate(item.txnDate)}</td>
                        <td className="px-4 py-3 text-xs font-medium text-[var(--gbp-text)]">{item.docNumber ?? item.entityId.slice(0, 10)}</td>
                        <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{item.entityType}</td>
                        <td className="px-4 py-3 text-xs text-[var(--gbp-text)]">{resolveHistoryCustomerName(item, syncConfigs)}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-[var(--gbp-text)]">{item.totalAmount != null ? item.totalAmount.toFixed(2) : "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            item.importSource === "webhook" ? "bg-purple-50 text-purple-600"
                            : item.importSource === "manual" ? "bg-amber-50 text-amber-600"
                            : "bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"
                          }`}>
                            {item.importSource === "webhook" ? "Webhook" : item.importSource === "manual" ? "Manual" : "Sync"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${pipelineColors[item.pipelineStatus] ?? ""}`}>
                            {pipelineLabels[item.pipelineStatus] ?? item.pipelineStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--gbp-muted)]">{relativeTime(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!unifiedHistory.length && !unifiedHistoryLoading && (
                <EmptyState
                  icon={Search}
                  title={syncHistoryFilter ? `Sin facturas para ${syncHistoryFilter.name}` : "Sin historial de facturas"}
                  description="Las facturas aparecen aquí cuando llegan por webhook o sync."
                />
              )}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[var(--gbp-border)] px-4 py-3">
                  <span className="text-[11px] text-[var(--gbp-muted)]">
                    {(unifiedPage - 1) * PAGE_SIZE + 1}–{Math.min(unifiedPage * PAGE_SIZE, sortedUnifiedHistory.length)} de {sortedUnifiedHistory.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={unifiedPage === 1}
                      onClick={() => setUnifiedPage((p) => p - 1)}
                      className="rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-40"
                    >
                      ‹ Anterior
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setUnifiedPage(p)}
                        className={`rounded-lg border-[1.5px] px-2.5 py-1 text-[11px] font-bold transition ${
                          p === unifiedPage
                            ? "border-[var(--gbp-accent)] bg-[color-mix(in_oklab,var(--gbp-accent)_12%,transparent)] text-[var(--gbp-accent)]"
                            : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={unifiedPage === totalPages}
                      onClick={() => setUnifiedPage((p) => p + 1)}
                      className="rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)] disabled:opacity-40"
                    >
                      Siguiente ›
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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

      {/* Panel minimal para filas de webhook que no están en el historial legacy */}
      {selectedUnifiedRow && (
        <>
          <button type="button" onClick={() => setSelectedInvoiceId(null)} className="fixed inset-0 z-[110] bg-black/30" />
          <aside className="fixed right-0 top-0 z-[120] flex h-full w-full max-w-md flex-col border-l-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-xl)]">
            <header className="flex items-start justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
                  {selectedUnifiedRow.importSource === "webhook" ? "Webhook" : selectedUnifiedRow.importSource === "manual" ? "Manual" : "Sync"} · {selectedUnifiedRow.entityType}
                </p>
                <h3 className="mt-1 text-lg font-bold text-[var(--gbp-text)]">{selectedUnifiedRow.docNumber ?? selectedUnifiedRow.entityId}</h3>
                <p className="mt-0.5 text-xs text-[var(--gbp-text2)]">{formatQboDate(selectedUnifiedRow.txnDate)}{selectedUnifiedRow.customerName ? ` · ${selectedUnifiedRow.customerName}` : ""}</p>
                {invoiceDetail && invoiceDetail.lines.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {(["csv", "txt", "json", "pdf"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => handleInvoiceExport(fmt, { id: selectedUnifiedRow.id, docNumber: selectedUnifiedRow.docNumber, entityType: selectedUnifiedRow.entityType, rawEntity: selectedUnifiedRow.rawEntity, customerName: selectedUnifiedRow.customerName })}
                        className="rounded-md border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)]"
                      >
                        {fmt}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={previewingCsv}
                      onClick={() => {
                        setCsvPreview(null);
                        void handlePreviewUnifiedCsv(selectedUnifiedRow.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-accent)] disabled:opacity-50"
                    >
                      {previewingCsv ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                      {previewingCsv ? "Generando..." : csvPreview ? "Ocultar CSV" : "Previsualizar CSV"}
                    </button>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setSelectedInvoiceId(null)} className="rounded-lg p-1.5 text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Pipeline 4 pasos */}
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-muted)]">Pipeline</p>
              {(() => {
                const STATUS_ORDER = ["en_cola", "capturada", "mapeada", "enviada"] as const;
                const LABELS: Record<string, string> = { en_cola: "En cola", capturada: "Capturada", mapeada: "Mapeada", enviada: "Enviada" };
                const currentIdx = STATUS_ORDER.indexOf(selectedUnifiedRow.pipelineStatus as typeof STATUS_ORDER[number]);
                return (
                  <div className="relative grid grid-cols-4 gap-1">
                    <div className="absolute top-4 h-0.5 bg-[var(--gbp-border)]" style={{ left: "12.5%", right: "12.5%" }} />
                    {currentIdx >= 1 && <div className="absolute top-4 h-0.5 bg-[var(--gbp-success)] transition-all" style={{ left: "12.5%", width: `${currentIdx * 25}%` }} />}
                    {STATUS_ORDER.map((step, idx) => {
                      const done = idx <= currentIdx;
                      return (
                        <div key={step} className="flex flex-col items-center gap-1 text-center">
                          <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${done ? "border-[var(--gbp-success)] bg-[color-mix(in_oklab,var(--gbp-success)_15%,transparent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)]"}`}>
                            {done ? <CheckCircle2 className="h-4 w-4 text-[var(--gbp-success)]" /> : <Clock className="h-3.5 w-3.5 text-[var(--gbp-muted)]" />}
                          </div>
                          <span className={`text-[9px] font-extrabold uppercase tracking-[0.1em] ${done ? "text-[var(--gbp-text)]" : "text-[var(--gbp-muted)]"}`}>{LABELS[step]}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {/* Ítems — disponibles cuando raw_entity fue cargado (webhook, manual, sync) */}
              {invoiceDetailLoading && (
                <div className="mt-5 flex items-center gap-2 text-xs text-[var(--gbp-muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando ítems...
                </div>
              )}
              {!invoiceDetailLoading && invoiceDetail && invoiceDetail.lines.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">
                    Ítems · {invoiceDetail.lines.length} línea{invoiceDetail.lines.length !== 1 ? "s" : ""}
                  </p>
                  <div className="overflow-x-auto rounded-xl border-[1.5px] border-[var(--gbp-border)]">
                    <table className="w-full min-w-[400px] text-xs">
                      <thead>
                        <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)]">
                          <th className="px-3 py-2 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Ítem</th>
                          <th className="px-3 py-2 text-right font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Cant.</th>
                          <th className="px-3 py-2 text-right font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Precio</th>
                          <th className="px-3 py-2 text-right font-bold uppercase tracking-wide text-[var(--gbp-muted)]">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--gbp-border)]">
                        {invoiceDetail.lines.map((line) => {
                          const sign = isCreditMemoSelected ? -1 : 1;
                          const shortName = line.itemName ? line.itemName.split(":").pop()!.trim() : null;
                          return (
                            <tr key={line.sourceLineId} className="hover:bg-[var(--gbp-bg)]">
                              <td className="px-3 py-2.5">
                                {shortName
                                  ? <span className="font-semibold text-[var(--gbp-text)]">{shortName}</span>
                                  : <span className="text-[var(--gbp-muted)]">{line.description || "-"}</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right text-[var(--gbp-text)]">{line.quantity ?? "-"}</td>
                              <td className="px-3 py-2.5 text-right text-[var(--gbp-text)]">{line.unitPrice != null ? (sign * line.unitPrice).toFixed(2) : "-"}</td>
                              <td className="px-3 py-2.5 text-right font-semibold text-[var(--gbp-text)]">{line.lineAmount != null ? (sign * line.lineAmount).toFixed(2) : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-col items-end gap-1 text-sm">
                    {!isCreditMemoSelected && invoiceDetail.totalTax > 0 && (
                      <div className="flex w-56 items-center justify-between gap-4">
                        <span className="text-[var(--gbp-text2)]">Impuestos</span>
                        <span className="font-semibold text-[var(--gbp-text)]">{invoiceDetail.totalTax.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex w-56 items-center justify-between gap-4 rounded-lg bg-[var(--gbp-bg)] px-3 py-2">
                      <span className="font-bold text-[var(--gbp-text)]">Total</span>
                      <span className="font-bold text-[var(--gbp-text)]">
                        {(isCreditMemoSelected ? -invoiceDetail.grandTotal : invoiceDetail.grandTotal).toFixed(2)} {selectedUnifiedRow.currency ?? ""}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {!invoiceDetailLoading && selectedUnifiedRow.totalAmount != null && (!invoiceDetail || invoiceDetail.lines.length === 0) && (
                <div className="mt-5 rounded-[10px] border border-[var(--gbp-border)] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Total</p>
                  <p className="mt-1 text-lg font-bold text-[var(--gbp-text)]">
                    {(isCreditMemoSelected ? -selectedUnifiedRow.totalAmount : selectedUnifiedRow.totalAmount).toFixed(2)} {selectedUnifiedRow.currency ?? ""}
                  </p>
                </div>
              )}
              {csvPreview && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[var(--gbp-muted)]">
                      {csvPreview.rowCount} fila{csvPreview.rowCount !== 1 ? "s" : ""} · CSV R365
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
                      Copiar
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-[var(--gbp-border)]">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)]">
                          {csvPreview.headers.map((h, i) => (
                            <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-bold uppercase tracking-wide text-[var(--gbp-muted)]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--gbp-border)]">
                        {csvPreview.rows.map((row, ri) => (
                          <tr key={ri} className="hover:bg-[var(--gbp-bg)]">
                            {row.map((cell, ci) => (
                              <td key={ci} className="max-w-[120px] truncate whitespace-nowrap px-2 py-1.5 font-mono text-[var(--gbp-text)]" title={cell}>
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
              <div className="mt-3 rounded-[10px] border border-[var(--gbp-border)] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Entity ID (QBO)</p>
                <p className="mt-1 font-mono text-xs text-[var(--gbp-text2)]">{selectedUnifiedRow.entityId}</p>
              </div>
            </div>
            <footer className="flex gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
              <button type="button" onClick={() => setSelectedInvoiceId(null)}
                className="rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-surface2)]">
                Cerrar
              </button>
              {(selectedUnifiedRow.pipelineStatus === "capturada" || selectedUnifiedRow.pipelineStatus === "en_cola") ? (
                <button
                  type="button"
                  disabled={mappingUnifiedInvoice}
                  onClick={() => void handleMapUnifiedInvoice(selectedUnifiedRow.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--gbp-accent)] px-3 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {mappingUnifiedInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                  {mappingUnifiedInvoice ? "Mapeando..." : "Mapear"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={sendingUnifiedInvoice || selectedUnifiedRow.pipelineStatus === "enviada"}
                  onClick={() => void handleSendUnifiedInvoice(selectedUnifiedRow.id)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-bold transition disabled:opacity-50 ${
                    selectedUnifiedRow.pipelineStatus === "enviada"
                      ? "border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"
                      : "bg-[var(--gbp-accent)] text-white hover:opacity-90"
                  }`}
                >
                  {sendingUnifiedInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {sendingUnifiedInvoice ? "Enviando..." : selectedUnifiedRow.pipelineStatus === "enviada" ? "Ya enviada" : "Enviar a R365"}
                </button>
              )}
            </footer>
          </aside>
        </>
      )}




    </main>
  );
}

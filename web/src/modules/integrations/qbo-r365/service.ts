import { Client as FtpClient } from "basic-ftp";
import { Readable } from "stream";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { logAuditEvent } from "@/shared/lib/audit";
import { decryptJsonPayload, encryptJsonPayload } from "@/modules/integrations/qbo-r365/crypto";
import { createOAuthStateToken } from "@/modules/integrations/qbo-r365/oauth-state";
import {
  buildQboAuthorizeUrl,
  exchangeQboOAuthCode,
  fetchQboCustomers,
  fetchQboSalesTransactions,
  refreshQboAccessToken,
  type QboCustomer,
  type QboInvoiceLike,
} from "@/modules/integrations/qbo-r365/qbo-client";
import { buildR365Csv, type NormalizedInvoiceLine } from "@/modules/integrations/qbo-r365/r365-csv";
import {
  qboR365ConfigUpsertSchema,
  qboR365SettingsSchema,
  syncConfigCreateSchema,
  syncConfigUpdateSchema,
  type FtpStoredSecrets,
  type IntegrationProvider,
  type SyncConfigCreatePayload,
  type SyncConfigSummary,
  type SyncConfigUpdatePayload,
  type QboStoredSecrets,
} from "@/modules/integrations/qbo-r365/types";

type ConnectionRow = {
  id: string;
  organization_id: string;
  provider: IntegrationProvider;
  status: "disconnected" | "connected" | "error";
  config: Record<string, unknown>;
  secrets_ciphertext: string | null;
  secrets_iv: string | null;
  secrets_tag: string | null;
  connected_at: string | null;
  last_error: string | null;
};

type SettingsRow = {
  organization_id: string;
  qbo_r365_template: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates";
  tax_mode: "line" | "header" | "none";
  timezone: string;
  file_prefix: string;
  ftp_remote_path: string;
  incremental_lookback_hours: number;
  max_retry_attempts: number;
  is_enabled: boolean;
  last_run_at: string | null;
};

type SyncConfigRow = {
  id: string;
  organization_id: string;
  name: string;
  qbo_customer_id: string;
  qbo_customer_name: string;
  schedule_interval: "manual" | "daily" | "weekly" | "hourly";
  lookback_hours: number;
  r365_ftp_host: string | null;
  r365_ftp_port: number | null;
  r365_ftp_username: string | null;
  r365_ftp_secrets_ciphertext: string | null;
  r365_ftp_secrets_iv: string | null;
  r365_ftp_secrets_tag: string | null;
  r365_ftp_remote_path: string;
  r365_ftp_secure: boolean;
  template: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates";
  tax_mode: "line" | "header" | "none";
  status: "active" | "paused";
  last_run_at: string | null;
  created_at: string;
};

type MappingRow = {
  target_field: string;
  source_field: string | null;
  transform_rule: Record<string, unknown>;
};

function getGlobalQboOAuthConfig() {
  const clientId = process.env.QBO_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.QBO_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.QBO_REDIRECT_URI?.trim() ?? "";
  return {
    clientId,
    clientSecret,
    redirectUri,
    ready: Boolean(clientId && clientSecret && redirectUri),
  };
}

function mask(value: string | undefined | null) {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function parseConnectionSecrets<T>(row: ConnectionRow | null) {
  if (!row) return null;
  return decryptJsonPayload<T>({
    ciphertext: row.secrets_ciphertext,
    iv: row.secrets_iv,
    tag: row.secrets_tag,
  });
}

async function getConnection(organizationId: string, provider: IntegrationProvider) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_connections")
    .select("id, organization_id, provider, status, config, secrets_ciphertext, secrets_iv, secrets_tag, connected_at, last_error")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ConnectionRow | null) ?? null;
}

async function upsertConnection(input: {
  organizationId: string;
  provider: IntegrationProvider;
  actorId?: string | null;
  status?: "disconnected" | "connected" | "error";
  config?: Record<string, unknown>;
  secretPayload?: Record<string, unknown> | null;
  connectedAt?: string | null;
  lastError?: string | null;
}) {
  const admin = createSupabaseAdminClient();

  let encrypted: { ciphertext: string; iv: string; tag: string } | null = null;
  if (input.secretPayload) {
    encrypted = encryptJsonPayload(input.secretPayload);
  }

  const payload: Record<string, unknown> = {
    organization_id: input.organizationId,
    provider: input.provider,
    updated_by: input.actorId ?? null,
  };

  if (input.status) payload.status = input.status;
  if (input.config) payload.config = input.config;
  if (input.connectedAt !== undefined) payload.connected_at = input.connectedAt;
  if (input.lastError !== undefined) payload.last_error = input.lastError;
  if (encrypted) {
    payload.secrets_ciphertext = encrypted.ciphertext;
    payload.secrets_iv = encrypted.iv;
    payload.secrets_tag = encrypted.tag;
  }

  const { error } = await admin
    .from("integration_connections")
    .upsert({ ...payload, created_by: input.actorId ?? null }, { onConflict: "organization_id,provider" });

  if (error) {
    throw new Error(error.message);
  }
}

// ─── Sync Configs CRUD ────────────────────────────────────────────────────────

async function getSyncConfigRow(organizationId: string, id: string): Promise<SyncConfigRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("qbo_r365_sync_configs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Sync config no encontrada");
  }

  return data as SyncConfigRow;
}

export async function listSyncConfigs(organizationId: string): Promise<SyncConfigSummary[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("qbo_r365_sync_configs")
    .select("id, name, qbo_customer_id, qbo_customer_name, schedule_interval, lookback_hours, template, tax_mode, status, last_run_at, r365_ftp_host, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    qboCustomerId: row.qbo_customer_id as string,
    qboCustomerName: row.qbo_customer_name as string,
    scheduleInterval: row.schedule_interval === "hourly"
      ? "daily"
      : (row.schedule_interval as SyncConfigSummary["scheduleInterval"]),
    lookbackHours: Number(row.lookback_hours ?? 48),
    template: row.template as SyncConfigSummary["template"],
    taxMode: row.tax_mode as SyncConfigSummary["taxMode"],
    status: row.status as SyncConfigSummary["status"],
    lastRunAt: (row.last_run_at as string | null) ?? null,
    hasFtp: Boolean(row.r365_ftp_host),
    createdAt: row.created_at as string,
  }));
}

export async function createSyncConfig(
  organizationId: string,
  actorId: string | null,
  payload: SyncConfigCreatePayload,
): Promise<string> {
  const admin = createSupabaseAdminClient();

  const ftpHost = payload.r365FtpHost?.trim() ?? "";
  const ftpUsername = payload.r365FtpUsername?.trim() ?? "";
  const ftpPassword = payload.r365FtpPassword?.trim() ?? "";
  const hasAnyFtpField = Boolean(ftpHost || ftpUsername || ftpPassword);
  const hasAllFtpFields = Boolean(ftpHost && ftpUsername && ftpPassword);

  if (hasAnyFtpField && !hasAllFtpFields) {
    throw new Error("Para configurar FTP, completa host, usuario y contrasena.");
  }

  const encrypted = hasAllFtpFields
    ? encryptJsonPayload({ password: ftpPassword })
    : null;

  const { data, error } = await admin
    .from("qbo_r365_sync_configs")
    .insert({
      organization_id: organizationId,
      name: payload.name,
      qbo_customer_id: payload.qboCustomerId,
      qbo_customer_name: payload.qboCustomerName,
      schedule_interval: payload.scheduleInterval,
      lookback_hours: payload.lookbackHours,
      r365_ftp_host: hasAllFtpFields ? ftpHost : null,
      r365_ftp_port: hasAllFtpFields ? payload.r365FtpPort : null,
      r365_ftp_username: hasAllFtpFields ? ftpUsername : null,
      r365_ftp_secrets_ciphertext: encrypted?.ciphertext ?? null,
      r365_ftp_secrets_iv: encrypted?.iv ?? null,
      r365_ftp_secrets_tag: encrypted?.tag ?? null,
      r365_ftp_remote_path: hasAllFtpFields ? payload.r365FtpRemotePath : "/APImports/R365",
      r365_ftp_secure: hasAllFtpFields ? payload.r365FtpSecure : false,
      template: payload.template,
      tax_mode: payload.taxMode,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message || "No se pudo crear la sync config");

  return data.id as string;
}

export async function updateSyncConfig(
  organizationId: string,
  id: string,
  actorId: string | null,
  payload: SyncConfigUpdatePayload,
): Promise<void> {
  const admin = createSupabaseAdminClient();

  const patch: Record<string, unknown> = { updated_by: actorId };

  if (payload.name !== undefined) patch.name = payload.name;
  if (payload.qboCustomerId !== undefined) patch.qbo_customer_id = payload.qboCustomerId;
  if (payload.qboCustomerName !== undefined) patch.qbo_customer_name = payload.qboCustomerName;
  if (payload.scheduleInterval !== undefined) patch.schedule_interval = payload.scheduleInterval;
  if (payload.lookbackHours !== undefined) patch.lookback_hours = payload.lookbackHours;
  if (payload.r365FtpHost !== undefined) patch.r365_ftp_host = payload.r365FtpHost;
  if (payload.r365FtpPort !== undefined) patch.r365_ftp_port = payload.r365FtpPort;
  if (payload.r365FtpUsername !== undefined) patch.r365_ftp_username = payload.r365FtpUsername;
  if (payload.r365FtpRemotePath !== undefined) patch.r365_ftp_remote_path = payload.r365FtpRemotePath;
  if (payload.r365FtpSecure !== undefined) patch.r365_ftp_secure = payload.r365FtpSecure;
  if (payload.template !== undefined) patch.template = payload.template;
  if (payload.taxMode !== undefined) patch.tax_mode = payload.taxMode;
  if (payload.status !== undefined) patch.status = payload.status;

  if (payload.r365FtpPassword !== undefined) {
    const encrypted = encryptJsonPayload({ password: payload.r365FtpPassword });
    patch.r365_ftp_secrets_ciphertext = encrypted.ciphertext;
    patch.r365_ftp_secrets_iv = encrypted.iv;
    patch.r365_ftp_secrets_tag = encrypted.tag;
  }

  const { error } = await admin
    .from("qbo_r365_sync_configs")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteSyncConfig(organizationId: string, id: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("qbo_r365_sync_configs")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function listQboCustomers(organizationId: string): Promise<QboCustomer[]> {
  const qboConnection = await getConnection(organizationId, "quickbooks_online");
  if (!qboConnection || qboConnection.status !== "connected") {
    throw new Error("QuickBooks Online no esta conectado");
  }

  const qboAuth = await ensureFreshQboToken({ organizationId, actorId: null, qboConnection });
  const useSandbox = Boolean((qboConnection.config as Record<string, unknown>)?.useSandbox ?? false);

  return fetchQboCustomers({
    accessToken: qboAuth.accessToken,
    realmId: qboAuth.realmId,
    useSandbox,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function getSettings(organizationId: string): Promise<SettingsRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_settings")
    .select("organization_id, qbo_r365_template, tax_mode, timezone, file_prefix, ftp_remote_path, incremental_lookback_hours, max_retry_attempts, is_enabled, last_run_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data as SettingsRow;
  }

  const defaults = qboR365SettingsSchema.parse({});
  const { error: insertError } = await admin.from("integration_settings").insert({
    organization_id: organizationId,
    qbo_r365_template: defaults.template,
    tax_mode: defaults.taxMode,
    timezone: defaults.timezone,
    file_prefix: defaults.filePrefix,
    ftp_remote_path: "/APImports/R365",
    incremental_lookback_hours: defaults.incrementalLookbackHours,
    max_retry_attempts: defaults.maxRetryAttempts,
    is_enabled: defaults.isEnabled,
  });
  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    organization_id: organizationId,
    qbo_r365_template: defaults.template,
    tax_mode: defaults.taxMode,
    timezone: defaults.timezone,
    file_prefix: defaults.filePrefix,
    ftp_remote_path: "/APImports/R365",
    incremental_lookback_hours: defaults.incrementalLookbackHours,
    max_retry_attempts: defaults.maxRetryAttempts,
    is_enabled: defaults.isEnabled,
    last_run_at: null,
  };
}

function toIsoLookback(hours: number) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

async function getActiveMappings(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_mappings")
    .select("target_field, source_field, transform_rule")
    .eq("organization_id", organizationId)
    .eq("source_system", "qbo")
    .eq("target_system", "r365_multi_invoice")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as MappingRow[];
}

function readPath(obj: Record<string, unknown>, path: string) {
  const segments = path.split(".").map((part) => part.trim()).filter(Boolean);
  let current: unknown = obj;
  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function applyMappings(
  line: NormalizedInvoiceLine,
  mappings: MappingRow[],
  sourceData: Record<string, unknown>,
) {
  if (mappings.length === 0) {
    return line;
  }

  const next = { ...line };
  for (const mapping of mappings) {
    const transform = mapping.transform_rule ?? {};
    let value: unknown = null;

    if (mapping.source_field) {
      value = readPath(sourceData, mapping.source_field);
    }

    if ((value === null || value === undefined || value === "") && transform.default !== undefined) {
      value = transform.default;
    }

    if (typeof value === "string") {
      if (transform.uppercase === true) value = value.toUpperCase();
      if (typeof transform.prefix === "string") value = `${transform.prefix}${value}`;
      if (typeof transform.suffix === "string") value = `${value}${transform.suffix}`;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (mapping.target_field === "targetCode" || mapping.target_field === "target_code") {
      next.targetCode = String(value);
    } else if (mapping.target_field === "description") {
      next.description = String(value);
    } else if (mapping.target_field === "vendor") {
      next.vendor = String(value);
    } else if (mapping.target_field === "location") {
      next.location = String(value);
    } else if (mapping.target_field === "memo") {
      next.memo = String(value);
    }
  }

  return next;
}

function normalizeQboRows(input: {
  invoices: QboInvoiceLike[];
  salesReceipts: QboInvoiceLike[];
  creditMemos: QboInvoiceLike[];
  template: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates";
  taxMode: "line" | "header" | "none";
  mappings: MappingRow[];
}) {
  const getQboStatusRaw = (kind: "invoice" | "sales_receipt" | "credit", row: QboInvoiceLike, paymentStatus: "paid" | "unpaid" | "partial" | "not_applicable" | "unknown") => {
    const candidate = (row as unknown as Record<string, unknown>).TxnStatus;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (kind === "credit") return "Credit Memo";
    if (kind === "sales_receipt") return "Paid";
    if (paymentStatus === "paid") return "Paid";
    if (paymentStatus === "partial") return "Partially Paid";
    if (paymentStatus === "unpaid") return "Open";
    return "Unknown";
  };

  const all = [
    ...input.invoices.map((item) => ({ kind: "invoice" as const, data: item })),
    ...input.salesReceipts.map((item) => ({ kind: "sales_receipt" as const, data: item })),
    ...input.creditMemos.map((item) => ({ kind: "credit" as const, data: item })),
  ];

  const lines: NormalizedInvoiceLine[] = [];
  for (const row of all) {
    const invoiceId = row.data.Id ?? "unknown_invoice";
    const vendor = row.data.CustomerRef?.name || row.data.CustomerRef?.value || "UNKNOWN_CUSTOMER";
    const invoiceNumber = row.data.DocNumber || `QBO-${invoiceId}`;
    const invoiceDate = row.data.TxnDate || new Date().toISOString().slice(0, 10);
    const totalAmount = Number(row.data.TotalAmt ?? 0);
    const balanceAmount = Number(row.data.Balance ?? Number.NaN);
    const qboPaymentStatus: "paid" | "unpaid" | "partial" | "not_applicable" | "unknown" = row.kind === "credit"
      ? "not_applicable"
      : row.kind === "sales_receipt"
        ? "paid"
        : Number.isFinite(balanceAmount)
          ? (balanceAmount <= 0 ? "paid" : (Number.isFinite(totalAmount) && balanceAmount < totalAmount ? "partial" : "unpaid"))
          : "unknown";
    const qboStatusRaw = getQboStatusRaw(row.kind, row.data, qboPaymentStatus);
    const headerTax = Number(row.data.TxnTaxDetail?.TotalTax ?? 0);
    const baseLines = row.data.Line ?? [];
    const baseAmountSum = baseLines.reduce((sum, line) => sum + Number(line.Amount ?? 0), 0);

    for (let index = 0; index < baseLines.length; index += 1) {
      const line = baseLines[index];
      const lineAmount = Number(line.Amount ?? 0);
      const qty = Number(line.SalesItemLineDetail?.Qty ?? 1);
      const unitPrice = Number(line.SalesItemLineDetail?.UnitPrice ?? (qty > 0 ? lineAmount / qty : lineAmount));
      const accountOrItem =
        (input.template === "by_item" || input.template === "by_item_service_dates")
          ? line.SalesItemLineDetail?.ItemRef?.value || line.SalesItemLineDetail?.ItemRef?.name || "UNMAPPED_ITEM"
          : line.AccountBasedExpenseLineDetail?.AccountRef?.value || line.AccountBasedExpenseLineDetail?.AccountRef?.name || "UNMAPPED_ACCOUNT";

      const explicitLineTax = Number(
        line.TaxAmount
          ?? line.SalesItemLineDetail?.TaxAmount
          ?? line.AccountBasedExpenseLineDetail?.TaxAmount
          ?? 0,
      );
      const proportionalTax = baseAmountSum > 0 ? (lineAmount / baseAmountSum) * headerTax : 0;
      const taxAmount = input.taxMode === "none"
        ? 0
        : input.taxMode === "line"
          ? (explicitLineTax || proportionalTax)
          : proportionalTax;
      const lineTotalAmount = lineAmount + taxAmount;

      const normalizedLine: NormalizedInvoiceLine = {
        sourceInvoiceId: invoiceId,
        sourceLineId: line.Id || String(index + 1),
        transactionTypeCode: row.kind === "credit" ? "2" : "1",
        vendor,
        invoiceNumber,
        invoiceDate,
        dueDate: row.data.DueDate || invoiceDate,
        currency: row.data.CurrencyRef?.name || row.data.CurrencyRef?.value || "",
        targetCode: accountOrItem,
        description: line.Description || "",
        quantity: Number.isFinite(qty) ? qty : 1,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : lineAmount,
        lineAmount,
        taxAmount,
        totalAmount: Number.isFinite(lineTotalAmount)
          ? lineTotalAmount
          : (Number.isFinite(totalAmount) ? totalAmount : lineAmount),
        qboBalance: Number.isFinite(balanceAmount) ? balanceAmount : undefined,
        qboPaymentStatus,
        qboStatusRaw,
        location: "",
        memo: row.data.PrivateNote || "",
      };

      lines.push(applyMappings(normalizedLine, input.mappings, {
        invoice: row.data as unknown as Record<string, unknown>,
        line: line as unknown as Record<string, unknown>,
      }));
    }
  }

  return lines;
}

function buildDedupeKey(line: NormalizedInvoiceLine) {
  return `${line.sourceInvoiceId}:${line.sourceLineId}:${line.transactionTypeCode}:${line.lineAmount}:${line.targetCode}`;
}

async function uploadCsvToFtp(input: {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
  remotePath: string;
  fileName: string;
  content: string;
}) {
  const ftp = new FtpClient(15000);
  try {
    await ftp.access({
      host: input.host,
      port: input.port,
      user: input.username,
      password: input.password,
      secure: input.secure,
    });

    await ftp.ensureDir(input.remotePath);
    await ftp.uploadFrom(Readable.from([input.content]), `${input.remotePath}/${input.fileName}`);
  } finally {
    ftp.close();
  }
}

async function createRun(
  organizationId: string,
  triggeredByUserId: string | null,
  triggerSource: "manual" | "scheduled" | "retry",
  syncConfigId?: string | null,
) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_runs")
    .insert({
      organization_id: organizationId,
      triggered_by_user_id: triggeredByUserId,
      trigger_source: triggerSource,
      status: "running",
      started_at: new Date().toISOString(),
      sync_config_id: syncConfigId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "No se pudo iniciar corrida de integracion");
  }

  return data.id as string;
}

async function appendIntegrationAudit(input: {
  organizationId: string;
  runId?: string;
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  await admin.from("integration_audit_logs").insert({
    organization_id: input.organizationId,
    run_id: input.runId ?? null,
    level: input.level,
    code: input.code,
    message: input.message,
    metadata: input.metadata ?? {},
  });
}

export async function getQboR365Snapshot(
  organizationId: string,
  options?: { includeSensitive?: boolean },
) {
  const [settings, qboConnection, ftpConnection] = await Promise.all([
    getSettings(organizationId),
    getConnection(organizationId, "quickbooks_online"),
    getConnection(organizationId, "restaurant365_ftp"),
  ]);

  const qboSecrets = parseConnectionSecrets<QboStoredSecrets>(qboConnection);
  const ftpSecrets = parseConnectionSecrets<FtpStoredSecrets>(ftpConnection);
  const globalQbo = getGlobalQboOAuthConfig();

  return {
    settings: {
      template: settings.qbo_r365_template,
      taxMode: settings.tax_mode,
      timezone: settings.timezone,
      filePrefix: settings.file_prefix,
      ftpRemotePath: settings.ftp_remote_path,
      incrementalLookbackHours: settings.incremental_lookback_hours,
      maxRetryAttempts: settings.max_retry_attempts,
      isEnabled: settings.is_enabled,
      lastRunAt: settings.last_run_at,
    },
    qbo: {
      status: qboConnection?.status ?? "disconnected",
      hasClientId: globalQbo.ready,
      hasClientSecret: globalQbo.ready,
      clientId: options?.includeSensitive && globalQbo.clientId ? globalQbo.clientId : null,
      clientSecret: options?.includeSensitive && globalQbo.clientSecret ? globalQbo.clientSecret : null,
      redirectUri: options?.includeSensitive && globalQbo.redirectUri ? globalQbo.redirectUri : null,
      realmId: ((qboConnection?.config as Record<string, unknown> | undefined)?.realmId as string | undefined) ?? null,
      useSandbox: Boolean((qboConnection?.config as Record<string, unknown> | undefined)?.useSandbox ?? false),
      tokenExpiresAtEpochSec: qboSecrets?.expiresAtEpochSec ?? null,
      hasRefreshToken: Boolean(qboSecrets?.refreshToken),
      lastError: qboConnection?.last_error ?? null,
    },
    r365Ftp: {
      status: ftpConnection?.status ?? "disconnected",
      host: mask(((ftpConnection?.config as Record<string, unknown> | undefined)?.host as string | undefined) ?? null),
      port: ((ftpConnection?.config as Record<string, unknown> | undefined)?.port as number | undefined) ?? 21,
      username: mask(((ftpConnection?.config as Record<string, unknown> | undefined)?.username as string | undefined) ?? null),
      secure: ((ftpConnection?.config as Record<string, unknown> | undefined)?.secure as boolean | undefined) ?? true,
      remotePath: ((ftpConnection?.config as Record<string, unknown> | undefined)?.remotePath as string | undefined) ?? settings.ftp_remote_path,
      hasPassword: Boolean(ftpSecrets?.password),
      lastError: ftpConnection?.last_error ?? null,
    },
  };
}

export async function upsertQboR365Config(input: {
  organizationId: string;
  actorId: string;
  payload: unknown;
}) {
  const parsed = qboR365ConfigUpsertSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new Error("Payload de configuracion invalido");
  }

  const payload = parsed.data;
  const admin = createSupabaseAdminClient();

  if (payload.qbo) {
    throw new Error("Las credenciales developer de QuickBooks se administran globalmente por Super Admin");
  }

  if (payload.settings) {
    await admin.from("integration_settings").upsert({
      organization_id: input.organizationId,
      qbo_r365_template: payload.settings.template,
      tax_mode: payload.settings.taxMode,
      timezone: payload.settings.timezone,
      file_prefix: payload.settings.filePrefix,
      ftp_remote_path: payload.r365Ftp?.remotePath ?? "/APImports/R365",
      incremental_lookback_hours: payload.settings.incrementalLookbackHours,
      max_retry_attempts: payload.settings.maxRetryAttempts,
      is_enabled: payload.settings.isEnabled,
      updated_by: input.actorId,
      created_by: input.actorId,
    }, { onConflict: "organization_id" });
  }

  if (payload.r365Ftp) {
    const previous = await getConnection(input.organizationId, "restaurant365_ftp");
    await upsertConnection({
      organizationId: input.organizationId,
      provider: "restaurant365_ftp",
      actorId: input.actorId,
      status: "connected",
      config: {
        ...(previous?.config ?? {}),
        host: payload.r365Ftp.host,
        port: payload.r365Ftp.port,
        username: payload.r365Ftp.username,
        secure: payload.r365Ftp.secure,
        remotePath: payload.r365Ftp.remotePath,
      },
      secretPayload: {
        password: payload.r365Ftp.password,
      },
      connectedAt: new Date().toISOString(),
      lastError: null,
    });
  }

  await logAuditEvent({
    action: "integration.qbo_r365.config.upsert",
    entityType: "integration",
    organizationId: input.organizationId,
    actorId: input.actorId,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
      metadata: {
      updated_qbo: false,
      updated_r365_ftp: Boolean(payload.r365Ftp),
      updated_settings: Boolean(payload.settings),
    },
  });

  return getQboR365Snapshot(input.organizationId);
}

export async function buildQboOAuthStartUrl(input: {
  organizationId: string;
  actorId: string;
}) {
  const globalQbo = getGlobalQboOAuthConfig();
  if (!globalQbo.ready) {
    throw new Error("QuickBooks no esta configurado globalmente. Contacta al super admin.");
  }

  const state = createOAuthStateToken(input.organizationId, input.actorId);
  return buildQboAuthorizeUrl({
    clientId: globalQbo.clientId,
    redirectUri: globalQbo.redirectUri,
    state,
  });
}

export async function completeQboOAuthCallback(input: {
  organizationId: string;
  actorId: string;
  code: string;
  realmId: string;
}) {
  const globalQbo = getGlobalQboOAuthConfig();
  if (!globalQbo.ready) {
    throw new Error("QuickBooks no esta configurado globalmente. Contacta al super admin.");
  }

  const connection = await getConnection(input.organizationId, "quickbooks_online");
  const config = (connection?.config ?? {}) as Record<string, unknown>;
  const currentSecrets = parseConnectionSecrets<QboStoredSecrets>(connection);

  const token = await exchangeQboOAuthCode({
    clientId: globalQbo.clientId,
    clientSecret: globalQbo.clientSecret,
    redirectUri: globalQbo.redirectUri,
    code: input.code,
  });

  const expiresAtEpochSec = Math.floor(Date.now() / 1000) + token.expires_in;
  const mergedSecrets: QboStoredSecrets = {
    ...currentSecrets,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type,
    expiresAtEpochSec,
  };

  await upsertConnection({
    organizationId: input.organizationId,
    provider: "quickbooks_online",
    actorId: input.actorId,
    status: "connected",
    config: {
      ...config,
      realmId: input.realmId,
    },
    secretPayload: mergedSecrets,
    connectedAt: new Date().toISOString(),
    lastError: null,
  });

  await logAuditEvent({
    action: "integration.qbo_r365.qbo.connected",
    entityType: "integration",
    organizationId: input.organizationId,
    actorId: input.actorId,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
    metadata: {
      realm_id: input.realmId,
    },
  });
}

async function ensureFreshQboToken(input: {
  organizationId: string;
  actorId?: string | null;
  qboConnection: ConnectionRow;
  forceRefresh?: boolean;
}) {
  const config = input.qboConnection.config ?? {};
  const globalQbo = getGlobalQboOAuthConfig();
  const clientId = globalQbo.clientId;
  const realmId = typeof config.realmId === "string" ? config.realmId : "";
  const secrets = parseConnectionSecrets<QboStoredSecrets>(input.qboConnection);

  if (!globalQbo.ready || !realmId || !secrets?.refreshToken) {
    throw new Error("QuickBooks no esta configurado completamente");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(secrets.expiresAtEpochSec ?? 0);
  if (!input.forceRefresh && secrets.accessToken && expiresAt > now + 120) {
    return {
      accessToken: secrets.accessToken,
      realmId,
      secrets,
    };
  }

  const refreshed = await refreshQboAccessToken({
    clientId,
    clientSecret: globalQbo.clientSecret,
    refreshToken: secrets.refreshToken,
  });

  const nextSecrets: QboStoredSecrets = {
    ...secrets,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    tokenType: refreshed.token_type,
    expiresAtEpochSec: Math.floor(Date.now() / 1000) + refreshed.expires_in,
  };

  await upsertConnection({
    organizationId: input.organizationId,
    provider: "quickbooks_online",
    actorId: input.actorId,
    status: "connected",
    config,
    secretPayload: nextSecrets,
    lastError: null,
  });

  return {
    accessToken: nextSecrets.accessToken ?? refreshed.access_token,
    realmId,
    secrets: nextSecrets,
  };
}

async function listDedupeKeys(organizationId: string, keys: string[]) {
  if (keys.length === 0) return new Set<string>();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_run_items")
    .select("dedupe_key")
    .eq("organization_id", organizationId)
    .in("dedupe_key", keys)
    .in("status", ["uploaded", "validated"]);

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((row) => row.dedupe_key).filter(Boolean));
}

async function listSentInvoiceIds(organizationId: string, sourceInvoiceIds: string[]) {
  if (sourceInvoiceIds.length === 0) return new Set<string>();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_run_items")
    .select("source_invoice_id")
    .eq("organization_id", organizationId)
    .in("source_invoice_id", sourceInvoiceIds)
    .in("status", ["uploaded", "validated"]);

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((row) => row.source_invoice_id).filter(Boolean));
}

function buildFileName(prefix: string, runId: string) {
  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").replace(".", "_").slice(0, 15);
  return `${prefix}_${stamp}_${runId.slice(0, 8)}.csv`;
}

export async function runQboR365Sync(input: {
  organizationId: string;
  actorId?: string | null;
  triggerSource?: "manual" | "scheduled" | "retry";
  dryRun?: boolean;
  ignoreLookback?: boolean;
  syncConfigId?: string | null;
}) {
  const dryRun = input.dryRun === true;
  const actorId = input.actorId ?? null;
  const triggerSource = input.triggerSource ?? "manual";

  // Cargar sync config si se especifica
  let syncConfig: SyncConfigRow | null = null;
  if (input.syncConfigId) {
    syncConfig = await getSyncConfigRow(input.organizationId, input.syncConfigId);
  }

  const settings = await getSettings(input.organizationId);
  const qboConnection = await getConnection(input.organizationId, "quickbooks_online");

  // FTP: viene de la sync config si existe, sino de la conexión global
  let ftpForUpload: {
    host: string; port: number; username: string; password: string;
    secure: boolean; remotePath: string;
  } | null = null;

  if (syncConfig?.r365_ftp_host) {
    const ftpSecrets = decryptJsonPayload<FtpStoredSecrets>({
      ciphertext: syncConfig.r365_ftp_secrets_ciphertext,
      iv: syncConfig.r365_ftp_secrets_iv,
      tag: syncConfig.r365_ftp_secrets_tag,
    });
    if (ftpSecrets?.password) {
      ftpForUpload = {
        host: syncConfig.r365_ftp_host,
        port: syncConfig.r365_ftp_port ?? 21,
        username: syncConfig.r365_ftp_username ?? "",
        password: ftpSecrets.password,
        secure: syncConfig.r365_ftp_secure,
        remotePath: syncConfig.r365_ftp_remote_path,
      };
    }
  } else {
    const ftpConnection = await getConnection(input.organizationId, "restaurant365_ftp");
    if (ftpConnection?.status === "connected") {
      const ftpSecrets = parseConnectionSecrets<FtpStoredSecrets>(ftpConnection);
      const ftpConfig = (ftpConnection.config ?? {}) as Record<string, unknown>;
      if (ftpSecrets?.password) {
        ftpForUpload = {
          host: String(ftpConfig.host ?? ""),
          port: Number(ftpConfig.port ?? 21),
          username: String(ftpConfig.username ?? ""),
          password: ftpSecrets.password,
          secure: Boolean(ftpConfig.secure ?? true),
          remotePath: String(ftpConfig.remotePath ?? settings.ftp_remote_path),
        };
      }
    }
  }

  if (!qboConnection || qboConnection.status !== "connected") {
    throw new Error("QuickBooks Online no esta conectado");
  }
  if (!dryRun && !ftpForUpload) {
    throw new Error("Restaurant365 FTP no esta conectado");
  }

  // Template y taxMode: sync config sobrescribe el global
  const effectiveTemplate = syncConfig?.template ?? settings.qbo_r365_template;
  const effectiveTaxMode = syncConfig?.tax_mode ?? settings.tax_mode;

  const runId = await createRun(input.organizationId, actorId, triggerSource, syncConfig?.id ?? null);
  const admin = createSupabaseAdminClient();

  try {
    let qboAuth = await ensureFreshQboToken({
      organizationId: input.organizationId,
      actorId,
      qboConnection,
    });

    const qboConfig = (qboConnection.config ?? {}) as Record<string, unknown>;
    const useSandbox = Boolean(qboConfig.useSandbox ?? false);
    const effectiveLookbackHours = syncConfig?.lookback_hours ?? settings.incremental_lookback_hours;
    const sinceIso = input.ignoreLookback === true || effectiveLookbackHours === 0
      ? undefined
      : toIsoLookback(effectiveLookbackHours);
    let qboData;
    try {
      qboData = await fetchQboSalesTransactions({
        accessToken: qboAuth.accessToken,
        realmId: qboAuth.realmId,
        customerId: syncConfig?.qbo_customer_id,
        sinceIso,
        useSandbox,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error consultando Invoice en QBO";
      const looksLikeAuthError = /QBO_3100|ApplicationAuthorizationFailed|401|forbidden|unauthorized/i.test(message);
      if (!looksLikeAuthError) {
        throw error;
      }

      qboAuth = await ensureFreshQboToken({
        organizationId: input.organizationId,
        actorId,
        qboConnection,
        forceRefresh: true,
      });

      qboData = await fetchQboSalesTransactions({
        accessToken: qboAuth.accessToken,
        realmId: qboAuth.realmId,
        customerId: syncConfig?.qbo_customer_id,
        sinceIso,
        useSandbox,
      });
    }

    // Si el URL de produccion devuelve 0 resultados (QBO cambio de devolver error 3100
    // a devolver 200+vacio para tokens sandbox), intentar con URL de sandbox automaticamente.
    if (!useSandbox && qboData.invoices.length === 0 && qboData.salesReceipts.length === 0 && qboData.creditMemos.length === 0) {
      try {
        const sandboxData = await fetchQboSalesTransactions({
          accessToken: qboAuth.accessToken,
          realmId: qboAuth.realmId,
          sinceIso,
          useSandbox: true,
        });
        if (sandboxData.invoices.length > 0 || sandboxData.salesReceipts.length > 0 || sandboxData.creditMemos.length > 0) {
          qboData = sandboxData;
          if (actorId) {
            void updateQboConnectionPublicConfig({
              organizationId: input.organizationId,
              actorId,
              useSandbox: true,
            }).catch(() => {});
          }
        }
      } catch {
        // Si falla la deteccion de sandbox, continuar con 0 resultados
      }
    }

    const mappings = await getActiveMappings(input.organizationId);

    const normalized = normalizeQboRows({
      invoices: qboData.invoices,
      salesReceipts: qboData.salesReceipts,
      creditMemos: qboData.creditMemos,
      template: effectiveTemplate,
      taxMode: effectiveTaxMode,
      mappings,
    });
    const detectedInvoiceCount = new Set(normalized.map((line) => line.sourceInvoiceId).filter(Boolean)).size;

    const dedupeKeys = normalized.map((line) => buildDedupeKey(line));
    const existingKeys = await listDedupeKeys(input.organizationId, dedupeKeys);
    const sourceInvoiceIds = Array.from(new Set(normalized.map((line) => line.sourceInvoiceId).filter(Boolean)));
    const alreadySentInvoiceIds = await listSentInvoiceIds(input.organizationId, sourceInvoiceIds);

    const uniqueLines: Array<{ line: NormalizedInvoiceLine; dedupeKey: string }> = [];
    const duplicateRows: Array<{ sourceInvoiceId: string; sourceLineId: string; dedupeKey: string }> = [];
    const alreadySentRows: Array<{ sourceInvoiceId: string; sourceLineId: string; dedupeKey: string }> = [];

    for (let i = 0; i < normalized.length; i += 1) {
      const line = normalized[i];
      const dedupeKey = dedupeKeys[i];
      if (alreadySentInvoiceIds.has(line.sourceInvoiceId)) {
        alreadySentRows.push({ sourceInvoiceId: line.sourceInvoiceId, sourceLineId: line.sourceLineId, dedupeKey });
      } else if (existingKeys.has(dedupeKey)) {
        duplicateRows.push({ sourceInvoiceId: line.sourceInvoiceId, sourceLineId: line.sourceLineId, dedupeKey });
      } else {
        uniqueLines.push({ line, dedupeKey });
      }
    }

    if (duplicateRows.length > 0 || alreadySentRows.length > 0) {
      const alreadySentKeySet = new Set(alreadySentRows.map((row) => row.dedupeKey));
      await admin.from("integration_run_items").insert(
        [...duplicateRows, ...alreadySentRows].map((row) => ({
          run_id: runId,
          organization_id: input.organizationId,
          source_invoice_id: row.sourceInvoiceId,
          source_invoice_line_id: row.sourceLineId,
          dedupe_key: row.dedupeKey,
          status: "skipped_duplicate",
          payload: alreadySentKeySet.has(row.dedupeKey)
            ? { reason: "invoice_already_sent_to_r365" }
            : { reason: "line_duplicate" },
        })),
      );
    }

    const csvBuild = buildR365Csv({
      template: effectiveTemplate,
      lines: uniqueLines.map((entry) => entry.line),
    });

    const fileName = buildFileName(settings.file_prefix, runId);

    const effectiveRemotePath = ftpForUpload?.remotePath ?? settings.ftp_remote_path;

    await admin.from("integration_outbox_files").insert({
      run_id: runId,
      organization_id: input.organizationId,
      storage_provider: "r365_ftp",
      remote_path: effectiveRemotePath,
      file_name: fileName,
      mime_type: "text/csv",
      size_bytes: Buffer.byteLength(csvBuild.csv, "utf8"),
      sha256: csvBuild.hash,
      status: "generated",
    });

    if (!dryRun && uniqueLines.length > 0) {
      if (!ftpForUpload) {
        throw new Error("Falta configuracion FTP de Restaurant365");
      }

      await uploadCsvToFtp({
        host: ftpForUpload.host,
        port: ftpForUpload.port,
        username: ftpForUpload.username,
        password: ftpForUpload.password,
        secure: ftpForUpload.secure,
        remotePath: ftpForUpload.remotePath,
        fileName,
        content: csvBuild.csv,
      });

      await admin
        .from("integration_outbox_files")
        .update({
          status: "uploaded",
          uploaded_at: new Date().toISOString(),
        })
        .eq("run_id", runId)
        .eq("organization_id", input.organizationId)
        .eq("file_name", fileName);
    }

    if (uniqueLines.length > 0) {
      await admin.from("integration_run_items").insert(
        uniqueLines.map((entry) => ({
          run_id: runId,
          organization_id: input.organizationId,
          source_invoice_id: entry.line.sourceInvoiceId,
          source_invoice_line_id: entry.line.sourceLineId,
          dedupe_key: entry.dedupeKey,
          status: dryRun ? "exported" : "uploaded",
          payload: {
            sourceInvoiceId: entry.line.sourceInvoiceId,
            sourceLineId: entry.line.sourceLineId,
            transactionTypeCode: entry.line.transactionTypeCode,
            vendor: entry.line.vendor,
            invoiceNumber: entry.line.invoiceNumber,
            invoiceDate: entry.line.invoiceDate,
            dueDate: entry.line.dueDate,
            currency: entry.line.currency,
            targetCode: entry.line.targetCode,
            description: entry.line.description,
            quantity: entry.line.quantity,
            unitPrice: entry.line.unitPrice,
            lineAmount: entry.line.lineAmount,
            taxAmount: entry.line.taxAmount,
            totalAmount: entry.line.totalAmount,
            qboBalance: entry.line.qboBalance,
            qboPaymentStatus: entry.line.qboPaymentStatus,
            qboStatusRaw: entry.line.qboStatusRaw,
            location: entry.line.location,
            memo: entry.line.memo,
            rawVendor: entry.line.vendor,
            rawInvoiceNumber: entry.line.invoiceNumber,
            rawDescription: entry.line.description,
            rawLineAmount: entry.line.lineAmount,
          },
        })),
      );
    }

    const totalSkipped = duplicateRows.length + alreadySentRows.length;
    const finalStatus = totalSkipped > 0 ? "completed_with_errors" : "completed";

    await admin
      .from("integration_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        qbo_window_from: sinceIso,
        qbo_window_to: new Date().toISOString(),
        template_used: effectiveTemplate,
        file_name: fileName,
        file_hash: csvBuild.hash,
        total_detected: detectedInvoiceCount,
        total_mapped: uniqueLines.length,
        total_uploaded: dryRun ? 0 : uniqueLines.length,
        total_skipped_duplicates: totalSkipped,
        total_failed: 0,
      })
      .eq("id", runId)
      .eq("organization_id", input.organizationId);

    const nowIso = new Date().toISOString();
    await admin
      .from("integration_settings")
      .update({ last_run_at: nowIso, ...(actorId ? { updated_by: actorId } : {}) })
      .eq("organization_id", input.organizationId);

    if (syncConfig?.id) {
      await admin
        .from("qbo_r365_sync_configs")
        .update({ last_run_at: nowIso })
        .eq("id", syncConfig.id);
    }

    await appendIntegrationAudit({
      organizationId: input.organizationId,
      runId,
      level: "info",
      code: "sync_completed",
      message: dryRun ? "Sync finalizada en modo dry-run" : "Sync finalizada con upload FTP",
      metadata: {
        dry_run: dryRun,
        detected: detectedInvoiceCount,
        uploaded: dryRun ? 0 : uniqueLines.length,
        skipped_duplicates: duplicateRows.length,
      },
    });

    await logAuditEvent({
      action: "integration.qbo_r365.sync.run",
      entityType: "integration_run",
      entityId: runId,
      organizationId: input.organizationId,
      actorId,
      eventDomain: "settings",
      outcome: "success",
      severity: "medium",
      metadata: {
        dry_run: dryRun,
        detected: detectedInvoiceCount,
        uploaded: dryRun ? 0 : uniqueLines.length,
      },
    });

    return {
      runId,
      status: finalStatus,
      detected: detectedInvoiceCount,
      uploaded: dryRun ? 0 : uniqueLines.length,
      skippedDuplicates: duplicateRows.length,
      fileName,
      dryRun,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de sincronizacion";
    await admin
      .from("integration_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        total_failed: 1,
        error_summary: { message },
      })
      .eq("id", runId)
      .eq("organization_id", input.organizationId);

    await appendIntegrationAudit({
      organizationId: input.organizationId,
      runId,
      level: "error",
      code: "sync_failed",
      message,
    });

    await logAuditEvent({
      action: "integration.qbo_r365.sync.run",
      entityType: "integration_run",
      entityId: runId,
      organizationId: input.organizationId,
      actorId,
      eventDomain: "settings",
      outcome: "error",
      severity: "high",
      metadata: { error: message },
    });

    throw error;
  }
}

export async function listQboR365Runs(organizationId: string, limit = 20) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_runs")
    .select("id, status, trigger_source, started_at, finished_at, total_detected, total_mapped, total_uploaded, total_skipped_duplicates, total_failed, file_name, template_used, error_summary, sync_config_id")
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listQboR365InvoiceHistory(organizationId: string, limit = 200, syncConfigId?: string | null) {
  const admin = createSupabaseAdminClient();

  let runIdsFilter: string[] | null = null;
  if (syncConfigId) {
    const { data: runRows, error: runError } = await admin
      .from("integration_runs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("sync_config_id", syncConfigId)
      .limit(500);
    if (runError) throw new Error(runError.message);
    runIdsFilter = (runRows ?? []).map((r) => String(r.id));
    if (runIdsFilter.length === 0) return [];
  }

  const baseFilter = admin
    .from("integration_run_items")
    .select("run_id, source_invoice_id, status, payload, created_at")
    .eq("organization_id", organizationId)
    .not("source_invoice_id", "is", null);

  const withRunFilter = runIdsFilter ? baseFilter.in("run_id", runIdsFilter) : baseFilter;

  const { data, error } = await withRunFilter
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 10, 1000));

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    run_id: string;
    source_invoice_id: string;
    status: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;

  const runIds = Array.from(new Set(rows.map((row) => row.run_id).filter(Boolean)));
  const runsById = new Map<string, { template_used: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null; started_at: string | null }>();

  if (runIds.length > 0) {
    const { data: runs, error: runsError } = await admin
      .from("integration_runs")
      .select("id, template_used, started_at")
      .eq("organization_id", organizationId)
      .in("id", runIds);

    if (runsError) {
      throw new Error(runsError.message);
    }

    for (const run of runs ?? []) {
      runsById.set(String(run.id), {
        template_used: (run.template_used as "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null) ?? null,
        started_at: (run.started_at as string | null) ?? null,
      });
    }
  }

  const byInvoice = new Map<string, {
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
    runIdsSeen: Set<string>;
  }>();

  for (const row of rows) {
    const sourceInvoiceId = String(row.source_invoice_id || "");
    if (!sourceInvoiceId) continue;

    const existing = byInvoice.get(sourceInvoiceId);
    if (!existing) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const runMeta = runsById.get(row.run_id);
      byInvoice.set(sourceInvoiceId, {
        sourceInvoiceId,
        invoiceNumber: typeof payload.invoiceNumber === "string" ? payload.invoiceNumber : null,
        invoiceDate: typeof payload.invoiceDate === "string" ? payload.invoiceDate : null,
        dueDate: typeof payload.dueDate === "string" ? payload.dueDate : null,
        totalAmount: typeof payload.totalAmount === "number" ? payload.totalAmount : null,
        currency: typeof payload.currency === "string" ? payload.currency : null,
        transactionTypeCode: payload.transactionTypeCode === "1" || payload.transactionTypeCode === "2"
          ? payload.transactionTypeCode
          : null,
        qboBalance: typeof payload.qboBalance === "number" ? payload.qboBalance : null,
        qboPaymentStatus:
          payload.qboPaymentStatus === "paid"
          || payload.qboPaymentStatus === "unpaid"
          || payload.qboPaymentStatus === "partial"
          || payload.qboPaymentStatus === "not_applicable"
          || payload.qboPaymentStatus === "unknown"
            ? payload.qboPaymentStatus
            : null,
        qboStatusRaw: typeof payload.qboStatusRaw === "string" ? payload.qboStatusRaw : null,
        vendor: typeof payload.vendor === "string" ? payload.vendor : null,
        mappedCode: typeof payload.targetCode === "string" ? payload.targetCode : null,
        lastStatus: row.status,
        lastSeenAt: row.created_at,
        lastRunId: row.run_id,
        templateMode: runMeta?.template_used ?? null,
        sentToR365: row.status === "uploaded" || row.status === "validated",
        timesSeen: 1,
        runIdsSeen: new Set([row.run_id]),
      });
      continue;
    }

    if (!existing.runIdsSeen.has(row.run_id)) {
      existing.runIdsSeen.add(row.run_id);
      existing.timesSeen += 1;
    }
    if (!existing.sentToR365 && (row.status === "uploaded" || row.status === "validated")) {
      existing.sentToR365 = true;
    }
    if (!existing.mappedCode) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.targetCode === "string") {
        existing.mappedCode = payload.targetCode;
      }
    }
    if (!existing.invoiceNumber) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.invoiceNumber === "string") {
        existing.invoiceNumber = payload.invoiceNumber;
      }
    }
    if (!existing.vendor) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.vendor === "string") {
        existing.vendor = payload.vendor;
      }
    }
    if (!existing.invoiceDate) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.invoiceDate === "string") {
        existing.invoiceDate = payload.invoiceDate;
      }
    }
    if (!existing.dueDate) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.dueDate === "string") {
        existing.dueDate = payload.dueDate;
      }
    }
    if (existing.totalAmount === null) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.totalAmount === "number") {
        existing.totalAmount = payload.totalAmount;
      }
    }
    if (!existing.currency) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.currency === "string") {
        existing.currency = payload.currency;
      }
    }
    if (!existing.transactionTypeCode) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (payload.transactionTypeCode === "1" || payload.transactionTypeCode === "2") {
        existing.transactionTypeCode = payload.transactionTypeCode;
      }
    }
    if (existing.qboBalance === null) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.qboBalance === "number") {
        existing.qboBalance = payload.qboBalance;
      }
    }
    if (!existing.qboPaymentStatus) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (
        payload.qboPaymentStatus === "paid"
        || payload.qboPaymentStatus === "unpaid"
        || payload.qboPaymentStatus === "partial"
        || payload.qboPaymentStatus === "not_applicable"
        || payload.qboPaymentStatus === "unknown"
      ) {
        existing.qboPaymentStatus = payload.qboPaymentStatus;
      }
    }
    if (!existing.qboStatusRaw) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (typeof payload.qboStatusRaw === "string" && payload.qboStatusRaw.trim()) {
        existing.qboStatusRaw = payload.qboStatusRaw;
      }
    }
  }

  return Array.from(byInvoice.values())
    .map((entry) => ({
      sourceInvoiceId: entry.sourceInvoiceId,
      invoiceNumber: entry.invoiceNumber,
      invoiceDate: entry.invoiceDate,
      dueDate: entry.dueDate,
      totalAmount: entry.totalAmount,
      currency: entry.currency,
      transactionTypeCode: entry.transactionTypeCode,
      qboBalance: entry.qboBalance,
      qboPaymentStatus: entry.qboPaymentStatus,
      qboStatusRaw: entry.qboStatusRaw,
      vendor: entry.vendor,
      mappedCode: entry.mappedCode,
      lastStatus: entry.lastStatus,
      lastSeenAt: entry.lastSeenAt,
      lastRunId: entry.lastRunId,
      templateMode: entry.templateMode,
      sentToR365: entry.sentToR365,
      timesSeen: entry.timesSeen,
    }))
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, limit);
}

export type InvoiceLineItem = {
  sourceLineId: string;
  targetCode: string | null;
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

export type InvoiceDetail = {
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
  memo: string | null;
  lines: InvoiceLineItem[];
  subtotal: number;
  totalTax: number;
  grandTotal: number;
};

export async function getInvoiceDetail(
  organizationId: string,
  sourceInvoiceId: string,
): Promise<InvoiceDetail | null> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("integration_run_items")
    .select("source_invoice_line_id, run_id, status, payload, created_at")
    .eq("organization_id", organizationId)
    .eq("source_invoice_id", sourceInvoiceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;

  const seenLineIds = new Set<string>();
  const lines: InvoiceLineItem[] = [];
  let invoiceNumber: string | null = null;
  let invoiceDate: string | null = null;
  let dueDate: string | null = null;
  let vendor: string | null = null;
  let currency: string | null = null;
  let transactionTypeCode: "1" | "2" | null = null;
  let qboBalance: number | null = null;
  let qboPaymentStatus: string | null = null;
  let qboStatusRaw: string | null = null;
  let headerMemo: string | null = null;

  for (const row of data) {
    const p = (row.payload ?? {}) as Record<string, unknown>;
    const lineId = String(row.source_invoice_line_id || p.sourceLineId || "");
    if (seenLineIds.has(lineId)) continue;
    seenLineIds.add(lineId);

    if (!invoiceNumber && typeof p.invoiceNumber === "string") invoiceNumber = p.invoiceNumber;
    if (!invoiceDate && typeof p.invoiceDate === "string") invoiceDate = p.invoiceDate;
    if (!dueDate && typeof p.dueDate === "string") dueDate = p.dueDate;
    if (!vendor && typeof p.vendor === "string") vendor = p.vendor;
    if (!currency && typeof p.currency === "string") currency = p.currency;
    if (!transactionTypeCode && (p.transactionTypeCode === "1" || p.transactionTypeCode === "2")) {
      transactionTypeCode = p.transactionTypeCode;
    }
    if (qboBalance === null && typeof p.qboBalance === "number") qboBalance = p.qboBalance;
    if (!qboPaymentStatus && typeof p.qboPaymentStatus === "string") qboPaymentStatus = p.qboPaymentStatus;
    if (!qboStatusRaw && typeof p.qboStatusRaw === "string") qboStatusRaw = p.qboStatusRaw;
    if (!headerMemo && typeof p.memo === "string" && p.memo) headerMemo = p.memo;

    lines.push({
      sourceLineId: lineId,
      targetCode: typeof p.targetCode === "string" ? p.targetCode : null,
      description: typeof p.description === "string" ? p.description : null,
      quantity: typeof p.quantity === "number" ? p.quantity : null,
      unitPrice: typeof p.unitPrice === "number" ? p.unitPrice : null,
      lineAmount: typeof p.lineAmount === "number" ? p.lineAmount : null,
      taxAmount: typeof p.taxAmount === "number" ? p.taxAmount : null,
      totalAmount: typeof p.totalAmount === "number" ? p.totalAmount : null,
      location: typeof p.location === "string" ? p.location : null,
      memo: typeof p.memo === "string" ? p.memo : null,
      status: String(row.status ?? ""),
      runId: String(row.run_id ?? ""),
    });
  }

  lines.sort((a, b) => {
    const na = Number(a.sourceLineId) || 0;
    const nb = Number(b.sourceLineId) || 0;
    return na - nb || a.sourceLineId.localeCompare(b.sourceLineId);
  });

  const subtotal = lines.reduce((s, l) => s + (l.lineAmount ?? 0), 0);
  const totalTax = lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0);
  const grandTotal = lines.reduce((s, l) => s + (l.totalAmount ?? 0), 0);

  return {
    sourceInvoiceId,
    invoiceNumber,
    invoiceDate,
    dueDate,
    vendor,
    currency,
    transactionTypeCode,
    qboBalance,
    qboPaymentStatus,
    qboStatusRaw,
    memo: headerMemo,
    lines,
    subtotal,
    totalTax,
    grandTotal,
  };
}

export async function prepareQboR365Batch(input: {
  organizationId: string;
  actorId?: string | null;
  triggerSource?: "manual" | "scheduled" | "retry";
}) {
  const result = await runQboR365Sync({
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    triggerSource: input.triggerSource ?? "manual",
    dryRun: true,
    ignoreLookback: true,
  });

  return {
    ...result,
    uploaded: 0,
    mode: "prepared",
  };
}

function payloadToLine(payload: Record<string, unknown>) {
  return {
    sourceInvoiceId: String(payload.sourceInvoiceId ?? ""),
    sourceLineId: String(payload.sourceLineId ?? ""),
    transactionTypeCode: String(payload.transactionTypeCode ?? "1") as "1" | "2",
    vendor: String(payload.vendor ?? ""),
    invoiceNumber: String(payload.invoiceNumber ?? ""),
    invoiceDate: String(payload.invoiceDate ?? ""),
    dueDate: String(payload.dueDate ?? payload.invoiceDate ?? ""),
    currency: String(payload.currency ?? ""),
    targetCode: String(payload.targetCode ?? ""),
    description: String(payload.description ?? ""),
    quantity: Number(payload.quantity ?? 1),
    unitPrice: Number(payload.unitPrice ?? 0),
    lineAmount: Number(payload.lineAmount ?? 0),
    taxAmount: Number(payload.taxAmount ?? 0),
    totalAmount: Number(payload.totalAmount ?? 0),
    location: String(payload.location ?? ""),
    memo: String(payload.memo ?? ""),
  } as NormalizedInvoiceLine;
}

export async function sendPreparedQboR365Run(input: {
  organizationId: string;
  actorId?: string | null;
  runId: string;
}) {
  const admin = createSupabaseAdminClient();

  const [{ data: run, error: runError }, ftpConnection] = await Promise.all([
    admin
      .from("integration_runs")
      .select("id, organization_id, status, template_used, file_name, sync_config_id")
      .eq("organization_id", input.organizationId)
      .eq("id", input.runId)
      .maybeSingle(),
    getConnection(input.organizationId, "restaurant365_ftp"),
  ]);

  if (runError) {
    throw new Error(runError.message);
  }
  if (!run) {
    throw new Error("No se encontro corrida preparada");
  }
  let syncConfig: SyncConfigRow | null = null;
  if (run.sync_config_id) {
    syncConfig = await getSyncConfigRow(input.organizationId, String(run.sync_config_id));
  }

  const { data: runItems, error: itemsError } = await admin
    .from("integration_run_items")
    .select("id, payload, status")
    .eq("organization_id", input.organizationId)
    .eq("run_id", input.runId)
    .in("status", ["exported", "uploaded"])
    .order("created_at", { ascending: true });

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const lines = (runItems ?? [])
    .map((item) => (item.payload as Record<string, unknown> | null) ?? {})
    .filter((payload) => payload.vendor && payload.invoiceNumber)
    .map((payload) => payloadToLine(payload));

  if (lines.length === 0) {
    throw new Error("La corrida preparada no tiene lineas para enviar");
  }

  const template = (run.template_used as "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null) ?? "by_item";
  const csvBuild = buildR365Csv({ template, lines });
  const fileName = typeof run.file_name === "string" && run.file_name
    ? run.file_name
    : buildFileName("r365_multi_invoice", run.id);

  let ftpForUpload: {
    host: string; port: number; username: string; password: string;
    secure: boolean; remotePath: string;
  } | null = null;

  if (syncConfig?.r365_ftp_host) {
    const syncFtpSecrets = decryptJsonPayload<FtpStoredSecrets>({
      ciphertext: syncConfig.r365_ftp_secrets_ciphertext,
      iv: syncConfig.r365_ftp_secrets_iv,
      tag: syncConfig.r365_ftp_secrets_tag,
    });
    if (syncFtpSecrets?.password) {
      ftpForUpload = {
        host: syncConfig.r365_ftp_host,
        port: syncConfig.r365_ftp_port ?? 21,
        username: syncConfig.r365_ftp_username ?? "",
        password: syncFtpSecrets.password,
        secure: syncConfig.r365_ftp_secure,
        remotePath: syncConfig.r365_ftp_remote_path,
      };
    }
  }

  if (!ftpForUpload && ftpConnection?.status === "connected") {
    const ftpConfig = (ftpConnection.config ?? {}) as Record<string, unknown>;
    const ftpSecrets = parseConnectionSecrets<FtpStoredSecrets>(ftpConnection);
    if (ftpSecrets?.password) {
      ftpForUpload = {
        host: String(ftpConfig.host ?? ""),
        port: Number(ftpConfig.port ?? 21),
        username: String(ftpConfig.username ?? ""),
        password: ftpSecrets.password,
        secure: Boolean(ftpConfig.secure ?? true),
        remotePath: String(ftpConfig.remotePath ?? "/APImports/R365"),
      };
    }
  }

  if (!ftpForUpload) {
    throw new Error("Restaurant365 FTP no esta conectado");
  }

  await uploadCsvToFtp({
    host: ftpForUpload.host,
    port: ftpForUpload.port,
    username: ftpForUpload.username,
    password: ftpForUpload.password,
    secure: ftpForUpload.secure,
    remotePath: ftpForUpload.remotePath,
    fileName,
    content: csvBuild.csv,
  });

  await admin
    .from("integration_outbox_files")
    .update({
      status: "uploaded",
      uploaded_at: new Date().toISOString(),
      sha256: csvBuild.hash,
      size_bytes: Buffer.byteLength(csvBuild.csv, "utf8"),
      file_name: fileName,
      remote_path: ftpForUpload.remotePath,
    })
    .eq("organization_id", input.organizationId)
    .eq("run_id", input.runId);

  await admin
    .from("integration_run_items")
    .update({ status: "uploaded" })
    .eq("organization_id", input.organizationId)
    .eq("run_id", input.runId)
    .eq("status", "exported");

  await admin
    .from("integration_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      file_hash: csvBuild.hash,
      file_name: fileName,
      total_uploaded: lines.length,
      total_failed: 0,
      error_summary: {},
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.runId);

  await appendIntegrationAudit({
    organizationId: input.organizationId,
    runId: input.runId,
    level: "info",
    code: "prepared_run_uploaded",
    message: "Corrida preparada enviada a FTP",
    metadata: {
      uploaded: lines.length,
      file_name: fileName,
    },
  });

  await logAuditEvent({
    action: "integration.qbo_r365.sync.send_prepared",
    entityType: "integration_run",
    entityId: input.runId,
    organizationId: input.organizationId,
    actorId: input.actorId ?? null,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
    metadata: {
      uploaded: lines.length,
      file_name: fileName,
    },
  });

  return {
    runId: input.runId,
    status: "completed",
    uploaded: lines.length,
    fileName,
  };
}

export async function getQboR365RunPreview(input: {
  organizationId: string;
  runId: string;
  limit?: number;
}) {
  const admin = createSupabaseAdminClient();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));

  const [{ data: run, error: runError }, { data, error }] = await Promise.all([
    admin
      .from("integration_runs")
      .select("template_used")
      .eq("organization_id", input.organizationId)
      .eq("id", input.runId)
      .maybeSingle(),
    admin
      .from("integration_run_items")
      .select("status, payload, source_invoice_id, source_invoice_line_id, dedupe_key")
      .eq("organization_id", input.organizationId)
      .eq("run_id", input.runId)
      .order("created_at", { ascending: true })
      .limit(limit),
  ]);

  if (runError) {
    throw new Error(runError.message);
  }

  if (error) {
    throw new Error(error.message);
  }

  const mappingMode = (run?.template_used as "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null) ?? null;

  const rows = (data ?? []).map((item) => {
    const payload = (item.payload as Record<string, unknown> | null) ?? {};
    return {
      status: item.status,
      mappingMode,
      sourceInvoiceId: item.source_invoice_id,
      sourceLineId: item.source_invoice_line_id,
      dedupeKey: item.dedupe_key,
      raw: {
        vendor: payload.rawVendor ?? payload.vendor ?? null,
        invoiceNumber: payload.rawInvoiceNumber ?? payload.invoiceNumber ?? null,
        description: payload.rawDescription ?? payload.description ?? null,
        amount: payload.rawLineAmount ?? payload.lineAmount ?? null,
      },
      mapped: {
        vendor: payload.vendor ?? null,
        invoiceNumber: payload.invoiceNumber ?? null,
        targetCode: payload.targetCode ?? payload.target_code ?? null,
        description: payload.description ?? null,
        quantity: payload.quantity ?? null,
        unitPrice: payload.unitPrice ?? null,
        lineAmount: payload.lineAmount ?? payload.line_amount ?? null,
        taxAmount: payload.taxAmount ?? null,
        totalAmount: payload.totalAmount ?? null,
      },
    };
  });

  return { mappingMode, rows };
}

export async function updateQboConnectionPublicConfig(input: {
  organizationId: string;
  actorId: string;
  useSandbox: boolean;
}) {
  const previous = await getConnection(input.organizationId, "quickbooks_online");
  if (!previous) return;
  await upsertConnection({
    organizationId: input.organizationId,
    provider: "quickbooks_online",
    actorId: input.actorId,
    config: {
      ...(previous.config ?? {}),
      useSandbox: input.useSandbox,
    },
  });
}

export async function getQboR365RunExport(input: {
  organizationId: string;
  runId: string;
}) {
  const admin = createSupabaseAdminClient();

  const [{ data: run, error: runError }, { data, error }] = await Promise.all([
    admin
      .from("integration_runs")
      .select("id, template_used, started_at")
      .eq("organization_id", input.organizationId)
      .eq("id", input.runId)
      .maybeSingle(),
    admin
      .from("integration_run_items")
      .select("status, payload, source_invoice_id, source_invoice_line_id, dedupe_key")
      .eq("organization_id", input.organizationId)
      .eq("run_id", input.runId)
      .order("created_at", { ascending: true }),
  ]);

  if (runError) {
    throw new Error(runError.message);
  }
  if (!run) {
    throw new Error("No se encontro la corrida solicitada");
  }
  if (error) {
    throw new Error(error.message);
  }

  const mappingMode = (run.template_used as "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null) ?? null;

  const rows = (data ?? []).map((item) => {
    const payload = (item.payload as Record<string, unknown> | null) ?? {};
    return {
      status: item.status,
      sourceInvoiceId: item.source_invoice_id,
      sourceLineId: item.source_invoice_line_id,
      dedupeKey: item.dedupe_key,
      mappingMode,
      raw: {
        vendor: payload.rawVendor ?? payload.vendor ?? null,
        invoiceNumber: payload.rawInvoiceNumber ?? payload.invoiceNumber ?? null,
        description: payload.rawDescription ?? payload.description ?? null,
        amount: payload.rawLineAmount ?? payload.lineAmount ?? null,
      },
      mapped: {
        vendor: payload.vendor ?? null,
        invoiceNumber: payload.invoiceNumber ?? null,
        targetCode: payload.targetCode ?? payload.target_code ?? null,
        description: payload.description ?? null,
        quantity: payload.quantity ?? null,
        unitPrice: payload.unitPrice ?? null,
        lineAmount: payload.lineAmount ?? payload.line_amount ?? null,
        taxAmount: payload.taxAmount ?? null,
        totalAmount: payload.totalAmount ?? null,
      },
      payload,
    };
  });

  return {
    runId: run.id,
    startedAt: run.started_at,
    mappingMode,
    rows,
  };
}

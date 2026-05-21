import { Client as FtpClient } from "basic-ftp";
import { Readable } from "stream";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { logAuditEvent } from "@/shared/lib/audit";
import { decryptJsonPayload, encryptJsonPayload } from "@/modules/integrations/qbo-r365/crypto";
import { createOAuthStateToken } from "@/modules/integrations/qbo-r365/oauth-state";
import {
  buildQboAuthorizeUrl,
  exchangeQboOAuthCode,
  fetchQboCustomerById,
  fetchQboCrudoTransaction,
  fetchQboCustomers,
  fetchQboItemSkus,
  fetchQboRawTransaction,
  fetchQboSalesTransactions,
  fetchQboTransactionByDocNumber,
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
  r365_vendor_name: string | null;
  r365_location: string | null;
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
    .select("id, name, qbo_customer_id, qbo_customer_name, schedule_interval, lookback_hours, template, tax_mode, status, last_run_at, r365_ftp_host, r365_vendor_name, r365_location, created_at")
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
    r365Location: (row.r365_location as string | null) ?? null,
    r365VendorName: (row.r365_vendor_name as string | null) ?? null,
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
      r365_vendor_name: payload.r365VendorName || null,
      r365_location: payload.r365Location || null,
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
  if (payload.r365VendorName !== undefined) patch.r365_vendor_name = payload.r365VendorName || null;
  if (payload.r365Location !== undefined) patch.r365_location = payload.r365Location || null;

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

  return fetchQboCustomers({
    accessToken: qboAuth.accessToken,
    realmId: qboAuth.realmId,
  });
}

export async function getQboCustomerById(organizationId: string, customerId: string): Promise<QboCustomer | null> {
  const qboConnection = await getConnection(organizationId, "quickbooks_online");
  if (!qboConnection || qboConnection.status !== "connected") {
    throw new Error("QuickBooks Online no esta conectado");
  }
  const qboAuth = await ensureFreshQboToken({ organizationId, actorId: null, qboConnection });
  return fetchQboCustomerById({
    accessToken: qboAuth.accessToken,
    realmId: qboAuth.realmId,
    customerId,
  });
}

export async function fetchRawQboInvoice(organizationId: string, invoiceId: string) {
  const qboConnection = await getConnection(organizationId, "quickbooks_online");
  if (!qboConnection || qboConnection.status !== "connected") {
    throw new Error("QuickBooks Online no esta conectado");
  }
  const qboAuth = await ensureFreshQboToken({ organizationId, actorId: null, qboConnection });
  return fetchQboRawTransaction({
    accessToken: qboAuth.accessToken,
    realmId: qboAuth.realmId,
    invoiceId,
  });
}

export async function fetchCrudoQboInvoice(organizationId: string, invoiceId: string, syncConfigId?: string | null) {
  const qboConnection = await getConnection(organizationId, "quickbooks_online");
  if (!qboConnection || qboConnection.status !== "connected") {
    throw new Error("QuickBooks Online no esta conectado");
  }
  const qboAuth = await ensureFreshQboToken({ organizationId, actorId: null, qboConnection });
  const transactionCrudo = await fetchQboCrudoTransaction({
    accessToken: qboAuth.accessToken,
    realmId: qboAuth.realmId,
    invoiceId,
  });

  let syncCustomer: {
    id: string;
    displayName: string;
    acctNum?: string;
    raw?: Record<string, unknown>;
  } | null = null;

  let invoiceCustomer: {
    id: string;
    displayName: string;
    acctNum?: string;
    raw?: Record<string, unknown>;
  } | null = null;

  if (syncConfigId) {
    const admin = createSupabaseAdminClient();
    const { data: syncConfig, error } = await admin
      .from("qbo_r365_sync_configs")
      .select("qbo_customer_id")
      .eq("organization_id", organizationId)
      .eq("id", syncConfigId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const qboCustomerId = typeof syncConfig?.qbo_customer_id === "string" ? syncConfig.qbo_customer_id : null;
    if (qboCustomerId) {
      syncCustomer = await fetchQboCustomerById({
        accessToken: qboAuth.accessToken,
        realmId: qboAuth.realmId,
        customerId: qboCustomerId,
      });
    }
  }

  const foundAttempt = transactionCrudo.attempts.find((attempt) => attempt.type === transactionCrudo.foundType);
  const foundResponse = (foundAttempt?.response ?? {}) as Record<string, unknown>;
  const foundQueryResponse = (foundResponse.QueryResponse ?? foundResponse.queryResponse ?? {}) as Record<string, unknown>;
  const foundTypeItems = transactionCrudo.foundType
    ? (foundQueryResponse[transactionCrudo.foundType] as unknown[] | undefined)
    : undefined;
  const invoiceData = (foundTypeItems && foundTypeItems.length > 0 ? foundTypeItems[0] : null) as Record<string, unknown> | null;
  const customerRef = (invoiceData?.CustomerRef ?? {}) as Record<string, unknown>;
  const invoiceCustomerId = typeof customerRef.value === "string" ? customerRef.value : null;

  if (invoiceCustomerId) {
    invoiceCustomer = await fetchQboCustomerById({
      accessToken: qboAuth.accessToken,
      realmId: qboAuth.realmId,
      customerId: invoiceCustomerId,
    });
  }

  return {
    ...transactionCrudo,
    syncConfigId: syncConfigId ?? null,
    syncCustomer,
    invoiceCustomer,
    customerAcctNumMatch:
      Boolean(syncCustomer?.acctNum)
      && Boolean(invoiceCustomer?.acctNum)
      && syncCustomer?.acctNum === invoiceCustomer?.acctNum,
  };
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
  itemSkuMap?: Map<string, string>;
  customerAcctNumMap?: Map<string, string>;
  syncConfigCustomerId?: string;
  r365VendorName?: string;
  r365Location?: string;
  taxItemNumber?: string;
  invoiceTotalsOut?: Map<string, number>;
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
    const vendor = input.r365VendorName?.trim() || row.data.CustomerRef?.name || row.data.CustomerRef?.value || "UNKNOWN_CUSTOMER";
    const invoiceNumber = row.data.DocNumber || `QBO-${invoiceId}`;
    const invoiceDate = row.data.TxnDate || new Date().toISOString().slice(0, 10);
    const totalAmount = Number(row.data.TotalAmt ?? 0);
    input.invoiceTotalsOut?.set(invoiceId, Number(row.data.TotalAmt ?? 0));
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
    const INCLUDE_DETAIL_TYPES = new Set(["SalesItemLineDetail", "AccountBasedExpenseLineDetail"]);
    const itemLines = baseLines.filter((l) => INCLUDE_DETAIL_TYPES.has(l.DetailType ?? ""));
    const baseAmountSum = itemLines.reduce((sum, line) => sum + Number(line.Amount ?? 0), 0);

    // R365 usa el signo de los montos para distinguir AP Invoice (positivo) de AP Credit Memo (negativo).
    // QBO entrega siempre valores positivos — aplicamos el signo aquí antes de escribir al CSV.
    const csvSign = row.kind === "credit" ? -1 : 1;

    for (let index = 0; index < itemLines.length; index += 1) {
      const line = itemLines[index];
      const lineAmount = Number(line.Amount ?? 0);
      const qty = Number(line.SalesItemLineDetail?.Qty ?? 1);
      const unitPrice = Number(line.SalesItemLineDetail?.UnitPrice ?? (qty > 0 ? lineAmount / qty : lineAmount));
      const sourceItemCode =
        line.SalesItemLineDetail?.ItemRef?.value || line.AccountBasedExpenseLineDetail?.AccountRef?.value || "";
      const accountOrItem =
        (input.template === "by_item" || input.template === "by_item_service_dates")
          ? (sourceItemCode && input.itemSkuMap?.get(sourceItemCode)) || line.SalesItemLineDetail?.ItemRef?.name || `UNMAPPED-${sourceItemCode || "ITEM"}`
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
        sourceItemCode,
        sku: (sourceItemCode && input.itemSkuMap?.get(sourceItemCode)) || "",
        itemName: line.SalesItemLineDetail?.ItemRef?.name || line.AccountBasedExpenseLineDetail?.AccountRef?.name || "",
        description: line.Description || "",
        quantity: Number.isFinite(qty) ? qty : 1,
        unitPrice: csvSign * (Number.isFinite(unitPrice) ? unitPrice : lineAmount),
        lineAmount: csvSign * lineAmount,
        taxAmount,
        totalAmount: csvSign * (Number.isFinite(lineTotalAmount)
          ? lineTotalAmount
          : (Number.isFinite(totalAmount) ? totalAmount : lineAmount)),
        qboBalance: Number.isFinite(balanceAmount) ? balanceAmount : undefined,
        qboPaymentStatus,
        qboStatusRaw,
        location: input.r365Location?.trim()
          || input.customerAcctNumMap?.get(String(row.data.CustomerRef?.value ?? ""))
          || (input.syncConfigCustomerId ? input.customerAcctNumMap?.get(input.syncConfigCustomerId) : undefined)
          || "",
        memo: row.data.PrivateNote || "",
        poNumber: row.data.PONumber || "",
        terms: row.data.SalesTermRef?.name || "",
      };

      lines.push(applyMappings(normalizedLine, input.mappings, {
        invoice: row.data as unknown as Record<string, unknown>,
        line: line as unknown as Record<string, unknown>,
      }));
    }

    const totalTax = Number(row.data.TxnTaxDetail?.TotalTax ?? 0);
    if (totalTax > 0) {
      lines.push(applyMappings({
        sourceInvoiceId: invoiceId,
        sourceLineId: "tax",
        transactionTypeCode: row.kind === "credit" ? "2" : "1",
        vendor,
        invoiceNumber,
        invoiceDate,
        dueDate: row.data.DueDate || invoiceDate,
        currency: row.data.CurrencyRef?.name || row.data.CurrencyRef?.value || "",
        targetCode: input.taxItemNumber || "999999",
        sourceItemCode: "",
        sku: "",
        itemName: "Tax",
        description: "Tax",
        quantity: 1,
        unitPrice: csvSign * totalTax,
        lineAmount: csvSign * totalTax,
        taxAmount: 0,
        totalAmount: csvSign * totalTax,
        qboBalance: undefined,
        qboPaymentStatus: "not_applicable" as const,
        qboStatusRaw: undefined,
        location: input.r365Location?.trim()
          || input.customerAcctNumMap?.get(String(row.data.CustomerRef?.value ?? ""))
          || (input.syncConfigCustomerId ? input.customerAcctNumMap?.get(input.syncConfigCustomerId) : undefined)
          || "",
        memo: "",
        poNumber: "",
        terms: "",
      }, input.mappings, { invoice: row.data as unknown as Record<string, unknown>, line: {} }));
    }
  }

  return lines;
}

function buildDedupeKey(line: NormalizedInvoiceLine) {
  return `${line.sourceInvoiceId}:${line.sourceLineId}:${line.transactionTypeCode}:${line.lineAmount}:${line.targetCode}`;
}

function validateCsvVsInvoiceTotal(lines: NormalizedInvoiceLine[], invoiceTotals: Map<string, number>) {
  for (const [invoiceId, qboTotal] of invoiceTotals) {
    const csvTotal = lines
      .filter((l) => l.sourceInvoiceId === invoiceId)
      .reduce((sum, l) => sum + l.lineAmount, 0);
    const diff = Math.abs(Math.round((csvTotal - qboTotal) * 100) / 100);
    if (diff > 0.01) {
      throw new Error(
        `Factura ${invoiceId}: total CSV ${csvTotal.toFixed(2)} no coincide con QBO TotalAmt ${qboTotal.toFixed(2)} (diferencia: ${diff.toFixed(2)})`
      );
    }
  }
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
  const found = new Set<string>();
  const batchSize = 50;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const { data, error } = await admin
      .from("integration_run_items")
      .select("dedupe_key")
      .eq("organization_id", organizationId)
      .in("dedupe_key", batch)
      .in("status", ["uploaded", "validated"]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.dedupe_key) found.add(row.dedupe_key);
    }
  }
  return found;
}

async function listSentInvoiceIds(organizationId: string, sourceInvoiceIds: string[]) {
  if (sourceInvoiceIds.length === 0) return new Set<string>();
  const admin = createSupabaseAdminClient();
  const found = new Set<string>();
  const batchSize = 50;
  for (let i = 0; i < sourceInvoiceIds.length; i += batchSize) {
    const batch = sourceInvoiceIds.slice(i, i + batchSize);
    const { data, error } = await admin
      .from("integration_run_items")
      .select("source_invoice_id")
      .eq("organization_id", organizationId)
      .in("source_invoice_id", batch)
      .in("status", ["uploaded", "validated"]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.source_invoice_id) found.add(row.source_invoice_id);
    }
  }
  return found;
}

function buildFileName(prefix: string, invoiceNumber?: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = now.toISOString().slice(11, 19).replaceAll(":", "");
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 30);
  if (invoiceNumber) {
    const safeInv = invoiceNumber.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 20);
    return `${safePrefix}_INV${safeInv}_${date}_${time}.csv`;
  }
  return `${safePrefix}_${date}_${time}.csv`;
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
      });
    }

    const mappings = await getActiveMappings(input.organizationId);

    const [itemSkuMap, customerAcctNumMap] = await Promise.all([
      fetchQboItemSkus({
        accessToken: qboAuth.accessToken,
        realmId: qboAuth.realmId,
      }).catch(() => new Map<string, string>()),
      fetchQboCustomers({
        accessToken: qboAuth.accessToken,
        realmId: qboAuth.realmId,
      }).then((customers) => {
        const map = new Map<string, string>();
        for (const c of customers) {
          if (c.acctNum) map.set(c.id, c.acctNum);
        }
        return map;
      }).catch(() => new Map<string, string>()),
    ]);

    // Si el sync config no tiene r365_location, intentar resolverlo del mapa y guardarlo
    let effectiveR365Location = syncConfig?.r365_location || undefined;
    if (!effectiveR365Location && syncConfig?.qbo_customer_id) {
      const resolved = customerAcctNumMap.get(syncConfig.qbo_customer_id);
      if (resolved) {
        effectiveR365Location = resolved;
        void createSupabaseAdminClient()
          .from("qbo_r365_sync_configs")
          .update({ r365_location: resolved })
          .eq("id", syncConfig.id);
      }
    }

    const invoiceTotalsMap = new Map<string, number>();
    const normalized = normalizeQboRows({
      invoices: qboData.invoices,
      salesReceipts: qboData.salesReceipts,
      creditMemos: qboData.creditMemos,
      template: effectiveTemplate,
      taxMode: effectiveTaxMode,
      mappings,
      itemSkuMap,
      customerAcctNumMap,
      syncConfigCustomerId: syncConfig?.qbo_customer_id || undefined,
      r365VendorName: syncConfig?.r365_vendor_name || undefined,
      r365Location: effectiveR365Location,
      invoiceTotalsOut: invoiceTotalsMap,
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

    const invoiceIdsWithSkippedLines = new Set([
      ...duplicateRows.map((r) => r.sourceInvoiceId),
      ...alreadySentRows.map((r) => r.sourceInvoiceId),
    ]);
    const totalsToValidate = new Map([...invoiceTotalsMap].filter(([id]) => !invoiceIdsWithSkippedLines.has(id)));
    validateCsvVsInvoiceTotal(uniqueLines.map((entry) => entry.line), totalsToValidate);

    const effectiveRemotePath = ftpForUpload?.remotePath ?? settings.ftp_remote_path;

    if (!dryRun && uniqueLines.length > 0 && !ftpForUpload) {
      throw new Error("Falta configuracion FTP de Restaurant365");
    }

    // Group unique lines by invoice — one CSV per invoice
    const linesByInvoice = new Map<string, Array<{ line: NormalizedInvoiceLine; dedupeKey: string }>>();
    for (const entry of uniqueLines) {
      const inv = entry.line.sourceInvoiceId;
      if (!linesByInvoice.has(inv)) linesByInvoice.set(inv, []);
      linesByInvoice.get(inv)!.push(entry);
    }

    const uploadedFileNames: string[] = [];

    for (const invoiceEntries of linesByInvoice.values()) {
      const invoiceLines = invoiceEntries.map((e) => e.line).sort((a, b) => {
        const aId = a.sourceLineId === "tax" ? Number.POSITIVE_INFINITY : (Number(a.sourceLineId) || 0);
        const bId = b.sourceLineId === "tax" ? Number.POSITIVE_INFINITY : (Number(b.sourceLineId) || 0);
        return aId - bId;
      });
      const csvBuild = buildR365Csv({ template: effectiveTemplate, lines: invoiceLines });
      const invoiceNumber = invoiceLines[0]?.invoiceNumber;
      const vendorSlug = (invoiceLines[0]?.vendor ?? settings.file_prefix)
        .replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 20);
      const fileName = buildFileName(vendorSlug, invoiceNumber);

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

      if (!dryRun && ftpForUpload) {
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
          .update({ status: "uploaded", uploaded_at: new Date().toISOString() })
          .eq("run_id", runId)
          .eq("organization_id", input.organizationId)
          .eq("file_name", fileName);
      }

      uploadedFileNames.push(fileName);
    }

    const representativeFileName = uploadedFileNames[0] ?? buildFileName(settings.file_prefix);

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
            sourceItemCode: entry.line.sourceItemCode || "",
            sku: entry.line.sku || "",
            itemName: entry.line.itemName || "",
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
            poNumber: entry.line.poNumber || "",
            terms: entry.line.terms || "",
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
        file_name: representativeFileName,
        file_hash: null,
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
      fileName: representativeFileName,
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
  const qboCustomerByRunId = new Map<string, string>();

  if (runIds.length > 0) {
    const { data: runs, error: runsError } = await admin
      .from("integration_runs")
      .select("id, template_used, started_at, sync_config_id")
      .eq("organization_id", organizationId)
      .in("id", runIds);

    if (runsError) throw new Error(runsError.message);

    const syncConfigIds = Array.from(new Set(
      (runs ?? []).map((r) => r.sync_config_id).filter((id): id is string => typeof id === "string")
    ));

    const syncConfigNameById = new Map<string, string>();
    if (syncConfigIds.length > 0) {
      const { data: configs } = await admin
        .from("qbo_r365_sync_configs")
        .select("id, name")
        .eq("organization_id", organizationId)
        .in("id", syncConfigIds);
      for (const cfg of configs ?? []) {
        if (cfg.id && cfg.name) syncConfigNameById.set(String(cfg.id), String(cfg.name));
      }
    }

    for (const run of runs ?? []) {
      runsById.set(String(run.id), {
        template_used: (run.template_used as "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null) ?? null,
        started_at: (run.started_at as string | null) ?? null,
      });
      if (typeof run.sync_config_id === "string") {
        const customerName = syncConfigNameById.get(run.sync_config_id);
        if (customerName) qboCustomerByRunId.set(String(run.id), customerName);
      }
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
    qboCustomerName: string | null;
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
        qboCustomerName: qboCustomerByRunId.get(row.run_id) ?? null,
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
      qboCustomerName: entry.qboCustomerName,
      mappedCode: entry.mappedCode,
      lastStatus: entry.lastStatus,
      lastSeenAt: entry.lastSeenAt,
      lastRunId: entry.lastRunId,
      templateMode: entry.templateMode,
      sentToR365: entry.sentToR365,
      timesSeen: entry.timesSeen,
    }))
    .sort((a, b) => {
      const da = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
      const db = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
      return db - da;
    })
    .slice(0, limit);
}

export type InvoiceLineItem = {
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
  poNumber: string | null;
  terms: string | null;
  memo: string | null;
  lines: InvoiceLineItem[];
  subtotal: number;
  totalTax: number;
  grandTotal: number;
};

async function getInvoiceDetailFromRawEntity(
  organizationId: string,
  entityId: string,
): Promise<InvoiceDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("qbo_unified_invoices")
    .select("raw_entity, entity_type")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error || !data?.raw_entity) return null;

  const entity = data.raw_entity as Record<string, unknown>;
  const entityType = data.entity_type as "Invoice" | "CreditMemo";

  const customerRef = (entity.CustomerRef ?? {}) as Record<string, unknown>;
  const currencyRef = (entity.CurrencyRef ?? {}) as Record<string, unknown>;
  const txnTaxDetail = (entity.TxnTaxDetail ?? {}) as Record<string, unknown>;
  const grandTotal = typeof entity.TotalAmt === "number" ? entity.TotalAmt : 0;
  const totalTax = typeof txnTaxDetail.TotalTax === "number" ? txnTaxDetail.TotalTax : 0;

  const rawLines = Array.isArray(entity.Line) ? (entity.Line as Record<string, unknown>[]) : [];
  const lines: InvoiceLineItem[] = rawLines
    .filter((line) => line.DetailType === "SalesItemLineDetail")
    .map((line) => {
      const detail = (line.SalesItemLineDetail ?? {}) as Record<string, unknown>;
      const itemRef = (detail.ItemRef ?? {}) as Record<string, unknown>;
      return {
        sourceLineId: typeof line.Id === "string" ? line.Id : String(Math.random()),
        targetCode: null,
        sourceItemCode: typeof itemRef.value === "string" ? itemRef.value : null,
        sku: null,
        itemName: typeof itemRef.name === "string" ? itemRef.name : null,
        description: typeof line.Description === "string" ? line.Description : null,
        quantity: typeof detail.Qty === "number" ? detail.Qty : null,
        unitPrice: typeof detail.UnitPrice === "number" ? detail.UnitPrice : null,
        lineAmount: typeof line.Amount === "number" ? line.Amount : null,
        taxAmount: null,
        totalAmount: typeof line.Amount === "number" ? line.Amount : null,
        location: null,
        memo: null,
        status: "from_raw",
        runId: "",
      };
    });

  const subtotal = lines.reduce((s, l) => s + (l.lineAmount ?? 0), 0);

  return {
    sourceInvoiceId: entityId,
    invoiceNumber: typeof entity.DocNumber === "string" ? entity.DocNumber : null,
    invoiceDate: typeof entity.TxnDate === "string" ? entity.TxnDate : null,
    dueDate: entityType === "CreditMemo" ? null : (typeof entity.DueDate === "string" ? entity.DueDate : null),
    vendor: typeof customerRef.name === "string" ? customerRef.name : null,
    currency: typeof currencyRef.value === "string" ? currencyRef.value : null,
    transactionTypeCode: entityType === "CreditMemo" ? "2" : "1",
    qboBalance: typeof entity.Balance === "number" ? entity.Balance : null,
    qboPaymentStatus: null,
    qboStatusRaw: null,
    poNumber: null,
    terms: null,
    memo: typeof entity.PrivateNote === "string" ? entity.PrivateNote : null,
    lines,
    subtotal,
    totalTax,
    grandTotal,
  };
}

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
  if (!data || data.length === 0) {
    return getInvoiceDetailFromRawEntity(organizationId, sourceInvoiceId);
  }

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
  let poNumber: string | null = null;
  let terms: string | null = null;

  // Primero recolectar datos de cabecera de cualquier fila con payload completo
  for (const row of data) {
    const p = (row.payload ?? {}) as Record<string, unknown>;
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
    if (!poNumber && typeof p.poNumber === "string" && p.poNumber) poNumber = p.poNumber;
    if (!terms && typeof p.terms === "string" && p.terms) terms = p.terms;
  }

  // Agrupar filas por lineId y elegir la mejor (la que tenga payload completo con targetCode)
  const rowsByLineId = new Map<string, typeof data[number]>();
  for (const row of data) {
    const p = (row.payload ?? {}) as Record<string, unknown>;
    const lineId = String(row.source_invoice_line_id || p.sourceLineId || "");
    if (!lineId) continue;
    const existing = rowsByLineId.get(lineId);
    if (!existing) {
      rowsByLineId.set(lineId, row);
    } else {
      // Preferir fila con payload completo (tiene targetCode real) sobre filas de skip
      const existingP = (existing.payload ?? {}) as Record<string, unknown>;
      const hasFullPayload = typeof p.targetCode === "string" && p.targetCode && p.targetCode !== "line_duplicate" && p.targetCode !== "invoice_already_sent_to_r365";
      const existingHasFull = typeof existingP.targetCode === "string" && existingP.targetCode && existingP.targetCode !== "line_duplicate" && existingP.targetCode !== "invoice_already_sent_to_r365";
      if (hasFullPayload && !existingHasFull) {
        rowsByLineId.set(lineId, row);
      }
    }
  }

  for (const [lineId, row] of rowsByLineId.entries()) {
    const p = (row.payload ?? {}) as Record<string, unknown>;

    // Skip lines that were stored before the SubTotalLine filter was added:
    // a SubTotal line has no description, code UNMAPPED_ITEM, qty 1, and its amount
    // equals the sum of all other lines — we detect it by description+code combination.
    const isLegacySubtotalLine =
      (p.targetCode === "UNMAPPED_ITEM" || p.targetCode === "UNMAPPED_ACCOUNT") &&
      (typeof p.description !== "string" || (p.description as string).trim() === "");
    if (isLegacySubtotalLine) continue;

    lines.push({
      sourceLineId: lineId,
      targetCode: typeof p.targetCode === "string" ? p.targetCode : null,
      sourceItemCode: typeof p.sourceItemCode === "string" && p.sourceItemCode ? p.sourceItemCode : null,
      sku: typeof p.sku === "string" && p.sku ? p.sku : null,
      itemName: typeof p.itemName === "string" && p.itemName ? p.itemName : null,
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
    const na = a.sourceLineId === "tax" ? Number.POSITIVE_INFINITY : (Number(a.sourceLineId) || 0);
    const nb = b.sourceLineId === "tax" ? Number.POSITIVE_INFINITY : (Number(b.sourceLineId) || 0);
    if (na !== nb) return na - nb;
    return a.sourceLineId.localeCompare(b.sourceLineId);
  });

  const taxLine = lines.find((l) => l.sourceLineId === "tax");
  const itemLines = lines.filter((l) => l.sourceLineId !== "tax");
  const subtotal = itemLines.reduce((s, l) => s + (l.lineAmount ?? 0), 0);
  const totalTax = taxLine?.lineAmount ?? 0;
  const grandTotal = parseFloat((subtotal + totalTax).toFixed(2));

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
    poNumber,
    terms,
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
    itemName: payload.itemName ? String(payload.itemName) : undefined,
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
    : buildFileName("r365_multi_invoice");

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
        itemName: payload.itemName ?? null,
        description: payload.description ?? null,
        quantity: payload.quantity ?? null,
        unitPrice: payload.unitPrice ?? null,
        lineAmount: payload.lineAmount ?? payload.line_amount ?? null,
        taxAmount: payload.taxAmount ?? null,
        totalAmount: payload.totalAmount ?? null,
      },
    };
  });

  rows.sort((a, b) => {
    if (a.sourceInvoiceId !== b.sourceInvoiceId) {
      return String(a.sourceInvoiceId ?? "").localeCompare(String(b.sourceInvoiceId ?? ""));
    }
    const na = a.sourceLineId === "tax" ? Number.POSITIVE_INFINITY : (Number(a.sourceLineId) || 0);
    const nb = b.sourceLineId === "tax" ? Number.POSITIVE_INFINITY : (Number(b.sourceLineId) || 0);
    return na - nb;
  });

  return { mappingMode, rows };
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

/**
 * Genera la previsualización del CSV R365 a partir del raw_entity almacenado
 * en qbo_unified_invoices — sin tocar integration_run_items.
 *
 * Usada para facturas y credit memos del pipeline unificado (webhook, manual, sync)
 * donde el CSV aún no fue enviado o no existe en el historial legacy.
 */
export async function previewUnifiedInvoiceCsv(input: {
  organizationId: string;
  unifiedInvoiceId: string;
}): Promise<{ headers: string[]; rows: string[][]; csv: string; rowCount: number; templateUsed: string }> {
  const admin = createSupabaseAdminClient();

  const { data: row, error } = await admin
    .from("qbo_unified_invoices")
    .select("id, entity_id, entity_type, raw_entity, sync_config_id")
    .eq("organization_id", input.organizationId)
    .eq("id", input.unifiedInvoiceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Factura no encontrada en el historial");
  if (!row.raw_entity) throw new Error("La factura no tiene datos QBO almacenados — no se puede previsualizar");

  const syncConfigId = row.sync_config_id ? String(row.sync_config_id) : null;
  if (!syncConfigId) throw new Error("Esta factura no tiene sincronización asociada");

  const syncConfig = await getSyncConfigRow(input.organizationId, syncConfigId);
  const mappings = await getActiveMappings(input.organizationId);

  const entityType = row.entity_type as "Invoice" | "CreditMemo";
  const rawEntity = row.raw_entity as QboInvoiceLike;

  const lines = normalizeQboRows({
    invoices: entityType === "Invoice" ? [rawEntity] : [],
    salesReceipts: [],
    creditMemos: entityType === "CreditMemo" ? [rawEntity] : [],
    template: syncConfig.template,
    taxMode: syncConfig.tax_mode,
    mappings,
    r365VendorName: syncConfig.r365_vendor_name || undefined,
    r365Location: syncConfig.r365_location || undefined,
    syncConfigCustomerId: syncConfig.qbo_customer_id,
  });

  if (lines.length === 0) throw new Error("La factura no tiene líneas válidas para previsualizar — revisá los mappings del sync config");

  const { csv, rowCount } = buildR365Csv({ template: syncConfig.template, lines });

  const csvLines = csv.split("\n").filter(Boolean);
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        i++;
        let field = "";
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { field += line[i]; i++; }
        }
        result.push(field);
        if (line[i] === ",") i++;
      } else {
        const end = line.indexOf(",", i);
        if (end === -1) { result.push(line.slice(i)); break; }
        result.push(line.slice(i, end));
        i = end + 1;
      }
    }
    return result;
  };

  const [headerLine, ...dataLines] = csvLines;
  return {
    headers: parseRow(headerLine ?? ""),
    rows: dataLines.map(parseRow),
    csv,
    rowCount,
    templateUsed: syncConfig.template,
  };
}

export async function previewSingleInvoiceCsv(input: {
  organizationId: string;
  sourceInvoiceId: string;
  syncConfigId?: string | null;
  templateOverride?: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null;
}): Promise<{ headers: string[]; rows: string[][]; csv: string; rowCount: number; templateUsed: string }> {
  const admin = createSupabaseAdminClient();

  const { data: rawItems, error: itemsError } = await admin
    .from("integration_run_items")
    .select("run_id, source_invoice_line_id, status, payload, created_at")
    .eq("organization_id", input.organizationId)
    .eq("source_invoice_id", input.sourceInvoiceId)
    .neq("status", "skipped_duplicate")
    .order("created_at", { ascending: false });

  if (itemsError) throw new Error(itemsError.message);

  const lineMap = new Map<string, { runId: string; payload: Record<string, unknown> }>();
  for (const row of rawItems ?? []) {
    const lineId = String(row.source_invoice_line_id ?? "");
    if (!lineMap.has(lineId)) {
      lineMap.set(lineId, {
        runId: String(row.run_id),
        payload: (row.payload ?? {}) as Record<string, unknown>,
      });
    }
  }

  if (lineMap.size === 0) throw new Error("No se encontraron líneas para esta factura en el historial");

  const [firstEntry] = lineMap.values();
  const { data: runMeta } = await admin
    .from("integration_runs")
    .select("template_used")
    .eq("organization_id", input.organizationId)
    .eq("id", firstEntry.runId)
    .maybeSingle();

  const template = (input.templateOverride ?? runMeta?.template_used ?? "by_item") as "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates";

  const lines = [...lineMap.values()]
    .map(({ payload }) => payloadToLine(payload))
    .filter((line) => Boolean(line.vendor && line.invoiceNumber))
    .sort((a, b) => {
      const na = a.sourceLineId === "tax" ? Number.POSITIVE_INFINITY : (Number(a.sourceLineId) || 0);
      const nb = b.sourceLineId === "tax" ? Number.POSITIVE_INFINITY : (Number(b.sourceLineId) || 0);
      return na - nb;
    });

  if (lines.length === 0) throw new Error("Las líneas de la factura no tienen datos suficientes para previsualizar");

  const { csv, rowCount } = buildR365Csv({ template, lines });

  const csvLines = csv.split("\n").filter(Boolean);
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        i++;
        let field = "";
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { field += line[i]; i++; }
        }
        result.push(field);
        if (line[i] === ",") i++;
      } else {
        const end = line.indexOf(",", i);
        if (end === -1) { result.push(line.slice(i)); break; }
        result.push(line.slice(i, end));
        i = end + 1;
      }
    }
    return result;
  };

  const [headerLine, ...dataLines] = csvLines;
  return {
    headers: parseRow(headerLine ?? ""),
    rows: dataLines.map(parseRow),
    csv,
    rowCount,
    templateUsed: template,
  };
}

/**
 * Envía individualmente a R365 FTP una factura del historial LEGACY (integration_run_items).
 *
 * Solo funciona para facturas que pasaron por el pipeline de sync completo y tienen
 * líneas ya mapeadas en integration_run_items. Para facturas de webhook, backfill
 * o traídas manualmente por DocNumber, usar sendSingleUnifiedInvoice en su lugar.
 *
 * Resolución de FTP: ftpOverride → sync config → conexión global restaurant365_ftp.
 * Resolución de template: templateOverride → template del run original → "by_item".
 *
 * Deduplica las líneas por source_invoice_line_id, conservando la más reciente.
 */
export async function sendSingleInvoiceFromHistory(input: {
  organizationId: string;
  actorId: string | null;
  /** QBO entity ID tal como aparece en integration_run_items.source_invoice_id */
  sourceInvoiceId: string;
  syncConfigId?: string | null;
  ftpOverride?: { host: string; port: number; username: string; password: string; remotePath: string; secure: boolean } | null;
  templateOverride?: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null;
}): Promise<{ uploaded: number; fileName: string; runId: string }> {
  const admin = createSupabaseAdminClient();

  // Fetch all non-skipped items for this invoice, most recent first
  const { data: rawItems, error: itemsError } = await admin
    .from("integration_run_items")
    .select("run_id, source_invoice_line_id, status, payload, created_at")
    .eq("organization_id", input.organizationId)
    .eq("source_invoice_id", input.sourceInvoiceId)
    .neq("status", "skipped_duplicate")
    .order("created_at", { ascending: false });

  if (itemsError) throw new Error(itemsError.message);

  // Dedupe by line ID — keep the most recent item per line
  const lineMap = new Map<string, { runId: string; payload: Record<string, unknown> }>();
  for (const row of rawItems ?? []) {
    const lineId = String(row.source_invoice_line_id ?? "");
    if (!lineMap.has(lineId)) {
      lineMap.set(lineId, {
        runId: String(row.run_id),
        payload: (row.payload ?? {}) as Record<string, unknown>,
      });
    }
  }

  if (lineMap.size === 0) throw new Error("No se encontraron líneas para esta factura en el historial");

  // Resolve template and sync config from the originating run
  const [firstEntry] = lineMap.values();
  const { data: runMeta } = await admin
    .from("integration_runs")
    .select("template_used, sync_config_id")
    .eq("organization_id", input.organizationId)
    .eq("id", firstEntry.runId)
    .maybeSingle();

  const template = (input.templateOverride ?? runMeta?.template_used ?? "by_item") as "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates";
  const effectiveSyncConfigId = input.syncConfigId ?? (runMeta?.sync_config_id ? String(runMeta.sync_config_id) : null);

  // Resolve FTP — ftpOverride first, then sync config, then global connection
  let syncConfig: SyncConfigRow | null = null;
  if (effectiveSyncConfigId) {
    syncConfig = await getSyncConfigRow(input.organizationId, effectiveSyncConfigId).catch(() => null);
  }

  let ftpForUpload: { host: string; port: number; username: string; password: string; secure: boolean; remotePath: string } | null = null;

  if (input.ftpOverride?.host) {
    ftpForUpload = {
      host: input.ftpOverride.host,
      port: input.ftpOverride.port,
      username: input.ftpOverride.username,
      password: input.ftpOverride.password,
      secure: input.ftpOverride.secure,
      remotePath: input.ftpOverride.remotePath,
    };
  } else if (syncConfig?.r365_ftp_host) {
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

  if (!ftpForUpload) {
    const ftpConnection = await getConnection(input.organizationId, "restaurant365_ftp");
    if (ftpConnection?.status === "connected") {
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
  }

  if (!ftpForUpload) throw new Error("Restaurant365 FTP no está conectado");

  // Build NormalizedInvoiceLine[] from stored payloads
  const lines = [...lineMap.values()]
    .map(({ payload }) => payloadToLine(payload))
    .filter((line) => Boolean(line.vendor && line.invoiceNumber));

  if (lines.length === 0) throw new Error("Las líneas de la factura no tienen datos suficientes para enviar");

  const csvBuild = buildR365Csv({ template, lines });
  const runId = await createRun(input.organizationId, input.actorId, "manual", effectiveSyncConfigId);
  const invoiceNumber = lines[0]?.invoiceNumber;
  const vendorPrefix = lines[0]?.vendor?.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 20) ?? "r365_single_inv";
  const fileName = buildFileName(vendorPrefix, invoiceNumber);

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

  await admin.from("integration_outbox_files").insert({
    run_id: runId,
    organization_id: input.organizationId,
    storage_provider: "r365_ftp",
    remote_path: ftpForUpload.remotePath,
    file_name: fileName,
    mime_type: "text/csv",
    size_bytes: Buffer.byteLength(csvBuild.csv, "utf8"),
    sha256: csvBuild.hash,
    status: "uploaded",
    uploaded_at: new Date().toISOString(),
  });

  await admin.from("integration_run_items").insert(
    lines.map((line) => ({
      run_id: runId,
      organization_id: input.organizationId,
      source_invoice_id: line.sourceInvoiceId,
      source_invoice_line_id: line.sourceLineId,
      dedupe_key: buildDedupeKey(line),
      status: "uploaded",
      payload: {
        ...line,
        rawVendor: line.vendor,
        rawInvoiceNumber: line.invoiceNumber,
        rawDescription: line.description,
        rawLineAmount: line.lineAmount,
      },
    })),
  );

  const nowIso = new Date().toISOString();
  await admin
    .from("integration_runs")
    .update({
      status: "completed",
      finished_at: nowIso,
      template_used: template,
      file_name: fileName,
      file_hash: csvBuild.hash,
      total_detected: 1,
      total_mapped: lines.length,
      total_uploaded: lines.length,
      total_failed: 0,
      total_skipped_duplicates: 0,
    })
    .eq("id", runId)
    .eq("organization_id", input.organizationId);

  await appendIntegrationAudit({
    organizationId: input.organizationId,
    runId,
    level: "info",
    code: "single_invoice_sent",
    message: `Factura ${input.sourceInvoiceId} enviada individualmente a R365`,
    metadata: { source_invoice_id: input.sourceInvoiceId, uploaded: lines.length, file_name: fileName },
  });

  await logAuditEvent({
    action: "integration.qbo_r365.invoice.send_single",
    entityType: "integration_run",
    entityId: runId,
    organizationId: input.organizationId,
    actorId: input.actorId,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
    metadata: { source_invoice_id: input.sourceInvoiceId, uploaded: lines.length },
  });

  return { uploaded: lines.length, fileName, runId };
}

type QboWebhookEventInsert = {
  signatureValid: boolean;
  intuitEventId: string | null;
  realmId: string;
  entity: string;
  entityId: string;
  operation: string;
  lastUpdatedAt: string | null;
  rawPayload: Record<string, unknown>;
  rawNotification?: Record<string, unknown>;
  rawHeaders?: Record<string, unknown>;
};

export type QboWebhookEventRow = {
  id: string;
  received_at: string;
  signature_valid: boolean;
  realm_id: string;
  entity: string;
  entity_id: string;
  operation: string;
  last_updated_at: string | null;
  status: "captured" | "imported_manual" | "ignored" | "failed";
  ignore_reason: string | null;
  attempts: number;
  organization_id: string | null;
  sync_config_id: string | null;
  run_id: string | null;
  raw_notification: Record<string, unknown>;
  raw_headers: Record<string, unknown>;
  fetched_entity: Record<string, unknown> | null;
  imported_at: string | null;
  imported_by: string | null;
  last_error: string | null;
  processed_at: string | null;
  created_at: string;
};

async function getOrganizationIdByRealmId(realmId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("integration_connections")
    .select("organization_id")
    .eq("provider", "quickbooks_online")
    .contains("config", { realmId })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.organization_id as string | undefined) ?? null;
}

export async function insertQboWebhookEvents(input: QboWebhookEventInsert[]) {
  if (input.length === 0) return { inserted: 0, duplicates: 0 };
  const admin = createSupabaseAdminClient();
  let inserted = 0;
  let duplicates = 0;

  for (const event of input) {
    const organizationId = await getOrganizationIdByRealmId(event.realmId).catch(() => null);
    const { data: insertedRow, error } = await admin.from("qbo_webhook_events").insert({
      signature_valid: event.signatureValid,
      intuit_event_id: event.intuitEventId,
      realm_id: event.realmId,
      entity: event.entity,
      entity_id: event.entityId,
      operation: event.operation,
      last_updated_at: event.lastUpdatedAt,
      raw_payload: event.rawPayload,
      raw_notification: event.rawNotification ?? {},
      raw_headers: event.rawHeaders ?? {},
      organization_id: organizationId,
      status: event.signatureValid ? "captured" : "failed",
      ignore_reason: event.signatureValid ? null : "invalid_signature",
      last_error: event.signatureValid ? null : "Firma de webhook invalida",
      processed_at: event.signatureValid ? new Date().toISOString() : new Date().toISOString(),
    }).select("id").single();
    if (error) {
      if (error.code === "23505") {
        duplicates += 1;
        continue;
      }
      throw new Error(error.message);
    }
    inserted += 1;

    // Si la firma es válida, la org fue identificada y es Invoice/CreditMemo:
    // insertar en tabla unificada como 'en_cola' y disparar fetch en background
    const isActionable = event.signatureValid && organizationId &&
      (event.entity === "Invoice" || event.entity === "CreditMemo");
    if (isActionable && insertedRow?.id) {
      const webhookEventId = insertedRow.id as string;
      void admin.from("qbo_unified_invoices").upsert({
        organization_id: organizationId,
        webhook_event_id: webhookEventId,
        entity_id: event.entityId,
        entity_type: event.entity,
        import_source: "webhook",
        pipeline_status: "en_cola",
      }, { onConflict: "organization_id,entity_id,entity_type", ignoreDuplicates: true });
      // Fetch inmediato en background (sin await — el resultado actualiza a 'capturada')
      void fetchAndCaptureWebhookInvoice({
        organizationId,
        entityId: event.entityId,
        entityType: event.entity,
        webhookEventId,
      }).catch(() => { /* silently fail — queda en 'en_cola' */ });
    }
  }

  return { inserted, duplicates };
}

export async function processPendingQboWebhookEvents() {
  return {
    processed: 0,
    results: [],
    disabled: true,
    message: "Procesamiento automatico deshabilitado: modo captura manual activo",
  };
}

export async function listQboWebhookEvents(organizationId: string, limit = 100) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("qbo_webhook_events")
    .select("id, received_at, signature_valid, realm_id, entity, entity_id, operation, last_updated_at, status, ignore_reason, attempts, organization_id, sync_config_id, run_id, raw_notification, raw_headers, fetched_entity, imported_at, imported_by, last_error, processed_at, created_at")
    .eq("organization_id", organizationId)
    .order("received_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 300)));
  if (error) throw new Error(error.message);
  return (data ?? []) as QboWebhookEventRow[];
}

export async function importQboWebhookEventManually(input: { organizationId: string; actorId: string | null; eventId: string }) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("qbo_webhook_events")
    .select("id, organization_id, entity, entity_id, realm_id")
    .eq("id", input.eventId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Evento no encontrado");

  if (!["Invoice", "CreditMemo"].includes(String(data.entity ?? ""))) {
    throw new Error("Solo se soporta importacion manual de Invoice/CreditMemo");
  }

  const qboConnection = await getConnection(input.organizationId, "quickbooks_online");
  if (!qboConnection || qboConnection.status !== "connected") {
    throw new Error("QuickBooks Online no esta conectado");
  }

  const qboAuth = await ensureFreshQboToken({ organizationId: input.organizationId, actorId: input.actorId, qboConnection, forceRefresh: true });
  const raw = await fetchQboRawTransaction({
    accessToken: qboAuth.accessToken,
    realmId: qboAuth.realmId,
    invoiceId: String(data.entity_id ?? ""),
  });
  if (!raw || raw.type !== data.entity) {
    throw new Error("No se pudo obtener la entidad desde QBO para este webhook");
  }

  await admin
    .from("qbo_webhook_events")
    .update({
      status: "imported_manual",
      fetched_entity: raw.data ?? {},
      imported_at: new Date().toISOString(),
      imported_by: input.actorId,
      last_error: null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", input.eventId);

  return {
    id: input.eventId,
    status: "imported_manual",
    entity: data.entity,
    entityId: data.entity_id,
    fetchedEntity: raw.data ?? {},
  };
}

// ─── Unified Invoice Pipeline ─────────────────────────────────────────────────

/**
 * Ejecuta los pasos 3 y 4 del pipeline unificado: capturada → mapeada → enviada.
 * Usada por el flujo de webhook (background), el envío manual y el cron de recovery.
 */
async function mapAndSendUnifiedRow(input: {
  organizationId: string;
  unifiedInvoiceId: string;
  entityId: string;
  entityType: "Invoice" | "CreditMemo";
  rawEntity: QboInvoiceLike;
  syncConfig: SyncConfigRow;
  actorId: string | null;
  triggerSource: "manual" | "scheduled" | "retry";
}): Promise<{ fileName: string; runId: string; uploaded: number }> {
  const admin = createSupabaseAdminClient();

  const mappings = await getActiveMappings(input.organizationId);

  const lines = normalizeQboRows({
    invoices: input.entityType === "Invoice" ? [input.rawEntity] : [],
    salesReceipts: [],
    creditMemos: input.entityType === "CreditMemo" ? [input.rawEntity] : [],
    template: input.syncConfig.template,
    taxMode: input.syncConfig.tax_mode,
    mappings,
    r365VendorName: input.syncConfig.r365_vendor_name || undefined,
    r365Location: input.syncConfig.r365_location || undefined,
    syncConfigCustomerId: input.syncConfig.qbo_customer_id,
  });

  if (lines.length === 0) throw new Error("La factura no tiene líneas válidas para enviar a R365");

  const nowMapped = new Date().toISOString();
  await admin
    .from("qbo_unified_invoices")
    .update({ pipeline_status: "mapeada", mapped_at: nowMapped })
    .eq("id", input.unifiedInvoiceId)
    .eq("organization_id", input.organizationId);

  if (!input.syncConfig.r365_ftp_host) throw new Error("FTP no configurado en la sync config");
  const ftpSecrets = decryptJsonPayload<FtpStoredSecrets>({
    ciphertext: input.syncConfig.r365_ftp_secrets_ciphertext,
    iv: input.syncConfig.r365_ftp_secrets_iv,
    tag: input.syncConfig.r365_ftp_secrets_tag,
  });
  if (!ftpSecrets?.password) throw new Error("Credenciales FTP no disponibles");

  const ftp = {
    host: input.syncConfig.r365_ftp_host,
    port: input.syncConfig.r365_ftp_port ?? 21,
    username: input.syncConfig.r365_ftp_username ?? "",
    password: ftpSecrets.password,
    secure: input.syncConfig.r365_ftp_secure,
    remotePath: input.syncConfig.r365_ftp_remote_path,
  };

  const csvBuild = buildR365Csv({ template: input.syncConfig.template, lines });
  const invoiceNumber = lines[0]?.invoiceNumber;
  const vendorSlug = (lines[0]?.vendor ?? "r365_inv").replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 20);
  const fileName = buildFileName(vendorSlug, invoiceNumber);

  const runId = await createRun(input.organizationId, input.actorId, input.triggerSource, input.syncConfig.id);

  await uploadCsvToFtp({ ...ftp, fileName, content: csvBuild.csv });

  const nowIso = new Date().toISOString();

  await admin.from("integration_outbox_files").insert({
    run_id: runId,
    organization_id: input.organizationId,
    storage_provider: "r365_ftp",
    remote_path: ftp.remotePath,
    file_name: fileName,
    mime_type: "text/csv",
    size_bytes: Buffer.byteLength(csvBuild.csv, "utf8"),
    sha256: csvBuild.hash,
    status: "uploaded",
    uploaded_at: nowIso,
  });

  await admin
    .from("qbo_unified_invoices")
    .update({ pipeline_status: "enviada", sent_at: nowIso })
    .eq("id", input.unifiedInvoiceId)
    .eq("organization_id", input.organizationId);

  await admin
    .from("integration_runs")
    .update({
      status: "completed",
      finished_at: nowIso,
      template_used: input.syncConfig.template,
      file_name: fileName,
      file_hash: csvBuild.hash,
      total_detected: 1,
      total_mapped: lines.length,
      total_uploaded: lines.length,
      total_failed: 0,
      total_skipped_duplicates: 0,
    })
    .eq("id", runId)
    .eq("organization_id", input.organizationId);

  await appendIntegrationAudit({
    organizationId: input.organizationId,
    runId,
    level: "info",
    code: "invoice_sent",
    message: `Factura ${input.entityId} (${input.entityType}) enviada a R365 — trigger: ${input.triggerSource}`,
    metadata: { fileName, entityId: input.entityId, entityType: input.entityType },
  });

  return { fileName, runId, uploaded: lines.length };
}

async function fetchAndCaptureWebhookInvoice(input: {
  organizationId: string;
  entityId: string;
  entityType: string;
  webhookEventId: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();

  const qboConnection = await getConnection(input.organizationId, "quickbooks_online");
  if (!qboConnection || qboConnection.status !== "connected") return;

  const qboAuth = await ensureFreshQboToken({ organizationId: input.organizationId, actorId: null, qboConnection });
  const raw = await fetchQboRawTransaction({
    accessToken: qboAuth.accessToken,
    realmId: qboAuth.realmId,
    invoiceId: input.entityId,
  });

  if (!raw?.data) return;

  const entity = raw.data as Record<string, unknown>;
  const docNumber = typeof entity.DocNumber === "string" ? entity.DocNumber : null;
  const txnDate = typeof entity.TxnDate === "string" ? entity.TxnDate : null;
  const dueDate = typeof entity.DueDate === "string" ? entity.DueDate : null;
  const totalAmount = entity.TotalAmt !== null && entity.TotalAmt !== undefined ? Number(entity.TotalAmt) : null;
  const currencyRef = (entity.CurrencyRef ?? {}) as Record<string, unknown>;
  const currency = typeof currencyRef.value === "string" ? currencyRef.value : null;
  const customerRef = (entity.CustomerRef ?? {}) as Record<string, unknown>;
  const customerName = typeof customerRef.name === "string" ? customerRef.name : null;
  const customerId = typeof customerRef.value === "string" ? customerRef.value : null;

  let r365Location: string | null = null;
  let syncConfigId: string | null = null;

  if (customerId) {
    const { data: syncConfigs } = await admin
      .from("qbo_r365_sync_configs")
      .select("id, r365_location")
      .eq("organization_id", input.organizationId)
      .eq("qbo_customer_id", customerId)
      .limit(1);

    const syncConfig = syncConfigs?.[0] ?? null;
    if (syncConfig) {
      syncConfigId = String(syncConfig.id);
      r365Location = typeof syncConfig.r365_location === "string" ? syncConfig.r365_location : null;

      if (!r365Location) {
        const customers = await fetchQboCustomers({ accessToken: qboAuth.accessToken, realmId: qboAuth.realmId }).catch(() => [] as QboCustomer[]);
        const found = customers.find((c) => c.id === customerId);
        if (found?.acctNum) {
          r365Location = found.acctNum;
          void admin.from("qbo_r365_sync_configs")
            .update({ r365_location: found.acctNum })
            .eq("id", syncConfig.id);
        }
      }
    }
  }

  const nowIso = new Date().toISOString();

  // Si el cliente no tiene sync config → el webhook no pertenece a ningún cliente
  // configurado, eliminamos la fila de unified para que no aparezca en el historial.
  if (!syncConfigId) {
    await admin.from("qbo_unified_invoices")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("entity_id", input.entityId)
      .eq("entity_type", input.entityType);
    return;
  }

  const { data: updatedRow } = await admin.from("qbo_unified_invoices").update({
    pipeline_status: "capturada",
    raw_entity: entity,
    fetched_at: nowIso,
    doc_number: docNumber,
    txn_date: txnDate,
    due_date: dueDate,
    total_amount: totalAmount,
    currency,
    customer_name: customerName,
    sync_config_id: syncConfigId,
  })
    .eq("organization_id", input.organizationId)
    .eq("entity_id", input.entityId)
    .eq("entity_type", input.entityType)
    .select("id")
    .maybeSingle();

  await admin.from("qbo_webhook_events").update({
    status: "imported_manual",
    fetched_entity: entity,
    imported_at: nowIso,
    last_error: null,
    processed_at: nowIso,
  }).eq("id", input.webhookEventId);

  // Continuar pipeline: mapeada → enviada en el mismo background call
  const unifiedInvoiceId = updatedRow?.id ? String(updatedRow.id) : null;
  if (unifiedInvoiceId && syncConfigId) {
    try {
      const fullSyncConfig = await getSyncConfigRow(input.organizationId, syncConfigId);
      if (fullSyncConfig.r365_ftp_host) {
        await mapAndSendUnifiedRow({
          organizationId: input.organizationId,
          unifiedInvoiceId,
          entityId: input.entityId,
          entityType: input.entityType as "Invoice" | "CreditMemo",
          rawEntity: entity as QboInvoiceLike,
          syncConfig: fullSyncConfig,
          actorId: null,
          triggerSource: "scheduled",
        });
      }
    } catch (err) {
      // La factura queda en 'capturada' — el cron de recovery la reintentará
      console.error("[qbo-webhook-pipeline]", input.entityId, err instanceof Error ? err.message : err);
    }
  }
}

export type UnifiedInvoiceRow = {
  id: string;
  organizationId: string;
  syncConfigId: string | null;
  webhookEventId: string | null;
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
  mappedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Trae una factura o nota de crédito de QBO por su DocNumber y la persiste
 * en qbo_unified_invoices con import_source='manual'.
 *
 * Flujo:
 *   1. Busca en QBO por DocNumber (Invoice → CreditMemo).
 *   2. Resuelve la sync config por CustomerRef.value — si el cliente no tiene
 *      sync config configurada en esta organización, lanza error.
 *   3. Si r365_location está vacío en la sync config, lo obtiene del AcctNum
 *      del Customer en QBO y lo guarda en la sync config (cache lazy).
 *   4. Upsert en qbo_unified_invoices: si ya existía, actualiza el raw_entity;
 *      si es nuevo, lo crea en pipeline_status='capturada'.
 *
 * alreadyExisted=true indica que la factura ya estaba en el historial (se actualizó).
 */
export async function fetchInvoiceByDocNumber(
  organizationId: string,
  docNumber: string,
  options: { force?: boolean } = {},
): Promise<{
  entityId: string;
  entityType: string;
  docNumber: string;
  alreadyExisted: boolean;
  existing?: { pipelineStatus: string; importSource: string; sentAt: string | null; txnDate: string | null };
}> {
  const admin = createSupabaseAdminClient();

  const qboConnection = await getConnection(organizationId, "quickbooks_online");
  if (!qboConnection || qboConnection.status !== "connected") {
    throw new Error("QuickBooks no está conectado");
  }

  const qboAuth = await ensureFreshQboToken({ organizationId, actorId: null, qboConnection });

  const result = await fetchQboTransactionByDocNumber({
    accessToken: qboAuth.accessToken,
    realmId: qboAuth.realmId,
    docNumber: docNumber.trim(),
  });

  if (!result) {
    throw new Error(`No se encontró ninguna factura o nota de crédito con DocNumber "${docNumber}" en QBO`);
  }

  const { type: entityType, data: entity } = result;
  const entityId = typeof entity.Id === "string" ? entity.Id : null;
  if (!entityId) throw new Error("La factura encontrada no tiene Id válido");

  const customerRef = (entity as Record<string, unknown>).CustomerRef as Record<string, unknown> | undefined;
  const customerId = typeof customerRef?.value === "string" ? customerRef.value : null;

  let syncConfigId: string | null = null;
  let r365Location: string | null = null;

  if (customerId) {
    const { data: syncConfigs } = await admin
      .from("qbo_r365_sync_configs")
      .select("id, r365_location")
      .eq("organization_id", organizationId)
      .eq("qbo_customer_id", customerId)
      .limit(1);

    const syncConfig = syncConfigs?.[0] ?? null;
    if (syncConfig) {
      syncConfigId = String(syncConfig.id);
      r365Location = typeof syncConfig.r365_location === "string" ? syncConfig.r365_location : null;

      if (!r365Location) {
        const customers = await fetchQboCustomers({ accessToken: qboAuth.accessToken, realmId: qboAuth.realmId }).catch(() => [] as QboCustomer[]);
        const found = customers.find((c) => c.id === customerId);
        if (found?.acctNum) {
          r365Location = found.acctNum;
          void admin.from("qbo_r365_sync_configs")
            .update({ r365_location: found.acctNum })
            .eq("id", syncConfig.id);
        }
      }
    }
  }

  if (!syncConfigId) {
    throw new Error("El cliente de esta factura no tiene una sincronización configurada en esta empresa");
  }

  const rawEntity = entity as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const txnDate = typeof rawEntity.TxnDate === "string" ? rawEntity.TxnDate : null;
  const dueDate = typeof rawEntity.DueDate === "string" ? rawEntity.DueDate : null;
  const totalAmount = rawEntity.TotalAmt !== null && rawEntity.TotalAmt !== undefined ? Number(rawEntity.TotalAmt) : null;
  const currencyRef = (rawEntity.CurrencyRef ?? {}) as Record<string, unknown>;
  const currency = typeof currencyRef.value === "string" ? currencyRef.value : null;
  const customerName = typeof customerRef?.name === "string" ? customerRef.name : null;

  const { data: existing } = await admin
    .from("qbo_unified_invoices")
    .select("id, pipeline_status, import_source, sent_at, txn_date")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("entity_type", entityType)
    .maybeSingle();

  const alreadyExisted = Boolean(existing);

  // Si ya existe y no se forzó el reemplazo → devolver los datos actuales sin tocar nada.
  // El frontend mostrará confirmación al usuario antes de re-llamar con force=true.
  if (alreadyExisted && !options.force) {
    return {
      entityId,
      entityType,
      docNumber: docNumber.trim(),
      alreadyExisted: true,
      existing: {
        pipelineStatus: String(existing!.pipeline_status ?? ""),
        importSource: String(existing!.import_source ?? ""),
        sentAt: existing!.sent_at ? String(existing!.sent_at) : null,
        txnDate: existing!.txn_date ? String(existing!.txn_date) : null,
      },
    };
  }

  const { error: upsertError } = await admin.from("qbo_unified_invoices").upsert({
    organization_id: organizationId,
    sync_config_id: syncConfigId,
    entity_id: entityId,
    entity_type: entityType,
    import_source: "manual",
    pipeline_status: "capturada",
    raw_entity: rawEntity,
    fetched_at: nowIso,
    doc_number: docNumber.trim(),
    txn_date: txnDate,
    due_date: dueDate,
    total_amount: totalAmount,
    currency,
    customer_name: customerName,
    vendor_name: customerName,
  }, { onConflict: "organization_id,entity_id,entity_type", ignoreDuplicates: false });

  if (upsertError) throw new Error(upsertError.message);

  return { entityId, entityType, docNumber: docNumber.trim(), alreadyExisted };
}

export async function getUnifiedInvoiceStats(organizationId: string): Promise<{
  total: number;
  enviadas: number;
  atascadas: number;
}> {
  const admin = createSupabaseAdminClient();
  // Webhooks en 'en_cola' por más de 24h = no se procesaron → requieren atención.
  const stuckThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [totalRes, enviadasRes, atascadasRes] = await Promise.all([
    admin.from("qbo_unified_invoices")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    admin.from("qbo_unified_invoices")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("pipeline_status", "enviada"),
    admin.from("qbo_unified_invoices")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("pipeline_status", "en_cola")
      .lte("created_at", stuckThreshold),
  ]);

  return {
    total: totalRes.count ?? 0,
    enviadas: enviadasRes.count ?? 0,
    atascadas: atascadasRes.count ?? 0,
  };
}

export async function listUnifiedHistory(
  organizationId: string,
  limit = 100,
  syncConfigId?: string | null,
): Promise<UnifiedInvoiceRow[]> {
  const admin = createSupabaseAdminClient();

  const baseQuery = admin
    .from("qbo_unified_invoices")
    .select("id, organization_id, sync_config_id, webhook_event_id, entity_id, entity_type, import_source, pipeline_status, doc_number, txn_date, due_date, total_amount, currency, customer_name, vendor_name, raw_entity, fetched_at, mapped_at, sent_at, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 500)));

  const { data, error } = await (syncConfigId
    ? baseQuery.eq("sync_config_id", syncConfigId)
    : baseQuery.not("sync_config_id", "is", null));
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    syncConfigId: row.sync_config_id ? String(row.sync_config_id) : null,
    webhookEventId: row.webhook_event_id ? String(row.webhook_event_id) : null,
    entityId: String(row.entity_id),
    entityType: row.entity_type as "Invoice" | "CreditMemo",
    importSource: row.import_source as "sync" | "webhook" | "manual",
    pipelineStatus: row.pipeline_status as "en_cola" | "capturada" | "mapeada" | "enviada",
    docNumber: row.doc_number ? String(row.doc_number) : null,
    txnDate: row.txn_date ? String(row.txn_date) : null,
    dueDate: row.due_date ? String(row.due_date) : null,
    totalAmount: row.total_amount !== null && row.total_amount !== undefined ? Number(row.total_amount) : null,
    currency: row.currency ? String(row.currency) : null,
    customerName: row.customer_name ? String(row.customer_name) : null,
    vendorName: row.vendor_name ? String(row.vendor_name) : null,
    rawEntity: (row.raw_entity as Record<string, unknown> | null) ?? null,
    fetchedAt: row.fetched_at ? String(row.fetched_at) : null,
    mappedAt: row.mapped_at ? String(row.mapped_at) : null,
    sentAt: row.sent_at ? String(row.sent_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Importa históricamente todas las Invoices y CreditMemos de QBO para el cliente
 * configurado en la sync config, a partir de la fecha indicada.
 *
 * Filtra por TxnDate (fecha real de la factura), NO por MetaData.LastUpdatedTime.
 * Usar MetaData traería facturas modificadas recientemente pero con fecha anterior
 * al rango deseado — incorrecto para importación histórica.
 *
 * Los SalesReceipts se omiten: no son soportados en el pipeline de R365.
 *
 * El parámetro `sinceIso` puede ser fecha YYYY-MM-DD o ISO completo; solo se usa
 * el segmento de fecha (primeros 10 caracteres).
 *
 * Upserta en lotes de 100 sobre (organization_id, entity_id, entity_type).
 * Si una factura ya existía en el historial unificado, actualiza su raw_entity.
 */
export async function backfillFromQboSinceDate(
  organizationId: string,
  syncConfigId: string,
  sinceIso: string,
): Promise<{ upserted: number }> {
  const admin = createSupabaseAdminClient();

  const qboConnection = await getConnection(organizationId, "quickbooks_online");
  if (!qboConnection || qboConnection.status !== "connected") {
    throw new Error("QuickBooks no está conectado");
  }

  const syncConfigRow = await getSyncConfigRow(organizationId, syncConfigId);
  const qboAuth = await ensureFreshQboToken({ organizationId, actorId: null, qboConnection });

  const txnDateFrom = sinceIso.trim().slice(0, 10);
  const { invoices, creditMemos } = await fetchQboSalesTransactions({
    accessToken: qboAuth.accessToken,
    realmId: qboAuth.realmId,
    customerId: syncConfigRow.qbo_customer_id,
    txnDateFrom,
    skipSalesReceipts: true,
  });

  const nowIso = new Date().toISOString();

  const toUpsert = [
    ...invoices.map((data) => ({ type: "Invoice" as const, data })),
    ...creditMemos.map((data) => ({ type: "CreditMemo" as const, data })),
  ]
    .filter((item) => Boolean(item.data.Id))
    .map(({ type, data }) => ({
      organization_id: organizationId,
      sync_config_id: syncConfigId,
      entity_id: String(data.Id),
      entity_type: type,
      import_source: "sync" as const,
      pipeline_status: "capturada" as const,
      raw_entity: data as Record<string, unknown>,
      fetched_at: nowIso,
      doc_number: data.DocNumber ?? null,
      txn_date: data.TxnDate ?? null,
      due_date: data.DueDate ?? null,
      total_amount: data.TotalAmt !== undefined && data.TotalAmt !== null ? Number(data.TotalAmt) : null,
      currency: data.CurrencyRef?.value ?? null,
      customer_name: data.CustomerRef?.name ?? null,
      vendor_name: data.CustomerRef?.name ?? null,
    }));

  if (toUpsert.length === 0) return { upserted: 0 };

  const batchSize = 100;
  let upserted = 0;
  for (let i = 0; i < toUpsert.length; i += batchSize) {
    const batch = toUpsert.slice(i, i + batchSize);
    const { error } = await admin.from("qbo_unified_invoices").upsert(batch, {
      onConflict: "organization_id,entity_id,entity_type",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
    upserted += batch.length;
  }

  return { upserted };
}

/**
 * Ejecuta solo el paso de mapping sobre una fila del historial unificado:
 * lee el raw_entity, normaliza a NormalizedInvoiceLine[], y avanza
 * pipeline_status a 'mapeada'. No toca el FTP.
 *
 * Útil cuando la factura está en 'capturada' o 'en_cola' y el usuario
 * quiere validar el mapeo antes de enviar.
 */
export async function mapOnlyUnifiedInvoice(input: {
  organizationId: string;
  unifiedInvoiceId: string;
}): Promise<{ mapped: number }> {
  const admin = createSupabaseAdminClient();

  const { data: row, error: rowError } = await admin
    .from("qbo_unified_invoices")
    .select("id, entity_id, entity_type, raw_entity, sync_config_id, pipeline_status")
    .eq("organization_id", input.organizationId)
    .eq("id", input.unifiedInvoiceId)
    .maybeSingle();

  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error("Factura no encontrada en el historial");
  if (!row.raw_entity) throw new Error("La factura no tiene datos QBO almacenados — no se puede mapear");
  if (row.pipeline_status === "enviada") throw new Error("La factura ya fue enviada a R365 y no se puede remapear");

  const syncConfigId = row.sync_config_id ? String(row.sync_config_id) : null;
  if (!syncConfigId) throw new Error("Esta factura no tiene sincronización asociada");

  const syncConfig = await getSyncConfigRow(input.organizationId, syncConfigId);
  const mappings = await getActiveMappings(input.organizationId);

  const entityType = row.entity_type as "Invoice" | "CreditMemo";
  const rawEntity = row.raw_entity as QboInvoiceLike;

  const lines = normalizeQboRows({
    invoices: entityType === "Invoice" ? [rawEntity] : [],
    salesReceipts: [],
    creditMemos: entityType === "CreditMemo" ? [rawEntity] : [],
    template: syncConfig.template,
    taxMode: syncConfig.tax_mode,
    mappings,
    r365VendorName: syncConfig.r365_vendor_name || undefined,
    r365Location: syncConfig.r365_location || undefined,
    syncConfigCustomerId: syncConfig.qbo_customer_id,
  });

  if (lines.length === 0) throw new Error("La factura no tiene líneas válidas para mapear — revisá los mappings del sync config");

  const { error: updateError } = await admin
    .from("qbo_unified_invoices")
    .update({ pipeline_status: "mapeada", mapped_at: new Date().toISOString() })
    .eq("id", input.unifiedInvoiceId)
    .eq("organization_id", input.organizationId);

  if (updateError) throw new Error(updateError.message);

  return { mapped: lines.length };
}

/**
 * Envía individualmente a R365 FTP una factura del historial unificado
 * (qbo_unified_invoices), independientemente de cómo llegó (webhook, manual, backfill).
 *
 * A diferencia de sendSingleInvoiceFromHistory, que requiere integration_run_items
 * con líneas ya mapeadas, esta función lee el raw_entity guardado en qbo_unified_invoices
 * y ejecuta el mapping completo en tiempo real usando normalizeQboRows.
 *
 * Flujo:
 *   1. Lee qbo_unified_invoices por id — requiere raw_entity y sync_config_id.
 *   2. Carga sync config (template, tax_mode, FTP, vendor/location) y mappings activos.
 *   3. Normaliza el raw_entity a NormalizedInvoiceLine[].
 *   4. Construye el CSV con buildR365Csv y lo sube al FTP de la sync config.
 *   5. Actualiza pipeline_status='enviada' en qbo_unified_invoices.
 *   6. Registra el run en integration_runs con trigger_source='manual'.
 *
 * Requiere que la sync config tenga FTP configurado; no usa el FTP global de la conexión
 * porque cada sync config tiene sus propias credenciales por cliente.
 */
export async function sendSingleUnifiedInvoice(input: {
  organizationId: string;
  actorId: string | null;
  /** UUID de la fila en qbo_unified_invoices */
  unifiedInvoiceId: string;
}): Promise<{ uploaded: number; fileName: string; runId: string }> {
  const admin = createSupabaseAdminClient();

  const { data: row, error: rowError } = await admin
    .from("qbo_unified_invoices")
    .select("id, entity_id, entity_type, raw_entity, sync_config_id")
    .eq("organization_id", input.organizationId)
    .eq("id", input.unifiedInvoiceId)
    .maybeSingle();

  if (rowError) throw new Error(rowError.message);
  if (!row) throw new Error("Factura no encontrada en el historial");
  if (!row.raw_entity) throw new Error("La factura no tiene datos QBO almacenados — no se puede enviar");

  const syncConfigId = row.sync_config_id ? String(row.sync_config_id) : null;
  if (!syncConfigId) throw new Error("Esta factura no tiene sincronización asociada");

  const syncConfig = await getSyncConfigRow(input.organizationId, syncConfigId);

  return mapAndSendUnifiedRow({
    organizationId: input.organizationId,
    unifiedInvoiceId: input.unifiedInvoiceId,
    entityId: String(row.entity_id),
    entityType: row.entity_type as "Invoice" | "CreditMemo",
    rawEntity: row.raw_entity as QboInvoiceLike,
    syncConfig,
    actorId: input.actorId,
    triggerSource: "manual",
  });
}

export async function backfillSyncConfigToUnified(
  organizationId: string,
  syncConfigId: string,
): Promise<{ upserted: number }> {
  const admin = createSupabaseAdminClient();

  // Use qbo_customer_name from the sync config — NOT p.vendor (the R365 vendor name).
  // Backfill payload.vendor = r365VendorName (e.g. "PRODEL DISTRIBUTION INC"), which is the
  // R365 accounting vendor, not the QBO billing customer. They are different fields.
  const { data: configRow, error: configError } = await admin
    .from("qbo_r365_sync_configs")
    .select("qbo_customer_name")
    .eq("id", syncConfigId)
    .single();
  if (configError) throw new Error(configError.message);
  const qboCustomerName = (configRow?.qbo_customer_name as string | null) ?? null;

  const { data: runRows, error: runError } = await admin
    .from("integration_runs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("sync_config_id", syncConfigId)
    .limit(1000);

  if (runError) throw new Error(runError.message);
  const runIds = (runRows ?? []).map((r) => String(r.id));
  if (runIds.length === 0) return { upserted: 0 };

  const { data: itemRows, error: itemsError } = await admin
    .from("integration_run_items")
    .select("source_invoice_id, status, payload, created_at")
    .eq("organization_id", organizationId)
    .in("run_id", runIds)
    .not("source_invoice_id", "is", null)
    .neq("status", "skipped_duplicate")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (itemsError) throw new Error(itemsError.message);

  const byInvoiceId = new Map<string, typeof itemRows[number]>();
  for (const row of itemRows ?? []) {
    const key = String(row.source_invoice_id);
    if (!byInvoiceId.has(key)) byInvoiceId.set(key, row);
  }

  if (byInvoiceId.size === 0) return { upserted: 0 };

  const toUpsert = [...byInvoiceId.values()].map((row) => {
    const p = (row.payload ?? {}) as Record<string, unknown>;
    const isSent = row.status === "uploaded" || row.status === "validated";
    const entityType = p.transactionTypeCode === "2" ? "CreditMemo" : "Invoice";
    return {
      organization_id: organizationId,
      sync_config_id: syncConfigId,
      entity_id: String(row.source_invoice_id),
      entity_type: entityType,
      import_source: "sync",
      pipeline_status: isSent ? "enviada" : "mapeada",
      doc_number: typeof p.invoiceNumber === "string" ? p.invoiceNumber : null,
      txn_date: typeof p.invoiceDate === "string" ? p.invoiceDate : null,
      due_date: typeof p.dueDate === "string" ? p.dueDate : null,
      total_amount: typeof p.totalAmount === "number" ? p.totalAmount : null,
      currency: typeof p.currency === "string" ? p.currency : null,
      customer_name: qboCustomerName,
      vendor_name: typeof p.vendor === "string" ? p.vendor : null,
      mapped_at: String(row.created_at),
      sent_at: isSent ? String(row.created_at) : null,
    };
  });

  const batchSize = 100;
  let upserted = 0;
  for (let i = 0; i < toUpsert.length; i += batchSize) {
    const batch = toUpsert.slice(i, i + batchSize);
    const { error } = await admin.from("qbo_unified_invoices").upsert(batch, {
      onConflict: "organization_id,entity_id,entity_type",
      ignoreDuplicates: false,
    });
    if (error) throw new Error(error.message);
    upserted += batch.length;
  }

  return { upserted };
}

type QueueResult = {
  unifiedInvoiceId: string;
  status: "completed" | "failed";
  error?: string;
};

/**
 * Procesa la cola de facturas atascadas en el pipeline unificado.
 * Usado exclusivamente por el cron diario como mecanismo de recovery.
 *
 * Facturas objetivo:
 *   - en_cola   → re-fetch desde QBO, luego map + send
 *   - capturada → map + send (raw_entity ya disponible)
 *   - mapeada   → reintento de send (FTP falló en intento anterior)
 */
export async function processQboUnifiedQueue(): Promise<{
  processed: number;
  completed: number;
  failed: number;
  results: QueueResult[];
}> {
  const admin = createSupabaseAdminClient();

  const { data: stuck, error } = await admin
    .from("qbo_unified_invoices")
    .select("id, organization_id, entity_id, entity_type, raw_entity, sync_config_id, pipeline_status")
    .in("pipeline_status", ["en_cola", "capturada", "mapeada"])
    .eq("import_source", "webhook")
    .limit(100);

  if (error) throw new Error(error.message);

  const rows = stuck ?? [];
  const results: QueueResult[] = [];

  for (const row of rows) {
    const unifiedInvoiceId = String(row.id);
    const organizationId = String(row.organization_id);

    try {
      let rawEntity = row.raw_entity as QboInvoiceLike | null;

      // Para en_cola o sin raw_entity: re-fetch desde QBO
      if (row.pipeline_status === "en_cola" || !rawEntity) {
        const qboConnection = await getConnection(organizationId, "quickbooks_online");
        if (!qboConnection || qboConnection.status !== "connected") {
          results.push({ unifiedInvoiceId, status: "failed", error: "QBO no conectado" });
          continue;
        }
        const qboAuth = await ensureFreshQboToken({ organizationId, actorId: null, qboConnection });
        const raw = await fetchQboRawTransaction({
          accessToken: qboAuth.accessToken,
          realmId: qboAuth.realmId,
          invoiceId: String(row.entity_id),
        });
        if (!raw?.data) {
          results.push({ unifiedInvoiceId, status: "failed", error: "Entidad no encontrada en QBO" });
          continue;
        }
        rawEntity = raw.data as QboInvoiceLike;
        const nowIso = new Date().toISOString();
        await admin
          .from("qbo_unified_invoices")
          .update({ pipeline_status: "capturada", raw_entity: rawEntity, fetched_at: nowIso })
          .eq("id", unifiedInvoiceId);
      }

      if (!row.sync_config_id) {
        results.push({ unifiedInvoiceId, status: "failed", error: "Sin sync config asociada" });
        continue;
      }

      const syncConfig = await getSyncConfigRow(organizationId, String(row.sync_config_id));

      await mapAndSendUnifiedRow({
        organizationId,
        unifiedInvoiceId,
        entityId: String(row.entity_id),
        entityType: row.entity_type as "Invoice" | "CreditMemo",
        rawEntity,
        syncConfig,
        actorId: null,
        triggerSource: "retry",
      });

      results.push({ unifiedInvoiceId, status: "completed" });
    } catch (err) {
      results.push({
        unifiedInvoiceId,
        status: "failed",
        error: err instanceof Error ? err.message : "error desconocido",
      });
    }
  }

  return {
    processed: rows.length,
    completed: results.filter((r) => r.status === "completed").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_API_BASE_URL = "https://quickbooks.api.intuit.com";

type ExchangeTokenInput = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
};

type RefreshTokenInput = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type QboTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type QboInvoiceLikeLine = {
  Id?: string;
  Amount?: number;
  TaxInclusiveAmt?: number;
  TaxAmount?: number;
  Description?: string;
  DetailType?: string;
  AccountBasedExpenseLineDetail?: {
    AccountRef?: { value?: string; name?: string };
    TaxAmount?: number;
  };
  SalesItemLineDetail?: {
    ItemRef?: { value?: string; name?: string };
    Qty?: number;
    UnitPrice?: number;
    TaxAmount?: number;
  };
};

export type QboInvoiceLike = {
  Id?: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CurrencyRef?: { value?: string; name?: string };
  CustomerRef?: { value?: string; name?: string };
  PONumber?: string;
  SalesTermRef?: { value?: string; name?: string };
  PrivateNote?: string;
  MetaData?: {
    LastUpdatedTime?: string;
  };
  TxnTaxDetail?: {
    TotalTax?: number;
  };
  Line?: QboInvoiceLikeLine[];
};

type QueryResponse<T> = {
  QueryResponse?: {
    Invoice?: T[];
    SalesReceipt?: T[];
    CreditMemo?: T[];
  };
  queryResponse?: {
    Invoice?: T[];
    SalesReceipt?: T[];
    CreditMemo?: T[];
  };
};

type QboFaultError = { message?: string; detail?: string; code?: string; Message?: string; Detail?: string };

function basicAuth(clientId: string, clientSecret: string) {
  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

async function fetchToken(form: URLSearchParams, clientId: string, clientSecret: string) {
  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as Partial<QboTokenResponse> & { error_description?: string };
  if (!response.ok || !data.access_token || !data.refresh_token || !data.expires_in || !data.token_type) {
    throw new Error(data.error_description || "No se pudo autenticar con QuickBooks Online");
  }

  return data as QboTokenResponse;
}

export function buildQboAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(QBO_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeQboOAuthCode(input: ExchangeTokenInput) {
  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", input.code);
  form.set("redirect_uri", input.redirectUri);

  return fetchToken(form, input.clientId, input.clientSecret);
}

export async function refreshQboAccessToken(input: RefreshTokenInput) {
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", input.refreshToken);

  return fetchToken(form, input.clientId, input.clientSecret);
}

/**
 * Ejecuta un SELECT paginado sobre una tabla QBO usando la Query API.
 *
 * Modos de filtro de fecha (mutuamente excluyentes; usar uno a la vez):
 *   - `sinceIso`    → WHERE MetaData.LastUpdatedTime >= '...'  (webhook/sync incremental)
 *   - `txnDateFrom` → WHERE TxnDate >= 'YYYY-MM-DD'           (backfill histórico por fecha de factura)
 *
 * La paginación usa STARTPOSITION / MAXRESULTS de 1000 en 1000 hasta agotar resultados.
 * El error code QBO 3100 indica que la app ya no está autorizada para la company —
 * se re-lanza con prefijo "QBO_3100:" para que la UI lo traduzca a un mensaje claro.
 */
async function queryQboTable<T>(input: {
  accessToken: string;
  realmId: string;
  table: "Invoice" | "SalesReceipt" | "CreditMemo";
  /** Filtra por CustomerRef = customerId (solo caracteres alfanuméricos/._-) */
  customerId?: string;
  /** Filtra por MetaData.LastUpdatedTime >= ISO (modo incremental / webhook) */
  sinceIso?: string;
  /** Filtra por TxnDate >= 'YYYY-MM-DD' (modo backfill histórico) */
  txnDateFrom?: string;
}) {
  const sanitizeCustomerId = (value: string) => {
    const trimmed = value.trim();
    if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
      throw new Error("customerId invalido para consulta QBO");
    }
    return trimmed;
  };

  const buildSinceClause = (sinceIso?: string) => {
    if (!sinceIso) return "";
    const epoch = Date.parse(sinceIso);
    if (!Number.isFinite(epoch)) {
      throw new Error("sinceIso invalido para consulta QBO");
    }
    const safeSince = new Date(epoch).toISOString().replace(".000", "");
    return `MetaData.LastUpdatedTime >= '${safeSince}'`;
  };

  const buildTxnDateFromClause = (txnDateFrom?: string) => {
    if (!txnDateFrom) return "";
    const safe = txnDateFrom.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) {
      throw new Error("txnDateFrom invalido para consulta QBO (debe ser YYYY-MM-DD)");
    }
    return `TxnDate >= '${safe}'`;
  };

  const extractFault = (payload: QueryResponse<T> & {
    Fault?: { Error?: QboFaultError[] };
    fault?: { error?: QboFaultError[] };
  }) => payload.Fault?.Error?.[0] ?? payload.fault?.error?.[0];

  const doRequest = async (baseUrl: string, query: string) => {
    const response = await fetch(
      `${baseUrl}/v3/company/${input.realmId}/query?minorversion=75`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/text",
        },
        body: query,
        cache: "no-store",
      },
    );

    const payload = (await response.json().catch(() => ({}))) as QueryResponse<T> & {
      Fault?: { Error?: QboFaultError[] };
      fault?: { error?: QboFaultError[] };
    };

    return { response, payload, fault: extractFault(payload) };
  };

  const pageSize = 1000;
  const output: T[] = [];
  let startPosition = 1;

  while (true) {
    const clauses: string[] = [];
    if (input.customerId) {
      clauses.push(`CustomerRef = '${sanitizeCustomerId(input.customerId)}'`);
    }
    const sinceClause = buildSinceClause(input.sinceIso);
    if (sinceClause) {
      clauses.push(sinceClause);
    }
    const txnClause = buildTxnDateFromClause(input.txnDateFrom);
    if (txnClause) {
      clauses.push(txnClause);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const query = `select * from ${input.table}${where} startposition ${startPosition} maxresults ${pageSize}`;

    const { response, payload, fault } = await doRequest(QBO_API_BASE_URL, query);
    const message = (fault?.Detail ?? fault?.Message ?? fault?.detail ?? fault?.message ?? "").trim();

    if (!response.ok) {
      const errorCode = String(fault?.code ?? "").trim();
      const detail = (fault?.Detail ?? fault?.Message ?? fault?.detail ?? fault?.message ?? "").trim();
      if (errorCode === "3100") {
        throw new Error("QBO_3100:La autorizacion de la app con esta company no es valida. Reconecta QuickBooks.");
      }
      throw new Error(detail || message || `Error consultando ${input.table} en QBO`);
    }

    const queryResponse = payload.QueryResponse ?? payload.queryResponse;
    const batch = input.table === "Invoice"
      ? (queryResponse?.Invoice ?? []) as T[]
      : input.table === "SalesReceipt"
        ? (queryResponse?.SalesReceipt ?? []) as T[]
        : (queryResponse?.CreditMemo ?? []) as T[];

    output.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    startPosition += pageSize;
  }

  return output;
}

/**
 * Trae Invoices, SalesReceipts y CreditMemos de QBO para un cliente dado.
 *
 * Modos de filtro (usar uno a la vez):
 *   - `sinceIso`    → filtra por MetaData.LastUpdatedTime en SQL + post-filtro in-memory.
 *                     Usado para sync incremental y procesamiento de webhooks.
 *   - `txnDateFrom` → filtra por TxnDate en SQL (YYYY-MM-DD), sin post-filtro.
 *                     Usado para importación histórica (backfill), donde lo que importa
 *                     es la fecha real de la factura, no cuándo fue modificada.
 *
 * `skipSalesReceipts`: pasar true en backfill — los SalesReceipts no se usan en R365
 * y evita una API call innecesaria a QBO.
 */
export async function fetchQboSalesTransactions(input: {
  accessToken: string;
  realmId: string;
  customerId?: string;
  /** Filtra por MetaData.LastUpdatedTime >= ISO (sync incremental) */
  sinceIso?: string;
  /** Filtra por TxnDate >= 'YYYY-MM-DD' (backfill histórico) */
  txnDateFrom?: string;
  /** Si true, omite la query de SalesReceipts (no aplican a R365) */
  skipSalesReceipts?: boolean;
}) {
  const invoiceQuery = queryQboTable<QboInvoiceLike>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    table: "Invoice",
    customerId: input.customerId,
    sinceIso: input.sinceIso,
    txnDateFrom: input.txnDateFrom,
  });
  const salesReceiptQuery = input.skipSalesReceipts
    ? Promise.resolve([] as QboInvoiceLike[])
    : queryQboTable<QboInvoiceLike>({
        accessToken: input.accessToken,
        realmId: input.realmId,
        table: "SalesReceipt",
        customerId: input.customerId,
        sinceIso: input.sinceIso,
        txnDateFrom: input.txnDateFrom,
      });
  const creditMemoQuery = queryQboTable<QboInvoiceLike>({
    accessToken: input.accessToken,
    realmId: input.realmId,
    table: "CreditMemo",
    customerId: input.customerId,
    sinceIso: input.sinceIso,
    txnDateFrom: input.txnDateFrom,
  });
  const [invoices, salesReceipts, creditMemos] = await Promise.all([invoiceQuery, salesReceiptQuery, creditMemoQuery]);

  // When filtering by TxnDate (SQL-level), no in-memory post-filter needed.
  // When filtering by sinceIso (MetaData), apply in-memory secondary filter.
  if (input.txnDateFrom) {
    return { invoices, salesReceipts, creditMemos };
  }

  const sinceEpoch = input.sinceIso ? Date.parse(input.sinceIso) : Number.NaN;
  const filterBySince = (rows: QboInvoiceLike[]) => {
    if (!Number.isFinite(sinceEpoch)) {
      return rows;
    }
    return rows.filter((row) => {
      const updatedAt = row.MetaData?.LastUpdatedTime;
      if (!updatedAt) return false;
      const updatedEpoch = Date.parse(updatedAt);
      return Number.isFinite(updatedEpoch) && updatedEpoch >= sinceEpoch;
    });
  };

  return {
    invoices: filterBySince(invoices),
    salesReceipts: filterBySince(salesReceipts),
    creditMemos: filterBySince(creditMemos),
  };
}

export async function fetchQboRawTransaction(input: {
  accessToken: string;
  realmId: string;
  invoiceId: string;
}): Promise<{ type: string; data: unknown } | null> {
  const types = ["Invoice", "SalesReceipt", "CreditMemo"] as const;
  for (const type of types) {
    const query = `select * from ${type} where Id = '${input.invoiceId}'`;
    const response = await fetch(
      `${QBO_API_BASE_URL}/v3/company/${input.realmId}/query?minorversion=75`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/text",
        },
        body: query,
        cache: "no-store",
      },
    );
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const qr = (payload.QueryResponse ?? payload.queryResponse) as Record<string, unknown> | undefined;
    const items = (qr?.[type] ?? []) as unknown[];
    if (items.length > 0) {
      return { type, data: items[0] };
    }
  }
  return null;
}

export async function fetchQboCrudoTransaction(input: {
  accessToken: string;
  realmId: string;
  invoiceId: string;
}): Promise<{
  foundType: string | null;
  invoiceId: string;
  attempts: Array<{
    type: string;
    query: string;
    url: string;
    status: number;
    ok: boolean;
    headers: Record<string, string>;
    response: unknown;
    matchedCount: number;
  }>;
}> {
  const types = ["Invoice", "SalesReceipt", "CreditMemo"] as const;
  const attempts: Array<{
    type: string;
    query: string;
    url: string;
    status: number;
    ok: boolean;
    headers: Record<string, string>;
    response: unknown;
    matchedCount: number;
  }> = [];
  let foundType: string | null = null;

  for (const type of types) {
    const query = `select * from ${type} where Id = '${input.invoiceId}'`;
    const url = `${QBO_API_BASE_URL}/v3/company/${input.realmId}/query?minorversion=75`;
    const response = await fetch(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/text",
        },
        body: query,
        cache: "no-store",
      },
    );

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const qr = (payload.QueryResponse ?? payload.queryResponse) as Record<string, unknown> | undefined;
    const items = (qr?.[type] ?? []) as unknown[];

    const headerRecord: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headerRecord[key] = value;
    });

    attempts.push({
      type,
      query,
      url,
      status: response.status,
      ok: response.ok,
      headers: headerRecord,
      response: payload,
      matchedCount: items.length,
    });

    if (!foundType && items.length > 0) {
      foundType = type;
    }
  }

  return {
    foundType,
    invoiceId: input.invoiceId,
    attempts,
  };
}

export type QboCustomer = {
  id: string;
  displayName: string;
  acctNum?: string;
  raw?: Record<string, unknown>;
};

export async function fetchQboItemSkus(input: {
  accessToken: string;
  realmId: string;
}): Promise<Map<string, string>> {
  const baseUrl = QBO_API_BASE_URL;
  const skuMap = new Map<string, string>();
  const pageSize = 1000;
  let startPosition = 1;

  while (true) {
    const query = `select * from Item startposition ${startPosition} maxresults ${pageSize}`;
    const response = await fetch(
      `${baseUrl}/v3/company/${input.realmId}/query?minorversion=75`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/text",
        },
        body: query,
        cache: "no-store",
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      QueryResponse?: { Item?: Array<{ Id?: string; Sku?: string; Name?: string }> };
    };

    if (!response.ok) break;

    const batch = payload.QueryResponse?.Item ?? [];
    for (const item of batch) {
      if (item.Id) {
        const sku = item.Sku?.trim() ?? "";
        if (sku) skuMap.set(item.Id, sku);
      }
    }

    if (batch.length < pageSize) break;
    startPosition += pageSize;
  }

  return skuMap;
}

/**
 * Busca una factura o nota de crédito en QBO por su DocNumber.
 * Prueba Invoice primero; si no hay resultado, prueba CreditMemo.
 * Devuelve null si no existe en ninguna de las dos tablas.
 *
 * Las comillas simples en docNumber se escapan con '' (estándar SQL) para evitar
 * inyección en la QBO Query API.
 */
export async function fetchQboTransactionByDocNumber(input: {
  accessToken: string;
  realmId: string;
  docNumber: string;
}): Promise<{ type: "Invoice" | "CreditMemo"; data: QboInvoiceLike } | null> {
  const safeDocNumber = input.docNumber.replace(/'/g, "''");
  const types = ["Invoice", "CreditMemo"] as const;

  for (const type of types) {
    const query = `select * from ${type} where DocNumber = '${safeDocNumber}'`;
    const response = await fetch(
      `${QBO_API_BASE_URL}/v3/company/${input.realmId}/query?minorversion=75`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/text",
        },
        body: query,
        cache: "no-store",
      },
    );
    const payload = (await response.json().catch(() => ({}))) as QueryResponse<QboInvoiceLike> & {
      Fault?: { Error?: QboFaultError[] };
    };
    if (!response.ok) {
      const fault = payload.Fault?.Error?.[0];
      throw new Error(fault?.Detail ?? fault?.Message ?? `Error consultando ${type} por DocNumber en QBO`);
    }
    const qr = payload.QueryResponse ?? payload.queryResponse;
    const items = (type === "Invoice" ? qr?.Invoice : qr?.CreditMemo) ?? [];
    if (items.length > 0) {
      return { type, data: items[0] };
    }
  }
  return null;
}

export async function fetchQboCustomerById(input: {
  accessToken: string;
  realmId: string;
  customerId: string;
}): Promise<QboCustomer | null> {
  const baseUrl = QBO_API_BASE_URL;
  const response = await fetch(
    `${baseUrl}/v3/company/${input.realmId}/customer/${input.customerId}?minorversion=75&include=enhancedAllCustomFields`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { Customer?: Record<string, unknown> } | null;
  const c = payload?.Customer;
  if (!c || typeof c.Id !== "string" || typeof c.DisplayName !== "string") return null;

  // "Account Number" is stored as a CustomField, not in AcctNum
  let acctNum: string | undefined;
  const customFields = Array.isArray(c.CustomField) ? (c.CustomField as Array<Record<string, unknown>>) : [];
  const acctField = customFields.find((f) => typeof f.Name === "string" && f.Name.toLowerCase() === "account number");
  if (acctField && typeof acctField.StringValue === "string" && acctField.StringValue.trim()) {
    acctNum = acctField.StringValue.trim();
  } else if (typeof c.AcctNum === "string" && c.AcctNum.trim()) {
    acctNum = c.AcctNum.trim();
  }

  return { id: c.Id, displayName: c.DisplayName, acctNum, raw: c };
}

export async function fetchQboCustomers(input: {
  accessToken: string;
  realmId: string;
}): Promise<QboCustomer[]> {
  const baseUrl = QBO_API_BASE_URL;
  const pageSize = 1000;
  const output: QboCustomer[] = [];
  let startPosition = 1;

  type RawCustomer = { Id?: string; DisplayName?: string; AcctNum?: string; ParentRef?: { value?: string } };
  const raw: RawCustomer[] = [];

  while (true) {
    const query = `select Id, DisplayName, AcctNum, ParentRef from Customer where Active = true startposition ${startPosition} maxresults ${pageSize}`;
    const response = await fetch(
      `${baseUrl}/v3/company/${input.realmId}/query?minorversion=75`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/text",
        },
        body: query,
        cache: "no-store",
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      QueryResponse?: { Customer?: RawCustomer[] };
    };

    if (!response.ok) {
      throw new Error("Error consultando clientes en QBO");
    }

    const batch = payload.QueryResponse?.Customer ?? [];
    raw.push(...batch);
    if (batch.length < pageSize) break;
    startPosition += pageSize;
  }

  // Build AcctNum map — sub-customers inherit parent's AcctNum if they lack their own
  const acctNumById = new Map<string, string>();
  for (const c of raw) {
    if (c.Id && c.AcctNum?.trim()) acctNumById.set(c.Id, c.AcctNum.trim());
  }
  const resolveAcctNum = (c: RawCustomer): string | undefined => {
    if (c.AcctNum?.trim()) return c.AcctNum.trim();
    const parentId = c.ParentRef?.value;
    if (parentId) return acctNumById.get(parentId);
    return undefined;
  };

  for (const c of raw) {
    if (c.Id && c.DisplayName) {
      output.push({ id: c.Id, displayName: c.DisplayName, acctNum: resolveAcctNum(c), raw: c as Record<string, unknown> });
    }
  }

  return output;
}

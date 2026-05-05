const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_API_BASE_URL = "https://quickbooks.api.intuit.com";
const QBO_SANDBOX_API_BASE_URL = "https://sandbox-quickbooks.api.intuit.com";

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

async function queryQboTable<T>(input: {
  accessToken: string;
  realmId: string;
  table: "Invoice" | "SalesReceipt" | "CreditMemo";
  customerId?: string;
  sinceIso?: string;
  useSandbox?: boolean;
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
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const query = `select * from ${input.table}${where} startposition ${startPosition} maxresults ${pageSize}`;

    const primaryUrl = input.useSandbox ? QBO_SANDBOX_API_BASE_URL : QBO_API_BASE_URL;
    let { response, payload, fault } = await doRequest(primaryUrl, query);

    const code = String(fault?.code ?? "").trim();
    const message = (fault?.Detail ?? fault?.Message ?? fault?.detail ?? fault?.message ?? "").trim();

    // Tokens de entorno sandbox pueden responder 3100 contra endpoint de produccion.
    if (!input.useSandbox && !response.ok && code === "3100") {
      const fallback = await doRequest(QBO_SANDBOX_API_BASE_URL, query);
      response = fallback.response;
      payload = fallback.payload;
      fault = fallback.fault;
    }

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

export async function fetchQboSalesTransactions(input: {
  accessToken: string;
  realmId: string;
  customerId?: string;
  sinceIso?: string;
  useSandbox?: boolean;
}) {
  const [invoices, salesReceipts, creditMemos] = await Promise.all([
    queryQboTable<QboInvoiceLike>({
      accessToken: input.accessToken,
      realmId: input.realmId,
      table: "Invoice",
      customerId: input.customerId,
      sinceIso: input.sinceIso,
      useSandbox: input.useSandbox,
    }),
    queryQboTable<QboInvoiceLike>({
      accessToken: input.accessToken,
      realmId: input.realmId,
      table: "SalesReceipt",
      customerId: input.customerId,
      sinceIso: input.sinceIso,
      useSandbox: input.useSandbox,
    }),
    queryQboTable<QboInvoiceLike>({
      accessToken: input.accessToken,
      realmId: input.realmId,
      table: "CreditMemo",
      customerId: input.customerId,
      sinceIso: input.sinceIso,
      useSandbox: input.useSandbox,
    }),
  ]);

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

export type QboCustomer = {
  id: string;
  displayName: string;
};

export async function fetchQboCustomers(input: {
  accessToken: string;
  realmId: string;
  useSandbox?: boolean;
}): Promise<QboCustomer[]> {
  const baseUrl = input.useSandbox ? QBO_SANDBOX_API_BASE_URL : QBO_API_BASE_URL;
  const pageSize = 1000;
  const output: QboCustomer[] = [];
  let startPosition = 1;

  while (true) {
    const query = `select Id, DisplayName from Customer where Active = true startposition ${startPosition} maxresults ${pageSize}`;
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
      QueryResponse?: { Customer?: Array<{ Id?: string; DisplayName?: string }> };
    };

    if (!response.ok) {
      throw new Error("Error consultando clientes en QBO");
    }

    const batch = payload.QueryResponse?.Customer ?? [];
    for (const c of batch) {
      if (c.Id && c.DisplayName) {
        output.push({ id: c.Id, displayName: c.DisplayName });
      }
    }

    if (batch.length < pageSize) break;
    startPosition += pageSize;
  }

  return output;
}

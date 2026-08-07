export const LEDGER_PLAN_SCOPES = ["integration", "platform", "cross"] as const;
export const LEDGER_WORK_TYPES = ["new", "fix", "security", "legal", "docs", "review"] as const;
export const LEDGER_BILLING_STATUSES = ["unpriced", "to_invoice", "previously_invoiced", "included"] as const;

export type LedgerPlanScope = (typeof LEDGER_PLAN_SCOPES)[number];
export type LedgerWorkType = (typeof LEDGER_WORK_TYPES)[number];
export type LedgerBillingStatus = (typeof LEDGER_BILLING_STATUSES)[number];

export type DevelopmentLedgerItem = {
  id: string;
  stableKey: string | null;
  occurredOn: string;
  planScope: LedgerPlanScope;
  workType: LedgerWorkType;
  sectionCode: string;
  sectionTitle: string;
  title: string;
  rationale: string | null;
  technicalDetail: string | null;
  billingStatus: LedgerBillingStatus;
  amountCents: number | null;
  priorInvoiceLabel: string | null;
  sortOrder: number;
};

export type DevelopmentLedgerReport = {
  id: string;
  title: string;
  dateFrom: string;
  dateTo: string;
  itemCount: number;
  totalCents: number;
  currency: string;
  contentSha256: string;
  generatedAt: string;
};

export type DevelopmentLedgerSnapshot = {
  version: 1;
  title: string;
  dateFrom: string;
  dateTo: string;
  currency: "USD";
  generatedAt: string;
  items: DevelopmentLedgerItem[];
};

export const PLAN_LABELS: Record<LedgerPlanScope, string> = {
  integration: "Plan de Integración",
  platform: "Plan de Plataforma",
  cross: "Transversal",
};

export const WORK_TYPE_LABELS: Record<LedgerWorkType, string> = {
  new: "Nuevo",
  fix: "Corrección",
  security: "Seguridad",
  legal: "Legal",
  docs: "Docs",
  review: "Review",
};

export const BILLING_STATUS_LABELS: Record<LedgerBillingStatus, string> = {
  unpriced: "Sin precio",
  to_invoice: "Por facturar",
  previously_invoiced: "Facturado anteriormente",
  included: "Incluido",
};

export function databaseRowToLedgerItem(row: Record<string, unknown>): DevelopmentLedgerItem {
  return {
    id: String(row.id),
    stableKey: typeof row.stable_key === "string" ? row.stable_key : null,
    occurredOn: String(row.occurred_on),
    planScope: row.plan_scope as LedgerPlanScope,
    workType: row.work_type as LedgerWorkType,
    sectionCode: String(row.section_code),
    sectionTitle: String(row.section_title),
    title: String(row.title),
    rationale: typeof row.rationale === "string" ? row.rationale : null,
    technicalDetail: typeof row.technical_detail === "string" ? row.technical_detail : null,
    billingStatus: row.billing_status as LedgerBillingStatus,
    amountCents: typeof row.amount_cents === "number" ? row.amount_cents : null,
    priorInvoiceLabel: typeof row.prior_invoice_label === "string" ? row.prior_invoice_label : null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

import { THEMES, THEME_DARK_PRO, THEME_DEFAULT } from "@/shared/ui/company-shell.config";

// ── Cache ─────────────────────────────────────────────────────────────────────

export type CatalogCacheName = "announcements" | "checklists" | "documents" | "employees" | "users";

const COMPANY_SHELL_CATALOG_CACHE_VERSION = 1;
const COMPANY_SHELL_CATALOG_CACHE_PREFIX = "gb.company-shell.catalog";

export function getCatalogCacheKey(tenantId: string, sessionUserEmail: string, catalogName: CatalogCacheName) {
  return `${COMPANY_SHELL_CATALOG_CACHE_PREFIX}:v${COMPANY_SHELL_CATALOG_CACHE_VERSION}:${tenantId}:${sessionUserEmail.toLowerCase()}:${catalogName}`;
}

// ── Navigation ────────────────────────────────────────────────────────────────

export function isActive(pathname: string, searchParams: URLSearchParams, href: string) {
  const cleanHref = href.split("?")[0];
  if (!(pathname === cleanHref || pathname.startsWith(`${cleanHref}/`))) {
    return false;
  }

  const query = href.split("?")[1];
  if (!query) {
    return true;
  }

  const expected = new URLSearchParams(query);
  for (const [key, value] of expected.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

export function normalizeTheme(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "dark" || normalized === THEME_DARK_PRO) return THEME_DARK_PRO;
  if (THEMES.includes(normalized as (typeof THEMES)[number])) return normalized;
  return THEME_DEFAULT;
}

export const THEME_PICKER_ORDER = [
  THEME_DEFAULT,
  THEME_DARK_PRO,
  ...THEMES.filter((theme) => theme !== THEME_DEFAULT && theme !== THEME_DARK_PRO),
];

// ── Module labels ─────────────────────────────────────────────────────────────

export const MODULE_LABELS: Record<string, string> = {
  announcements: "Avisos",
  checklists: "Checklists",
  documents: "Documentos",
  employees: "Usuarios y Empleados",
  reports: "Reportes",
  settings: "Ajustes",
  ai_assistant: "Asistente IA",
  dashboard: "Dashboard",
  company_portal: "Portal Empresa",
  vendors: "Proveedores",
  qbo_r365: "Integración QuickBooks",
};

// ── Billing / Plans ───────────────────────────────────────────────────────────

export type BillingCycle = "monthly" | "yearly";

export type PlanForBilling = {
  priceAmount: number | null;
  billingPeriod: string | null;
};

export function normalizePlanPeriod(value: string | null | undefined): BillingCycle {
  return value === "yearly" || value === "annual" ? "yearly" : "monthly";
}

export function getPlanAmountByCycle(plan: PlanForBilling, cycle: BillingCycle): number | null {
  if (typeof plan.priceAmount !== "number") return null;
  const sourcePeriod = normalizePlanPeriod(plan.billingPeriod);
  if (sourcePeriod === cycle) return plan.priceAmount;
  if (cycle === "yearly") return plan.priceAmount * 10;
  return Math.round((plan.priceAmount / 10) * 100) / 100;
}

export function formatPlanPrice(plan: PlanForBilling, cycle?: BillingCycle): string {
  const selectedCycle = cycle ?? normalizePlanPeriod(plan.billingPeriod);
  const amount = getPlanAmountByCycle(plan, selectedCycle);
  if (typeof amount !== "number") return "Precio no definido";
  const period = selectedCycle === "yearly" ? "ano" : "mes";
  return `$${amount}/${period}`;
}

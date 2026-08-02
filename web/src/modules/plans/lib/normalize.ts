/**
 * Como se leen los datos de un plan antes de guardarlos.
 *
 * Viven aparte de actions.ts porque ese archivo es "use server" y solo puede
 * exportar funciones async: siendo puras no se podian probar desde ahi. Aca si,
 * y es donde conviene -- parsePriceAmount decide un precio, y equivocarse con
 * una coma o con un negativo se cobra mal.
 */

/** Un codigo de plan: minusculas, sin acentos ni simbolos, hasta 40. */
export function normalizePlanCode(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Tres letras en mayuscula, como USD. */
export function normalizeCurrencyCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

/**
 * Un importe con dos decimales, o null si no es un numero valido.
 * Acepta coma como separador decimal.
 */
export function parsePriceAmount(input: FormDataEntryValue | null) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Number(value.toFixed(2));
}

export function normalizeBillingPeriod(input: string) {
  const value = input.trim().toLowerCase();
  if (["monthly", "yearly", "one_time", "custom"].includes(value)) {
    return value;
  }
  return "monthly";
}

export function toNullableInt(input: FormDataEntryValue | null) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

export function normalizePlanType(input: string) {
  const value = input.trim().toLowerCase();
  if (["platform", "qbo_r365"].includes(value)) return value;
  return "platform";
}

export function parseFeatures(input: FormDataEntryValue | null): unknown | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Traduce el error crudo de la base a algo accionable. */
export function toFriendlyPlanErrorMessage(raw: string) {
  const text = raw.toLowerCase();

  if (text.includes("could not find the table 'public.plans'")) {
    return "Your database does not have the plans table yet. Run the 20260311_0001_base_saas.sql and 202603110002_plan_pricing.sql migrations first in the Supabase SQL Editor.";
  }

  if (text.includes("price_amount") || text.includes("currency_code") || text.includes("billing_period")) {
    return "The plan pricing migration (202603110002_plan_pricing.sql) has not been applied.";
  }

  return raw;
}

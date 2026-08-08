"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireAuthenticatedUser, requireSuperadmin } from "@/shared/lib/access";
import type { Json } from "@/shared/types/database.types";

const PUBLISHER_EMAIL = "fer@soliz.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRICE_KEY_RE = /^[a-z][a-z0-9-]{0,30}-(?:\d{1,4}|total)$/;
type PriceState = Record<string, string>;
type ActionResult = { ok: true } | { ok: false; error: string };

async function requirePublisher() {
  const user = await requireAuthenticatedUser();
  await requireSuperadmin();
  return user.email?.trim().toLowerCase() === PUBLISHER_EMAIL ? user : null;
}

function normalizePrices(input: unknown): PriceState | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const entries = Object.entries(input);
  if (entries.length > 500) return null;
  const normalized: PriceState = {};
  for (const [key, rawValue] of entries) {
    const value = String(rawValue).trim();
    const amount = Number(value);
    if (!PRICE_KEY_RE.test(key) || !/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return null;
    normalized[key] = value;
  }
  return normalized;
}

function totalCents(prices: PriceState) {
  return Math.round(Object.values(prices).reduce((total, value) => total + Number(value), 0) * 100);
}

export async function saveDevelopmentReportPricesAction(reportId: string, input: unknown): Promise<ActionResult> {
  const user = await requirePublisher();
  const prices = normalizePrices(input);
  if (!user) return { ok: false, error: "Sólo fer@soliz.com puede editar este borrador" };
  if (!UUID_RE.test(reportId) || !prices) return { ok: false, error: "Precios inválidos" };

  const { data, error } = await createSupabaseAdminClient()
    .from("development_ledger_reports")
    .update({ price_state: prices as Json, total_cents: totalCents(prices), updated_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("publication_status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "El borrador ya fue publicado o no existe" };
  return { ok: true };
}

export async function publishDevelopmentReportAction(reportId: string, input: unknown): Promise<ActionResult> {
  const user = await requirePublisher();
  const prices = normalizePrices(input);
  if (!user) return { ok: false, error: "Sólo fer@soliz.com puede publicar este período" };
  if (!UUID_RE.test(reportId) || !prices) return { ok: false, error: "Precios inválidos" };

  const now = new Date().toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from("development_ledger_reports")
    .update({
      price_state: prices as Json,
      total_cents: totalCents(prices),
      publication_status: "published",
      published_at: now,
      published_by: user.id,
      updated_at: now,
    })
    .eq("id", reportId)
    .eq("publication_status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "El período ya fue publicado o no existe" };
  revalidatePath("/superadmin/development-log");
  return { ok: true };
}

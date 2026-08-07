"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { calculateLedgerTotal, createLedgerSnapshot, renderDevelopmentLedgerReport } from "@/modules/superadmin/development-ledger/report";
import {
  databaseRowToLedgerItem,
  LEDGER_BILLING_STATUSES,
  LEDGER_PLAN_SCOPES,
  LEDGER_WORK_TYPES,
} from "@/modules/superadmin/development-ledger/types";
import type { Json } from "@/shared/types/database.types";
import { requireAuthenticatedUser, requireSuperadmin } from "@/shared/lib/access";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type ActionResult = { ok: true; reportId?: string } | { ok: false; error: string };

function refreshLedger() {
  revalidatePath("/superadmin/development-log");
}

export async function updateLedgerBillingAction(input: {
  id: string;
  billingStatus: string;
  amountCents: number | null;
}): Promise<ActionResult> {
  const user = await requireAuthenticatedUser();
  await requireSuperadmin();
  if (
    !UUID_RE.test(input.id)
    || !LEDGER_BILLING_STATUSES.includes(input.billingStatus as (typeof LEDGER_BILLING_STATUSES)[number])
    || (input.amountCents !== null && (!Number.isInteger(input.amountCents) || input.amountCents < 0 || input.amountCents > 100_000_000))
  ) return { ok: false, error: "Datos de facturación inválidos" };

  const amountCents = input.billingStatus === "to_invoice" ? input.amountCents : null;
  const { data, error } = await createSupabaseAdminClient()
    .from("development_ledger_items")
    .update({ billing_status: input.billingStatus, amount_cents: amountCents, updated_by: user.id })
    .eq("id", input.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "No se pudo actualizar la entrega" };
  refreshLedger();
  return { ok: true };
}

export async function createLedgerItemAction(input: {
  occurredOn: string;
  planScope: string;
  workType: string;
  sectionCode: string;
  sectionTitle: string;
  title: string;
  rationale: string;
  technicalDetail: string;
}): Promise<ActionResult> {
  const user = await requireAuthenticatedUser();
  await requireSuperadmin();
  const title = input.title.trim();
  const sectionTitle = input.sectionTitle.trim();
  const sectionCode = input.sectionCode.trim().toLowerCase();
  if (
    !DATE_RE.test(input.occurredOn)
    || !LEDGER_PLAN_SCOPES.includes(input.planScope as (typeof LEDGER_PLAN_SCOPES)[number])
    || !LEDGER_WORK_TYPES.includes(input.workType as (typeof LEDGER_WORK_TYPES)[number])
    || !/^[a-z][a-z0-9-]{0,29}$/.test(sectionCode)
    || !title || title.length > 1_000 || !sectionTitle || sectionTitle.length > 300
    || input.rationale.length > 5_000 || input.technicalDetail.length > 5_000
  ) return { ok: false, error: "Completa los campos obligatorios con valores válidos" };

  const admin = createSupabaseAdminClient();
  const { data: lastItem } = await admin
    .from("development_ledger_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from("development_ledger_items").insert({
    occurred_on: input.occurredOn,
    plan_scope: input.planScope,
    work_type: input.workType,
    section_code: sectionCode,
    section_title: sectionTitle,
    title,
    rationale: input.rationale.trim() || null,
    technical_detail: input.technicalDetail.trim() || null,
    sort_order: (lastItem?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return { ok: false, error: "No se pudo registrar la entrega" };
  refreshLedger();
  return { ok: true };
}

export async function generateLedgerReportAction(input: {
  title: string;
  dateFrom: string;
  dateTo: string;
}): Promise<ActionResult> {
  const user = await requireAuthenticatedUser();
  await requireSuperadmin();
  const title = input.title.trim();
  if (!title || title.length > 200 || !DATE_RE.test(input.dateFrom) || !DATE_RE.test(input.dateTo) || input.dateTo < input.dateFrom) {
    return { ok: false, error: "Período o título inválido" };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("development_ledger_items")
    .select("*")
    .is("archived_at", null)
    .gte("occurred_on", input.dateFrom)
    .lte("occurred_on", input.dateTo)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) return { ok: false, error: "No se pudieron cargar las entregas" };
  const items = (data ?? []).map((row) => databaseRowToLedgerItem(row));
  if (items.length === 0) return { ok: false, error: "No hay entregas en ese período" };

  const generatedAt = new Date().toISOString();
  const snapshot = createLedgerSnapshot({ title, dateFrom: input.dateFrom, dateTo: input.dateTo, generatedAt, items });
  const htmlDocument = renderDevelopmentLedgerReport(snapshot);
  const contentSha256 = createHash("sha256").update(htmlDocument, "utf8").digest("hex");
  const { data: report, error: insertError } = await admin.from("development_ledger_reports").insert({
    title,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    item_count: items.filter((item) => !item.stableKey?.endsWith("-total")).length,
    total_cents: calculateLedgerTotal(items),
    currency: "USD",
    snapshot: snapshot as unknown as Json,
    html_document: htmlDocument,
    content_sha256: contentSha256,
    generated_by: user.id,
  }).select("id").single();
  if (insertError || !report) return { ok: false, error: "No se pudo cerrar el informe" };
  refreshLedger();
  return { ok: true, reportId: report.id };
}

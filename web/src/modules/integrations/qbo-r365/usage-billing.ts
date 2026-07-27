import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { stripe } from "@/infrastructure/stripe/client";
import { calculateDocumentAllowance, calculateDocumentOverage } from "./usage-billing-rules";

export function formatInvoiceUsageDescription(sentCount: number, allowance: number, billableCount: number, unitPrice: string) {
  return `Documents sent to R365 (${sentCount} sent, ${allowance} included, ${billableCount} × $${unitPrice})`;
}

export function buildInvoiceUsageIdempotencyKey(organizationId: string, periodStart: Date, periodEnd: Date) {
  return `qbo-r365-usage:${organizationId}:${periodStart.getTime()}:${periodEnd.getTime()}`;
}

/**
 * Suma un cargo por el EXCEDENTE de facturas enviadas a R365 sobre lo que el
 * plan ya incluye, durante el periodo que termina -- como un "pending
 * invoice item" sobre la suscripcion de integracion. Stripe lo absorbe
 * automaticamente en la factura de renovacion que esta a punto de generar
 * (disparado desde invoice.upcoming).
 *
 * El "incluido" del periodo es plan.invoices_included + organization_addons.invoice_balance,
 * salvo que la organizacion tenga invoice_allowance_override seteado (caso
 * especial, ej. un cliente sin setup fee pagado al que se le cobra todo) --
 * en ese caso el override reemplaza por completo ese calculo.
 *
 * Solo actua si la organizacion tiene `price_per_invoice_cents` configurado
 * desde superadmin. Es idempotente via `last_usage_billed_through`: si ya
 * se facturo este periodo, no hace nada.
 */
export async function billInvoiceUsageForRenewal(params: {
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  const { organizationId, stripeCustomerId, stripeSubscriptionId, periodStart, periodEnd } = params;
  const supabase = createSupabaseAdminClient();

  const { data: moduleRow, error: moduleError } = await supabase
    .from("module_catalog")
    .select("id")
    .eq("code", "qbo_r365")
    .maybeSingle();
  if (moduleError) throw new Error(`Unable to load QBO-R365 module: ${moduleError.message}`);
  if (!moduleRow) return;

  const { data: addon, error: addonError } = await supabase
    .from("organization_addons")
    .select("price_per_invoice_cents, last_usage_billed_through, invoice_balance, invoice_allowance_override, integration_plan_id")
    .eq("organization_id", organizationId)
    .eq("module_id", moduleRow.id)
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (addonError) throw new Error(`Unable to load QBO-R365 addon: ${addonError.message}`);

  const priceCents = addon?.price_per_invoice_cents ?? null;
  if (!priceCents || priceCents <= 0) return;

  const lastBilledThrough = addon?.last_usage_billed_through ? new Date(addon.last_usage_billed_through) : null;
  if (lastBilledThrough && lastBilledThrough >= periodEnd) {
    console.info(`[usage-billing] org ${organizationId} already billed through ${lastBilledThrough.toISOString()}, skipping`);
    return;
  }

  let planInvoices = 0;
  if (addon?.invoice_allowance_override == null) {
    const { data: plan, error: planError } = addon?.integration_plan_id
      ? await supabase.from("plans").select("invoices_included").eq("id", addon.integration_plan_id).maybeSingle()
      : { data: null, error: null };
    if (planError) throw new Error(`Unable to load integration plan allowance: ${planError.message}`);
    planInvoices = plan?.invoices_included ?? 0;
  }
  const allowance = calculateDocumentAllowance({
    baseAllowance: planInvoices,
    invoiceBalance: addon?.invoice_balance ?? 0,
    allowanceOverride: addon?.invoice_allowance_override,
  });

  const { count, error: countError } = await supabase
    .from("qbo_unified_invoices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("first_sent_at", periodStart.toISOString())
    .lt("first_sent_at", periodEnd.toISOString());
  if (countError) throw new Error(`Unable to count delivered documents: ${countError.message}`);

  const sentCount = count ?? 0;
  const billableCount = calculateDocumentOverage(sentCount, allowance);
  const amountCents = billableCount * priceCents;
  const unitPrice = (priceCents / 100).toFixed(2);

  if (amountCents > 0) {
    await stripe.invoiceItems.create({
      customer: stripeCustomerId,
      subscription: stripeSubscriptionId,
      currency: "usd",
      amount: amountCents,
      description: formatInvoiceUsageDescription(sentCount, allowance, billableCount, unitPrice),
    }, {
      idempotencyKey: buildInvoiceUsageIdempotencyKey(organizationId, periodStart, periodEnd),
    });
  }

  const { error: markerError } = await supabase
    .from("organization_addons")
    .update({ last_usage_billed_through: periodEnd.toISOString() })
    .eq("organization_id", organizationId)
    .eq("module_id", moduleRow.id);
  if (markerError) throw new Error(`Unable to advance usage billing marker: ${markerError.message}`);

  console.info(`[usage-billing] org ${organizationId}: ${sentCount} sent, ${allowance} included, billed ${billableCount} × $${unitPrice} = $${(amountCents / 100).toFixed(2)}`);
}

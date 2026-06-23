import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { stripe } from "@/infrastructure/stripe/client";

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

  const { data: moduleRow } = await supabase
    .from("module_catalog")
    .select("id")
    .eq("code", "qbo_r365")
    .maybeSingle();
  if (!moduleRow) return;

  const { data: addon } = await supabase
    .from("organization_addons")
    .select("price_per_invoice_cents, last_usage_billed_through, invoice_balance, invoice_allowance_override, integration_plan_id")
    .eq("organization_id", organizationId)
    .eq("module_id", moduleRow.id)
    .maybeSingle();

  const priceCents = addon?.price_per_invoice_cents ?? null;
  if (!priceCents || priceCents <= 0) return;

  const lastBilledThrough = addon?.last_usage_billed_through ? new Date(addon.last_usage_billed_through) : null;
  if (lastBilledThrough && lastBilledThrough >= periodEnd) {
    console.info(`[usage-billing] org ${organizationId} already billed through ${lastBilledThrough.toISOString()}, skipping`);
    return;
  }

  let allowance: number;
  if (addon?.invoice_allowance_override != null) {
    allowance = addon.invoice_allowance_override;
  } else {
    const { data: plan } = addon?.integration_plan_id
      ? await supabase.from("plans").select("invoices_included").eq("id", addon.integration_plan_id).maybeSingle()
      : { data: null };
    const planInvoices = plan?.invoices_included ?? 0;
    const extraBalance = addon?.invoice_balance ?? 0;
    allowance = planInvoices + extraBalance;
  }

  const { count } = await supabase
    .from("qbo_unified_invoices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("first_sent_at", periodStart.toISOString())
    .lt("first_sent_at", periodEnd.toISOString());

  const sentCount = count ?? 0;
  const billableCount = Math.max(0, sentCount - allowance);
  const amountCents = billableCount * priceCents;
  const unitPrice = (priceCents / 100).toFixed(2);

  await stripe.invoiceItems.create({
    customer: stripeCustomerId,
    subscription: stripeSubscriptionId,
    currency: "usd",
    amount: amountCents,
    description: `Facturas enviadas a R365 (${sentCount} enviadas, ${allowance} incluidas, ${billableCount} × $${unitPrice})`,
  });

  await supabase
    .from("organization_addons")
    .update({ last_usage_billed_through: periodEnd.toISOString() })
    .eq("organization_id", organizationId)
    .eq("module_id", moduleRow.id);

  console.info(`[usage-billing] org ${organizationId}: ${sentCount} enviadas, ${allowance} incluidas, billed ${billableCount} × $${unitPrice} = $${(amountCents / 100).toFixed(2)}`);
}

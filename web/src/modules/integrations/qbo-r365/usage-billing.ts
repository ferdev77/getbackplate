import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { stripe } from "@/infrastructure/stripe/client";

/**
 * Suma un cargo por las facturas enviadas a R365 durante el periodo que
 * termina, como un "pending invoice item" sobre la suscripcion de
 * integracion -- Stripe lo absorbe automaticamente en la factura de
 * renovacion que esta a punto de generar (disparado desde invoice.upcoming).
 *
 * Solo actua si la organizacion tiene `price_per_invoice_cents` configurado
 * desde superadmin. Es idempotente via `last_usage_billed_through`: si ya
 * se factuo este periodo, no hace nada.
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
    .select("price_per_invoice_cents, last_usage_billed_through")
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

  const { count } = await supabase
    .from("qbo_unified_invoices")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("first_sent_at", periodStart.toISOString())
    .lt("first_sent_at", periodEnd.toISOString());

  const invoiceCount = count ?? 0;
  const amountCents = invoiceCount * priceCents;
  const unitPrice = (priceCents / 100).toFixed(2);

  await stripe.invoiceItems.create({
    customer: stripeCustomerId,
    subscription: stripeSubscriptionId,
    currency: "usd",
    amount: amountCents,
    description: `Facturas enviadas a R365 (${invoiceCount} × $${unitPrice})`,
  });

  await supabase
    .from("organization_addons")
    .update({ last_usage_billed_through: periodEnd.toISOString() })
    .eq("organization_id", organizationId)
    .eq("module_id", moduleRow.id);

  console.info(`[usage-billing] org ${organizationId}: billed ${invoiceCount} invoices × $${unitPrice} = $${(amountCents / 100).toFixed(2)}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { stripe } from "@/infrastructure/stripe/client";
import { requireSuperadmin } from "@/shared/lib/access";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { paymentLinkEmailTemplate, subscriptionLinkEmailTemplate } from "@/shared/lib/email-templates/payment-links";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function cancelManualPaymentOrderAction(formData: FormData) {
  await requireSuperadmin();

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "ID de orden inválido" };

  const supabase = createSupabaseAdminClient();

  const { data: order } = await supabase
    .from("manual_payment_orders")
    .select("id, status, stripe_session_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.status !== "pending") {
    revalidatePath("/superadmin/payment-links");
    return { ok: true };
  }

  if (order.stripe_session_id) {
    try {
      await stripe.checkout.sessions.expire(order.stripe_session_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canIgnore = message.includes("already expired") || message.includes("already completed");
      if (!canIgnore) {
        return { ok: false, error: "No se pudo expirar la sesión de Stripe" };
      }
    }
  }

  const { error } = await supabase
    .from("manual_payment_orders")
    .update({ status: "canceled" })
    .eq("id", orderId)
    .eq("status", "pending");

  if (error) return { ok: false, error: "No se pudo cancelar la orden" };

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}

export async function deleteManualPaymentOrderAction(formData: FormData) {
  await requireSuperadmin();

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "ID de orden inválido" };

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("manual_payment_orders")
    .delete()
    .eq("id", orderId)
    .neq("status", "paid"); // never delete paid orders

  if (error) return { ok: false, error: "No se pudo eliminar la orden" };

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}

export async function cancelManualSubscriptionOrderAction(formData: FormData) {
  await requireSuperadmin();

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "ID de orden inválido" };

  const supabase = createSupabaseAdminClient();

  const { data: order } = await supabase
    .from("manual_subscription_orders")
    .select("id, status, stripe_session_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.status !== "pending") {
    revalidatePath("/superadmin/payment-links");
    return { ok: true };
  }

  if (order.stripe_session_id) {
    try {
      await stripe.checkout.sessions.expire(order.stripe_session_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canIgnore = message.includes("already expired") || message.includes("already completed");
      if (!canIgnore) {
        return { ok: false, error: "No se pudo expirar la sesión de Stripe" };
      }
    }
  }

  const { error } = await supabase
    .from("manual_subscription_orders")
    .update({ status: "canceled" })
    .eq("id", orderId)
    .eq("status", "pending");

  if (error) return { ok: false, error: "No se pudo cancelar la orden" };

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}

export async function deleteManualSubscriptionOrderAction(formData: FormData) {
  await requireSuperadmin();

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "ID de orden inválido" };

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from("manual_subscription_orders")
    .delete()
    .eq("id", orderId)
    .not("status", "in", "(completed,upgraded)"); // never delete completed or upgraded orders

  if (error) return { ok: false, error: "No se pudo eliminar la orden" };

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}

export async function updateInvoicePriceAction(formData: FormData) {
  await requireSuperadmin();

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) return { ok: false, error: "Organización inválida" };

  const rawPrice = String(formData.get("price_cents") ?? "").trim();
  const priceCents = rawPrice === "" ? null : Number(rawPrice);
  if (priceCents !== null && (!Number.isInteger(priceCents) || priceCents < 0)) {
    return { ok: false, error: "Precio inválido" };
  }

  const supabase = createSupabaseAdminClient();

  const { data: moduleRow } = await supabase
    .from("module_catalog")
    .select("id")
    .eq("code", "qbo_r365")
    .maybeSingle();
  if (!moduleRow) return { ok: false, error: "Módulo qbo_r365 no encontrado" };

  const { error } = await supabase
    .from("organization_addons")
    .update({ price_per_invoice_cents: priceCents })
    .eq("organization_id", organizationId)
    .eq("module_id", moduleRow.id);

  if (error) return { ok: false, error: "No se pudo actualizar el precio" };

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}

export async function updateInvoiceAllowanceOverrideAction(formData: FormData) {
  await requireSuperadmin();

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) return { ok: false, error: "Organización inválida" };

  const raw = String(formData.get("allowance_override") ?? "").trim();
  const allowanceOverride = raw === "" ? null : Number(raw);
  if (allowanceOverride !== null && (!Number.isInteger(allowanceOverride) || allowanceOverride < 0)) {
    return { ok: false, error: "Valor inválido" };
  }

  const supabase = createSupabaseAdminClient();

  const { data: moduleRow } = await supabase
    .from("module_catalog")
    .select("id")
    .eq("code", "qbo_r365")
    .maybeSingle();
  if (!moduleRow) return { ok: false, error: "Módulo qbo_r365 no encontrado" };

  const { error } = await supabase
    .from("organization_addons")
    .update({ invoice_allowance_override: allowanceOverride })
    .eq("organization_id", organizationId)
    .eq("module_id", moduleRow.id);

  if (error) return { ok: false, error: "No se pudo actualizar las facturas incluidas" };

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}

async function resolvePriceAmountForPeriod(basePriceId: string, billingPeriod: string): Promise<number | null> {
  const basePrice = await stripe.prices.retrieve(basePriceId);
  if (!basePrice.recurring) return basePrice.unit_amount ?? null;

  const targetInterval = billingPeriod === "yearly" ? "year" : "month";
  if (basePrice.recurring.interval === targetInterval) return basePrice.unit_amount ?? null;

  const productId = typeof basePrice.product === "string" ? basePrice.product : (basePrice.product as { id: string } | null)?.id;
  if (!productId) return basePrice.unit_amount ?? null;

  const { data: prices } = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const match = prices.find((p) => p.recurring?.interval === targetInterval && p.currency === basePrice.currency);
  return match?.unit_amount ?? basePrice.unit_amount ?? null;
}

function fmtAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(cents / 100);
}

export async function sendPaymentLinkEmailAction(formData: FormData) {
  await requireSuperadmin();

  const orderId = String(formData.get("order_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!orderId) return { ok: false, error: "ID de orden inválido" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Email inválido" };

  const supabase = createSupabaseAdminClient();

  const { data: order } = await supabase
    .from("manual_payment_orders")
    .select("description, amount_cents, currency, checkout_url, status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || !order.checkout_url || order.status !== "pending") {
    return { ok: false, error: "Este link ya no está disponible para enviar" };
  }

  const html = paymentLinkEmailTemplate({
    description: order.description,
    amountFormatted: fmtAmount(order.amount_cents, order.currency),
    checkoutUrl: order.checkout_url,
  });

  const result = await sendTransactionalEmail({
    to: email,
    subject: "Your GetBackplate payment request is ready",
    html,
  });

  if (!result.ok) return { ok: false, error: result.error };

  await supabase
    .from("manual_payment_orders")
    .update({ email_sent_to: email, email_sent_at: new Date().toISOString() })
    .eq("id", orderId);

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}

export async function sendSubscriptionLinkEmailAction(formData: FormData) {
  await requireSuperadmin();

  const orderId = String(formData.get("order_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!orderId) return { ok: false, error: "ID de orden inválido" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Email inválido" };

  const supabase = createSupabaseAdminClient();

  const { data: order } = await supabase
    .from("manual_subscription_orders")
    .select("organization_id, plan_kind, plan_id, billing_period, checkout_url, status, extra_charge_cents, extra_charge_description")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || !order.checkout_url || order.status !== "pending") {
    return { ok: false, error: "Este link ya no está disponible para enviar" };
  }

  const { data: plan } = await supabase.from("plans").select("name, stripe_price_id").eq("id", order.plan_id).maybeSingle();

  let usageBillingNote: string | null = null;
  if (order.plan_kind === "integration" && order.organization_id) {
    const { data: moduleRow } = await supabase.from("module_catalog").select("id").eq("code", "qbo_r365").maybeSingle();
    const { data: addonPricing } = moduleRow
      ? await supabase
          .from("organization_addons")
          .select("price_per_invoice_cents")
          .eq("organization_id", order.organization_id)
          .eq("module_id", moduleRow.id)
          .maybeSingle()
      : { data: null };

    const perInvoiceCents = addonPricing?.price_per_invoice_cents ?? null;
    if (perInvoiceCents && perInvoiceCents > 0 && plan?.stripe_price_id) {
      try {
        const baseAmountCents = await resolvePriceAmountForPeriod(plan.stripe_price_id, order.billing_period);
        const baseAmount = ((baseAmountCents ?? 0) / 100).toFixed(2);
        const perInvoiceAmount = (perInvoiceCents / 100).toFixed(2);
        const periodLabel = order.billing_period === "yearly" ? "annual" : "monthly";
        usageBillingNote = `Your ${periodLabel} subscription is $${baseAmount} plus $${perInvoiceAmount} per document successfully delivered. Usage charges appear on the following month's invoice.`;
      } catch (err) {
        console.error("[sendSubscriptionLinkEmailAction] Error fetching base price for usage note:", err);
      }
    }
  }

  const html = subscriptionLinkEmailTemplate({
    planName: plan?.name ?? "Subscription Plan",
    billingPeriodLabel: order.billing_period === "yearly" ? "annually" : "monthly",
    checkoutUrl: order.checkout_url,
    extraCharge: order.extra_charge_cents
      ? { description: order.extra_charge_description ?? "Additional charge", amountFormatted: fmtAmount(order.extra_charge_cents, "usd") }
      : null,
    usageBillingNote,
  });

  const result = await sendTransactionalEmail({
    to: email,
    subject: "Activate your GetBackplate subscription",
    html,
  });

  if (!result.ok) return { ok: false, error: result.error };

  await supabase
    .from("manual_subscription_orders")
    .update({ email_sent_to: email, email_sent_at: new Date().toISOString() })
    .eq("id", orderId);

  revalidatePath("/superadmin/payment-links");
  return { ok: true };
}

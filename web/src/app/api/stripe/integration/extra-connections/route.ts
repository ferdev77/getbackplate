import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { stripe } from "@/infrastructure/stripe/client";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";

type ExtraPrice = { id: string; unit_amount: number | null; currency: string; recurring: { interval: string } | null; active: boolean };

type PendingUpdateWithInvoice = Stripe.Subscription.PendingUpdate & {
  invoice?: string | Stripe.Invoice | null;
};

function hasTargetExtraQuantity(subscription: Stripe.Subscription, extraPriceId: string, targetQuantity: number) {
  return subscription.items.data.find(
    (item) => item.price.id === extraPriceId && (item.quantity ?? 0) >= targetQuantity,
  ) ?? null;
}

async function loadExtraPrice() {
  const supabase = createSupabaseAdminClient();
  const { data: moduleRow } = await supabase
    .from("module_catalog")
    .select("id, extra_connection_stripe_price_id")
    .eq("code", "qbo_r365")
    .maybeSingle();
  const extraPriceId = moduleRow?.extra_connection_stripe_price_id ?? null;
  if (!moduleRow || !extraPriceId) return { supabase, moduleRow: null, price: null };

  const price = await stripe.prices.retrieve(extraPriceId) as ExtraPrice;
  if (!price.active || price.recurring?.interval !== "month" || price.unit_amount == null) {
    return { supabase, moduleRow, price: null };
  }
  return { supabase, moduleRow, price };
}

export async function GET() {
  const access = await assertCompanyAdminModuleApi("qbo_r365", { allowBillingBypass: true });
  if (!access.ok) return NextResponse.json({ error: "Access denied." }, { status: access.status });

  try {
    const { price } = await loadExtraPrice();
    if (!price) return NextResponse.json({ error: "Extra R365 connections are not currently available." }, { status: 400 });
    return NextResponse.json({ price: { amount: price.unit_amount, currency: price.currency, interval: "month" } });
  } catch {
    return NextResponse.json({ error: "Unable to load connection pricing. Please try again." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("qbo_r365", { allowBillingBypass: true });
  if (!access.ok) return NextResponse.json({ error: "Access denied." }, { status: access.status });

  let purchaseId: string | null = null;
  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null;
  let stripeMutationCompleted = false;
  try {
    const body = await request.json().catch(() => ({}));
    const count = Number(body?.count);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      return NextResponse.json({ error: "Choose between 1 and 20 connections." }, { status: 400 });
    }

    const loaded = await loadExtraPrice();
    supabase = loaded.supabase;
    if (!loaded.moduleRow || !loaded.price) {
      return NextResponse.json({ error: "Extra R365 connections are not currently available." }, { status: 400 });
    }

    const { data: addon } = await supabase
      .from("organization_addons")
      .select("stripe_subscription_id, status")
      .eq("organization_id", access.tenant.organizationId)
      .eq("module_id", loaded.moduleRow.id)
      .eq("status", "active")
      .maybeSingle();
    if (!addon?.stripe_subscription_id) {
      return NextResponse.json({ error: "An active R365 subscription is required before adding connections." }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.retrieve(addon.stripe_subscription_id);
    if (subscription.status !== "active") {
      return NextResponse.json({ error: "Your R365 subscription must be active before adding connections." }, { status: 400 });
    }
    const extraItem = subscription.items.data.find((item) => item.price.id === loaded.price.id);
    const baseItem = subscription.items.data.find((item) => item.price.id !== loaded.price.id);
    if (!baseItem || baseItem.price.recurring?.interval === "year") {
      return NextResponse.json({ error: "Extra R365 connections are available only with monthly billing." }, { status: 400 });
    }

    purchaseId = crypto.randomUUID();
    const { error: insertError } = await supabase.from("r365_connection_purchases").insert({
      id: purchaseId,
      organization_id: access.tenant.organizationId,
      module_id: loaded.moduleRow.id,
      stripe_subscription_id: addon.stripe_subscription_id,
      extra_price_id: loaded.price.id,
      delta_quantity: count,
      target_quantity: (extraItem?.quantity ?? 0) + count,
      request_key: crypto.randomUUID(),
    });
    if (insertError) {
      return NextResponse.json({ error: "A connection purchase is already awaiting payment. Please complete it before starting another." }, { status: 409 });
    }

    const updated = await stripe.subscriptions.update(
      addon.stripe_subscription_id,
      {
        items: extraItem
          ? [{ id: extraItem.id, quantity: (extraItem.quantity ?? 0) + count }]
          : [{ price: loaded.price.id, quantity: count }],
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
        expand: ["latest_invoice"],
      },
      { idempotencyKey: `r365-extra-connections:${purchaseId}` },
    );
    stripeMutationCompleted = true;
    // With pending_if_incomplete, Stripe keeps the active items unchanged until this invoice is paid.
    const pendingInvoiceReference = (updated.pending_update as PendingUpdateWithInvoice | null)?.invoice;
    const invoiceReference = pendingInvoiceReference ?? updated.latest_invoice;
    const invoice = pendingInvoiceReference
      ? await stripe.invoices.retrieve(typeof pendingInvoiceReference === "string" ? pendingInvoiceReference : pendingInvoiceReference.id)
      : typeof invoiceReference === "string"
        ? await stripe.invoices.retrieve(invoiceReference)
        : invoiceReference;
    if (!invoice) throw new Error("Stripe did not create a payment invoice.");

    const actualItem = hasTargetExtraQuantity(updated, loaded.price.id, (extraItem?.quantity ?? 0) + count);

    const { error: purchaseUpdateError } = await supabase.from("r365_connection_purchases").update({
      stripe_subscription_item_id: actualItem?.id ?? null,
      stripe_invoice_id: invoice.id,
    }).eq("id", purchaseId);
    if (purchaseUpdateError) throw purchaseUpdateError;

    if (invoice.status === "paid") {
      const liveSubscription = await stripe.subscriptions.retrieve(addon.stripe_subscription_id);
      const liveItem = hasTargetExtraQuantity(liveSubscription, loaded.price.id, (extraItem?.quantity ?? 0) + count);
      if (!liveItem) {
        console.info(`[r365-extra-connections] Purchase ${purchaseId} is paid but the pending update is not applied yet.`);
        return NextResponse.json({ pending: true });
      }

      if (liveItem.id !== actualItem?.id) {
        const { error: itemUpdateError } = await supabase.from("r365_connection_purchases")
          .update({ stripe_subscription_item_id: liveItem.id })
          .eq("id", purchaseId);
        if (itemUpdateError) throw itemUpdateError;
      }
      const { error } = await supabase.rpc("apply_r365_connection_purchase", { p_purchase_id: purchaseId });
      if (error) throw error;
      return NextResponse.json({ applied: true });
    }
    if (invoice.hosted_invoice_url) return NextResponse.json({ paymentUrl: invoice.hosted_invoice_url, pending: true });
    return NextResponse.json({ pending: true });
  } catch (error) {
    console.error("[r365-extra-connections]", error);
    if (purchaseId && supabase) {
      await supabase.from("r365_connection_purchases")
        .update({ status: stripeMutationCompleted ? "payment_failed" : "voided" })
        .eq("id", purchaseId)
        .eq("status", "pending_payment");
    }
    return NextResponse.json({ error: "Unable to start the connection purchase. Please try again." }, { status: 400 });
  }
}

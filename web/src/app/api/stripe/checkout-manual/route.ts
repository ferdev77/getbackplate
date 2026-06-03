import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/infrastructure/stripe/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertSuperadminApi } from "@/shared/lib/access";

type ActionType = "activate_module" | "add_invoices" | "custom";

interface CreateManualCheckoutBody {
  organizationId: string;
  description: string;
  internalNotes?: string;
  amountCents: number;
  currency?: string;
  actionType: ActionType;
  actionPayload?: Record<string, unknown>;
  expiresInDays?: number;
}

export async function POST(req: NextRequest) {
  // ── Auth: superadmin only ──────────────────────────────────
  const auth = await assertSuperadminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // ── Parse & validate body ──────────────────────────────────
  const body = (await req.json()) as CreateManualCheckoutBody;
  const {
    organizationId,
    description,
    internalNotes,
    amountCents,
    currency = "usd",
    actionType,
    actionPayload,
    expiresInDays = 7,
  } = body;

  if (!organizationId || !description?.trim() || !amountCents || amountCents <= 0 || !actionType) {
    return NextResponse.json({ error: "Faltan campos requeridos o monto inválido." }, { status: 400 });
  }

  const validActions: ActionType[] = ["activate_module", "add_invoices", "custom"];
  if (!validActions.includes(actionType)) {
    return NextResponse.json({ error: "actionType inválido." }, { status: 400 });
  }

  if (actionType === "activate_module" && !actionPayload?.moduleCode) {
    return NextResponse.json({ error: "activate_module requiere actionPayload.moduleCode" }, { status: 400 });
  }
  if (actionType === "add_invoices" && (!actionPayload?.invoiceCount || Number(actionPayload.invoiceCount) <= 0)) {
    return NextResponse.json({ error: "add_invoices requiere actionPayload.invoiceCount > 0" }, { status: 400 });
  }

  const clampedDays = Math.min(Math.max(expiresInDays, 1), 30);

  const supabase = createSupabaseAdminClient();

  // ── Fetch org ──────────────────────────────────────────────
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Organización no encontrada." }, { status: 404 });
  }

  // ── Create DB record first to get the order ID ─────────────
  const expiresAt = new Date(Date.now() + clampedDays * 86_400_000).toISOString();

  const { data: order, error: insertErr } = await supabase
    .from("manual_payment_orders")
    .insert({
      organization_id: organizationId,
      created_by: auth.userId,
      description: description.trim(),
      internal_notes: internalNotes?.trim() || null,
      amount_cents: amountCents,
      currency,
      action_type: actionType,
      action_payload: actionPayload ?? null,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertErr || !order) {
    console.error("[checkout-manual] Error inserting order:", insertErr);
    return NextResponse.json({ error: "Error al crear la orden." }, { status: 500 });
  }

  // ── Reuse existing Stripe customer if available ────────────
  const { data: stripeMapping } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.getbackplate.com";

  // ── Create Stripe Checkout Session (one-time payment) ─────
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency,
          product_data: { name: description.trim() },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    // Pre-fill customer if we already have one in Stripe
    ...(stripeMapping?.stripe_customer_id
      ? { customer: stripeMapping.stripe_customer_id }
      : {}),
    success_url: `${appUrl}/app/dashboard?manual_payment=success`,
    cancel_url:  `${appUrl}/app/dashboard?manual_payment=canceled`,
    // Stripe expires_at must be between 30 min and 24h for payment mode
    // For longer windows we rely on our own expires_at field in the DB
    metadata: {
      manualPaymentOrderId: order.id,
      organizationId,
      actionType,
      ...(actionPayload ? { actionPayload: JSON.stringify(actionPayload) } : {}),
    },
  });

  // ── Update order with Stripe session info ──────────────────
  await supabase
    .from("manual_payment_orders")
    .update({ stripe_session_id: session.id, checkout_url: session.url })
    .eq("id", order.id);

  return NextResponse.json({ url: session.url, orderId: order.id });
}

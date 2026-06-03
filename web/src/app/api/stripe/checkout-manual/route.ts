import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/infrastructure/stripe/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertSuperadminApi } from "@/shared/lib/access";

type ActionType = "activate_module" | "add_invoices" | "custom";

interface OrderItem {
  description: string;
  amountCents: number;
  actionType: ActionType;
  actionPayload?: Record<string, unknown>;
}

interface CreateManualCheckoutBody {
  organizationId: string;
  internalNotes?: string;
  currency?: string;
  items: OrderItem[];
}

const VALID_ACTIONS: ActionType[] = ["activate_module", "add_invoices", "custom"];

function validateItem(item: OrderItem, idx: number): string | null {
  if (!item.description?.trim()) return `Item ${idx + 1}: descripción requerida.`;
  if (!item.amountCents || item.amountCents <= 0) return `Item ${idx + 1}: monto inválido.`;
  if (!VALID_ACTIONS.includes(item.actionType)) return `Item ${idx + 1}: actionType inválido.`;
  if (item.actionType === "activate_module" && !item.actionPayload?.moduleCode)
    return `Item ${idx + 1}: activate_module requiere actionPayload.moduleCode.`;
  if (item.actionType === "add_invoices" && (!item.actionPayload?.invoiceCount || Number(item.actionPayload.invoiceCount) <= 0))
    return `Item ${idx + 1}: add_invoices requiere actionPayload.invoiceCount > 0.`;
  return null;
}

export async function POST(req: NextRequest) {
  // ── Auth: superadmin only ──────────────────────────────────
  const auth = await assertSuperadminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // ── Parse & validate body ──────────────────────────────────
  const body = (await req.json()) as CreateManualCheckoutBody;
  const { organizationId, internalNotes, currency = "usd", items } = body;

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId requerido." }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Debe incluir al menos un item." }, { status: 400 });
  }

  for (let i = 0; i < items.length; i++) {
    const err = validateItem(items[i], i);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const totalAmountCents = items.reduce((sum, item) => sum + item.amountCents, 0);

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
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString(); // 24h

  // Derive description and action_type for display columns
  const displayDescription = items.length === 1
    ? items[0].description.trim()
    : `${items.length} items`;
  const displayActionType = items.length === 1 ? items[0].actionType : "custom";
  const displayActionPayload = items.length === 1 ? (items[0].actionPayload ?? null) : null;

  const storedItems = items.map(item => ({
    description: item.description.trim(),
    amount_cents: item.amountCents,
    action_type: item.actionType,
    action_payload: item.actionPayload ?? null,
  }));

  const { data: order, error: insertErr } = await supabase
    .from("manual_payment_orders")
    .insert({
      organization_id: organizationId,
      created_by: auth.userId,
      description: displayDescription,
      internal_notes: internalNotes?.trim() || null,
      amount_cents: totalAmountCents,
      currency,
      action_type: displayActionType,
      action_payload: displayActionPayload,
      items: storedItems,
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
  const stripeExpiresAt = Math.floor(Date.now() / 1000) + 23 * 3600;

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: items.map(item => ({
        price_data: {
          currency,
          product_data: { name: item.description.trim() },
          unit_amount: item.amountCents,
        },
        quantity: 1,
      })),
      ...(stripeMapping?.stripe_customer_id
        ? { customer: stripeMapping.stripe_customer_id }
        : {}),
      success_url: `${appUrl}/app/dashboard?manual_payment=success`,
      cancel_url:  `${appUrl}/app/dashboard?manual_payment=canceled`,
      expires_at:  stripeExpiresAt,
      metadata: {
        manualPaymentOrderId: order.id,
        organizationId,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear la sesión en Stripe";
    console.error("[checkout-manual] Stripe error:", msg);
    await supabase.from("manual_payment_orders").delete().eq("id", order.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // ── Update order with Stripe session info ──────────────────
  await supabase
    .from("manual_payment_orders")
    .update({ stripe_session_id: session.id, checkout_url: session.url })
    .eq("id", order.id);

  return NextResponse.json({ url: session.url, orderId: order.id });
}

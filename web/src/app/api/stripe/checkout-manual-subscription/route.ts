/**
 * POST /api/stripe/checkout-manual-subscription
 *
 * Genera un link de suscripcion recurrente (plan de plataforma o plan de
 * integracion QBO-R365) para una organizacion, sin que su admin tenga que
 * loguearse — pensado para clientes que el equipo soporta directamente
 * (ej. Prodel/Taco Palenque) y nunca entran a la plataforma.
 *
 * Si la organizacion ya tiene una suscripcion activa de ese tipo:
 *   - mismo plan      → devuelve un link al Billing Portal de Stripe
 *   - plan distinto    → aplica el cambio con prorateo al instante sobre la
 *                         tarjeta ya guardada (no se genera ningun link)
 * Si no tiene ninguna → crea una Stripe Checkout Session en modo
 * "subscription" y devuelve la URL para compartir (expira en 24h).
 *
 * El webhook (checkout.session.completed) ya sabe aprovisionar ambos tipos
 * de plan sin cambios — solo se le agrega marcar manual_subscription_orders
 * como completed cuando corresponde.
 */
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/infrastructure/stripe/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertSuperadminApi } from "@/shared/lib/access";
import { syncOrganizationPlan } from "@/modules/organizations/services/organization.service";
import { buildTermsConsentParams, legalConsentMetadata } from "@/shared/lib/legal-consent";

type PlanKind = "platform" | "integration";
type BillingPeriod = "monthly" | "yearly";

interface CreateManualSubscriptionBody {
  organizationId: string;
  planKind: PlanKind;
  planId: string;
  billingPeriod: BillingPeriod;
  includeSetupFee?: boolean;
  extraChargeCents?: number;
  extraChargeDescription?: string;
  extraConnectionCount?: number;
}

async function resolveTargetPriceForPeriod(params: {
  basePriceId: string;
  period: BillingPeriod;
}): Promise<string | null> {
  const basePrice = await stripe.prices.retrieve(params.basePriceId);
  if (!basePrice.recurring) return null;

  const targetInterval = params.period === "yearly" ? "year" : "month";
  if (basePrice.recurring.interval === targetInterval) return basePrice.id;

  const productId =
    typeof basePrice.product === "string" ? basePrice.product : (basePrice.product as { id: string } | null)?.id;
  if (!productId) return null;

  const { data: prices } = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const match = prices.find((p) => p.recurring?.interval === targetInterval && p.currency === basePrice.currency);
  return match?.id ?? null;
}

export async function POST(req: NextRequest) {
  const auth = await assertSuperadminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json()) as CreateManualSubscriptionBody;
  const { organizationId, planKind, planId, billingPeriod, includeSetupFee, extraChargeDescription } = body;

  if (!organizationId) return NextResponse.json({ error: "organizationId requerido." }, { status: 400 });
  if (planKind !== "platform" && planKind !== "integration") {
    return NextResponse.json({ error: "planKind inválido." }, { status: 400 });
  }
  if (!planId) return NextResponse.json({ error: "planId requerido." }, { status: 400 });
  if (billingPeriod !== "monthly" && billingPeriod !== "yearly") {
    return NextResponse.json({ error: "billingPeriod inválido." }, { status: 400 });
  }

  const extraChargeCents = typeof body.extraChargeCents === "number" && body.extraChargeCents > 0
    ? Math.round(body.extraChargeCents)
    : null;

  const extraConnectionCount = typeof body.extraConnectionCount === "number" && body.extraConnectionCount > 0
    ? Math.round(body.extraConnectionCount)
    : 0;

  if (extraConnectionCount > 0 && planKind !== "integration") {
    return NextResponse.json({ error: "Las conexiones extra solo aplican a planes de integración." }, { status: 400 });
  }
  if (extraConnectionCount > 0 && billingPeriod !== "monthly") {
    return NextResponse.json(
      { error: "Las conexiones extra recurrentes solo están disponibles con facturación mensual." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, plan_id, integration_plan_id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Organización no encontrada." }, { status: 404 });

  const planTypeFilter = planKind === "integration" ? "qbo_r365" : "platform";
  const { data: plan } = await supabase
    .from("plans")
    .select("id, code, name, stripe_price_id, is_enterprise, setup_fee_amount, setup_fee_annual_discount_pct")
    .eq("id", planId)
    .eq("plan_type", planTypeFilter)
    .eq("is_active", true)
    .maybeSingle();

  if (!plan) return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
  if ((plan as { is_enterprise?: boolean }).is_enterprise) {
    return NextResponse.json({ error: "Los planes Enterprise requieren contacto directo con ventas." }, { status: 400 });
  }
  const basePriceId = (plan as { stripe_price_id?: string | null }).stripe_price_id ?? null;
  if (!basePriceId) {
    return NextResponse.json({ error: "Este plan no tiene un precio de Stripe configurado." }, { status: 400 });
  }

  const targetPriceId = await resolveTargetPriceForPeriod({ basePriceId, period: billingPeriod });
  if (!targetPriceId) {
    return NextResponse.json(
      { error: `No existe precio ${billingPeriod === "yearly" ? "anual" : "mensual"} para este plan en Stripe.` },
      { status: 400 },
    );
  }

  let moduleId: string | null = null;
  let extraConnectionPriceId: string | null = null;
  if (planKind === "integration") {
    const { data: moduleRow } = await supabase
      .from("module_catalog")
      .select("id, extra_connection_stripe_price_id")
      .eq("code", "qbo_r365")
      .maybeSingle();
    moduleId = moduleRow?.id ?? null;
    extraConnectionPriceId = moduleRow?.extra_connection_stripe_price_id ?? null;
    if (!moduleId) return NextResponse.json({ error: "Módulo qbo_r365 no encontrado en el catálogo." }, { status: 500 });
  }

  if (extraConnectionCount > 0 && !extraConnectionPriceId) {
    return NextResponse.json({ error: "No hay un precio de conexión extra configurado en Stripe." }, { status: 400 });
  }

  const { data: stripeMapping } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const existingCustomerId = stripeMapping?.stripe_customer_id ?? null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.getbackplate.com";

  // ── Org ya tiene una suscripcion activa de este tipo: upgrade al instante ──
  const existingSubscriptionId = await (async () => {
    if (planKind === "platform") {
      const { data } = await supabase
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("organization_id", organizationId)
        .in("status", ["active", "trialing"])
        .maybeSingle();
      return data?.stripe_subscription_id ?? null;
    }
    const { data } = await supabase
      .from("organization_addons")
      .select("stripe_subscription_id")
      .eq("organization_id", organizationId)
      .eq("module_id", moduleId ?? "")
      .eq("status", "active")
      .maybeSingle();
    return data?.stripe_subscription_id ?? null;
  })();

  if (existingSubscriptionId && extraChargeCents) {
    return NextResponse.json(
      { error: "Esta organización ya tiene una suscripción activa; el cargo único no se puede agregar a un upgrade. Usá un Link de Pago normal para ese cobro." },
      { status: 400 },
    );
  }

  if (existingSubscriptionId && extraConnectionCount > 0) {
    return NextResponse.json(
      { error: "Esta organización ya tiene una suscripción activa; las conexiones extra no se pueden agregar a un upgrade todavía." },
      { status: 400 },
    );
  }

  if (existingSubscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(existingSubscriptionId);
    const currentItemId = subscription.items.data[0]?.id;
    const currentPriceId = subscription.items.data[0]?.price.id;

    if (!currentItemId) {
      return NextResponse.json({ error: "No se pudo leer la suscripción actual en Stripe." }, { status: 502 });
    }

    if (currentPriceId === targetPriceId) {
      if (!existingCustomerId) {
        return NextResponse.json({ error: "No se encontró el customer de Stripe para abrir el portal." }, { status: 400 });
      }
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: existingCustomerId,
        return_url: `${appUrl}/pay/success`,
      });
      return NextResponse.json({ url: portalSession.url });
    }

    const updateMetadata: Record<string, string> =
      planKind === "integration"
        ? { organizationId, isAddon: "true", moduleCode: "qbo_r365", moduleId: moduleId ?? "", integrationPlanId: plan.id, billingPeriod }
        : { organizationId, planId: plan.id, billingPeriod };

    await stripe.subscriptions.update(existingSubscriptionId, {
      items: [{ id: currentItemId, price: targetPriceId }],
      proration_behavior: "create_prorations",
      metadata: updateMetadata,
    });

    if (planKind === "platform") {
      const syncResult = await syncOrganizationPlan({
        organizationId,
        planId: plan.id,
        integrationPlanId: org.integration_plan_id ?? null,
        skipPlanLimitCheck: true,
      });
      if (!syncResult.ok) return NextResponse.json({ error: syncResult.message }, { status: 400 });

      await supabase
        .from("organizations")
        .update({ plan_id: plan.id, billing_activation_status: "active", billing_activated_at: new Date().toISOString() })
        .eq("id", organizationId);
      await supabase
        .from("organization_settings")
        .upsert({ organization_id: organizationId, billing_period: billingPeriod }, { onConflict: "organization_id" });
    } else {
      await supabase
        .from("organization_addons")
        .update({ integration_plan_id: plan.id })
        .eq("organization_id", organizationId)
        .eq("module_id", moduleId ?? "");

      const syncResult = await syncOrganizationPlan({
        organizationId,
        planId: org.plan_id ?? null,
        integrationPlanId: plan.id,
        skipPlanLimitCheck: true,
      });
      if (!syncResult.ok) return NextResponse.json({ error: syncResult.message }, { status: 400 });

      await supabase.from("organizations").update({ integration_plan_id: plan.id }).eq("id", organizationId);
    }

    await supabase.from("manual_subscription_orders").insert({
      organization_id: organizationId,
      created_by: auth.userId,
      plan_kind: planKind,
      plan_id: plan.id,
      billing_period: billingPeriod,
      include_setup_fee: false,
      status: "upgraded",
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ upgraded: true });
  }

  // ── Alta nueva: crear Stripe Checkout Session en modo subscription ────────
  const { data: order, error: insertErr } = await supabase
    .from("manual_subscription_orders")
    .insert({
      organization_id: organizationId,
      created_by: auth.userId,
      plan_kind: planKind,
      plan_id: plan.id,
      billing_period: billingPeriod,
      include_setup_fee: planKind === "integration" && includeSetupFee === true,
      extra_charge_cents: extraChargeCents,
      extra_charge_description: extraChargeCents ? (extraChargeDescription?.trim() || "Cargo adicional") : null,
      extra_connection_count: extraConnectionCount,
      status: "pending",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !order) {
    console.error("[checkout-manual-subscription] Error inserting order:", insertErr);
    return NextResponse.json({ error: "Error al crear la orden." }, { status: 500 });
  }

  const rawSetupFee = (plan as { setup_fee_amount?: number | null }).setup_fee_amount ?? null;
  const discountPct = (plan as { setup_fee_annual_discount_pct?: number | null }).setup_fee_annual_discount_pct ?? 25;
  const setupFeeAmountCents =
    planKind === "integration" && includeSetupFee === true && rawSetupFee
      ? Math.round((billingPeriod === "yearly" && discountPct > 0 ? rawSetupFee * (1 - discountPct / 100) : rawSetupFee) * 100)
      : 0;

  const planName = typeof plan.name === "string" && plan.name.trim() ? plan.name.trim() : planKind === "integration" ? "Integración" : "Plan";

  // ── Aviso de cargo por uso en el propio Checkout de Stripe ──────────────
  // Stripe solo conoce el precio fijo de la suscripcion; el cargo por factura
  // se agrega aparte en cada renovacion (usage-billing.ts), asi que Stripe no
  // puede reflejarlo en su resumen "Luego $X por mes". Lo aclaramos via
  // custom_text.submit, el unico lugar de Checkout donde podemos meter texto
  // propio.
  let usageBillingNote: string | null = null;
  if (planKind === "integration") {
    const { data: addonPricing } = await supabase
      .from("organization_addons")
      .select("price_per_invoice_cents")
      .eq("organization_id", organizationId)
      .eq("module_id", moduleId ?? "")
      .maybeSingle();

    const perInvoiceCents = addonPricing?.price_per_invoice_cents ?? null;
    if (perInvoiceCents && perInvoiceCents > 0) {
      const basePrice = await stripe.prices.retrieve(targetPriceId);
      const baseAmount = ((basePrice.unit_amount ?? 0) / 100).toFixed(2);
      const perInvoiceAmount = (perInvoiceCents / 100).toFixed(2);
      const periodLabel = billingPeriod === "yearly" ? "annual" : "monthly";
      usageBillingNote = `Your ${periodLabel} subscription is $${baseAmount} plus $${perInvoiceAmount} per document successfully delivered. Usage charges appear on the following month's invoice.`;
    }
  }
  // ── END aviso de cargo por uso ───────────────────────────────────────────

  const setupLineItem =
    setupFeeAmountCents > 0
      ? [
          {
            price_data: {
              currency: "usd" as const,
              product_data: { name: `Setup · ${planName}${billingPeriod === "yearly" ? ` (${discountPct}% off anual)` : ""}` },
              unit_amount: setupFeeAmountCents,
            },
            quantity: 1,
          },
        ]
      : [];

  const extraConnectionLineItem =
    extraConnectionCount > 0 && extraConnectionPriceId
      ? [{ price: extraConnectionPriceId, quantity: extraConnectionCount }]
      : [];

  const sharedMetadata: Record<string, string> =
    planKind === "integration"
      ? {
          organizationId,
          isAddon: "true",
          moduleCode: "qbo_r365",
          moduleId: moduleId ?? "",
          integrationPlanId: plan.id,
          integrationPlanCode: typeof plan.code === "string" ? plan.code : "",
          billingPeriod,
          setupFeePaid: setupFeeAmountCents > 0 ? "true" : "false",
          setupFeeAmount: String(setupFeeAmountCents),
          manualSubscriptionOrderId: order.id,
          extraSlotCount: String(extraConnectionCount),
          ...legalConsentMetadata(),
        }
      : {
          organizationId,
          planId: plan.id,
          billingPeriod,
          trialApplied: "false",
          trialDays: "0",
          manualSubscriptionOrderId: order.id,
          ...legalConsentMetadata(),
        };

  const termsConsentParams = buildTermsConsentParams(planKind);

  const extraChargeLineItem = extraChargeCents
    ? [
        {
          price_data: {
            currency: "usd" as const,
            product_data: { name: extraChargeDescription?.trim() || "Cargo adicional" },
            unit_amount: extraChargeCents,
          },
          quantity: 1,
        },
      ]
    : [];

  const sessionParams = (customerId: string | null) => ({
    mode: "subscription" as const,
    payment_method_types: ["card" as const],
    line_items: [{ price: targetPriceId, quantity: 1 }, ...extraConnectionLineItem, ...setupLineItem, ...extraChargeLineItem],
    ...(customerId ? { customer: customerId } : {}),
    success_url: `${appUrl}/pay/success`,
    cancel_url: `${appUrl}/pay/canceled`,
    client_reference_id: organizationId,
    tax_id_collection: { enabled: true },
    automatic_tax: { enabled: true },
    metadata: sharedMetadata,
    subscription_data: { metadata: sharedMetadata },
    consent_collection: termsConsentParams.consent_collection,
    custom_text: {
      ...termsConsentParams.custom_text,
      ...(usageBillingNote ? { submit: { message: usageBillingNote } } : {}),
    },
  });

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create(sessionParams(existingCustomerId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    const isStaleCustomer = existingCustomerId && msg.includes("No such customer");
    if (isStaleCustomer) {
      console.warn(`[checkout-manual-subscription] Stale customer ${existingCustomerId} for org ${organizationId}, retrying without customer`);
      await supabase.from("stripe_customers").delete().eq("organization_id", organizationId);
      try {
        session = await stripe.checkout.sessions.create(sessionParams(null));
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : "Error al crear la sesión en Stripe";
        console.error("[checkout-manual-subscription] Stripe error on retry:", retryMsg);
        await supabase.from("manual_subscription_orders").delete().eq("id", order.id);
        return NextResponse.json({ error: retryMsg }, { status: 502 });
      }
    } else {
      console.error("[checkout-manual-subscription] Stripe error:", msg);
      await supabase.from("manual_subscription_orders").delete().eq("id", order.id);
      return NextResponse.json({ error: msg || "Error al crear la sesión en Stripe" }, { status: 502 });
    }
  }

  await supabase
    .from("manual_subscription_orders")
    .update({ stripe_session_id: session.id, checkout_url: session.url })
    .eq("id", order.id);

  return NextResponse.json({ url: session.url, orderId: order.id });
}

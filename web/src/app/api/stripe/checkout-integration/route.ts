import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { stripe } from "@/infrastructure/stripe/client";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";

type BillingPeriod = "monthly" | "annual";

async function resolveTargetPriceForPeriod(params: {
  basePriceId: string;
  period: BillingPeriod;
}): Promise<string | null> {
  const basePrice = await stripe.prices.retrieve(params.basePriceId);
  if (!basePrice.recurring) return null;

  const targetInterval = params.period === "annual" ? "year" : "month";
  if (basePrice.recurring.interval === targetInterval) return basePrice.id;

  const productId =
    typeof basePrice.product === "string"
      ? basePrice.product
      : (basePrice.product as { id: string } | null)?.id;
  if (!productId) return null;

  const { data: prices } = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });

  const match = prices.find(
    (p) =>
      p.recurring?.interval === targetInterval && p.currency === basePrice.currency,
  );

  return match?.id ?? null;
}

export async function POST(request: Request) {
  try {
    const moduleAccess = await assertCompanyAdminModuleApi("dashboard", {
      allowBillingBypass: true,
    });
    if (!moduleAccess.ok) {
      return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
    }
    const { userId, tenant } = moduleAccess;
    const { organizationId } = tenant;

    const payload = (await request.json()) as {
      planId?: string;
      billingPeriod?: string;
      includeSetupFee?: boolean;
    };

    const planId = typeof payload.planId === "string" ? payload.planId.trim() : "";
    const period: BillingPeriod = payload.billingPeriod === "annual" ? "annual" : "monthly";
    const includeSetupFee = payload.includeSetupFee === true;

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Load the integration plan and the qbo_r365 module ID in parallel
    const [{ data: plan }, { data: moduleRow }] = await Promise.all([
      supabase
        .from("plans")
        .select("id, code, name, stripe_price_id, plan_type, is_enterprise, setup_fee_amount")
        .eq("id", planId)
        .eq("plan_type", "qbo_r365")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("module_catalog")
        .select("id, code")
        .eq("code", "qbo_r365")
        .maybeSingle(),
    ]);

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    if ((plan as Record<string, unknown>).is_enterprise) {
      return NextResponse.json(
        { error: "Enterprise plans require contacting sales directly." },
        { status: 400 },
      );
    }

    const stripePriceId =
      typeof (plan as Record<string, unknown>).stripe_price_id === "string"
        ? ((plan as Record<string, unknown>).stripe_price_id as string)
        : null;

    if (!stripePriceId) {
      return NextResponse.json(
        { error: "This plan does not have a Stripe price configured." },
        { status: 400 },
      );
    }

    const targetPriceId = await resolveTargetPriceForPeriod({
      basePriceId: stripePriceId,
      period,
    });

    if (!targetPriceId) {
      return NextResponse.json(
        {
          error: `No ${period === "annual" ? "annual" : "monthly"} price found for this plan in Stripe.`,
        },
        { status: 400 },
      );
    }

    const moduleId = moduleRow?.id ?? null;
    const planCode =
      typeof (plan as Record<string, unknown>).code === "string"
        ? ((plan as Record<string, unknown>).code as string)
        : "";

    // Setup fee: solo en nuevas contrataciones, opcional
    const rawSetupFee = (plan as Record<string, unknown>).setup_fee_amount as number | null ?? null;
    const setupFeeAmountCents = rawSetupFee
      ? Math.round((period === "annual" ? rawSetupFee * 0.75 : rawSetupFee) * 100)
      : 0;

    const sharedMeta = {
      organizationId,
      userId,
      isAddon: "true",
      moduleCode: "qbo_r365",
      moduleId: moduleId ?? "",
      integrationPlanId: plan.id,
      integrationPlanCode: planCode,
      billingPeriod: period,
      setupFeePaid: includeSetupFee && setupFeeAmountCents > 0 ? "true" : "false",
      setupFeeAmount: includeSetupFee && setupFeeAmountCents > 0 ? String(setupFeeAmountCents) : "0",
    };

    // ── UPGRADE / DOWNGRADE: org already has an active integration subscription ──
    const { data: existingAddon } = await supabase
      .from("organization_addons")
      .select("stripe_subscription_id, status, integration_plan_id")
      .eq("organization_id", organizationId)
      .eq("module_id", moduleId ?? "")
      .maybeSingle();

    if (
      existingAddon?.status === "active" &&
      existingAddon.stripe_subscription_id &&
      moduleId
    ) {
      // Same plan → open billing portal instead
      if (existingAddon.integration_plan_id === plan.id) {
        const { data: stripeMapping } = await supabase
          .from("stripe_customers")
          .select("stripe_customer_id")
          .eq("organization_id", organizationId)
          .maybeSingle();

        if (stripeMapping?.stripe_customer_id) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.getbackplate.com";
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: stripeMapping.stripe_customer_id,
            return_url: `${appUrl}/app/dashboard`,
          });
          return NextResponse.json({ url: portalSession.url });
        }
      }

      // Different plan → proration upgrade/downgrade inline
      const subscription = await stripe.subscriptions.retrieve(
        existingAddon.stripe_subscription_id,
      );
      const itemId = subscription.items.data[0]?.id;

      if (itemId) {
        await stripe.subscriptions.update(existingAddon.stripe_subscription_id, {
          items: [{ id: itemId, price: targetPriceId }],
          proration_behavior: "create_prorations",
          metadata: sharedMeta,
        });

        // Sync the new plan tier in DB
        await supabase
          .from("organization_addons")
          .update({ integration_plan_id: plan.id })
          .eq("organization_id", organizationId)
          .eq("module_id", moduleId);

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.getbackplate.com";
        return NextResponse.json({
          upgraded: true,
          url: `${appUrl}/app/dashboard?integration_upgraded=1`,
        });
      }
    }
    // ── END UPGRADE/DOWNGRADE ─────────────────────────────────────────────────

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://app.getbackplate.com";

    const planName = typeof (plan as Record<string, unknown>).name === "string"
      ? (plan as Record<string, unknown>).name as string
      : "Integración";

    // Setup fee: precio one-time agregado directamente a line_items.
    // En subscription mode, Stripe cobra los items sin `recurring` solo en el
    // primer invoice y los muestra en el resumen del checkout.
    const setupLineItem = includeSetupFee && setupFeeAmountCents > 0
      ? [{
          price_data: {
            currency: "usd" as const,
            product_data: {
              name: `Setup · ${planName}${period === "annual" ? " (25% off anual)" : ""}`,
            },
            unit_amount: setupFeeAmountCents,
          },
          quantity: 1,
        }]
      : [];

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: targetPriceId, quantity: 1 }, ...setupLineItem],
      client_reference_id: organizationId,
      success_url: `${appUrl}/integrations/qbo-r365/success?plan=${encodeURIComponent(plan.name)}&period=${period}`,
      cancel_url: `${appUrl}/integrations/qbo-r365`,
      tax_id_collection: { enabled: true },
      metadata: sharedMeta,
      subscription_data: { metadata: sharedMeta },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("[checkout-integration] Error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

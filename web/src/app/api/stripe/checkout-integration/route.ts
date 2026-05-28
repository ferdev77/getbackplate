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
    };

    const planId = typeof payload.planId === "string" ? payload.planId.trim() : "";
    const period: BillingPeriod =
      payload.billingPeriod === "annual" ? "annual" : "monthly";

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: plan } = await supabase
      .from("plans")
      .select("id, code, name, stripe_price_id, plan_type, is_enterprise")
      .eq("id", planId)
      .eq("plan_type", "qbo_r365")
      .eq("is_active", true)
      .maybeSingle();

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

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://app.getbackplate.com";

    const planCode =
      typeof (plan as Record<string, unknown>).code === "string"
        ? ((plan as Record<string, unknown>).code as string)
        : "";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: targetPriceId, quantity: 1 }],
      client_reference_id: organizationId,
      success_url: `${appUrl}/integrations/qbo-r365/success?plan=${encodeURIComponent(plan.name)}&period=${period}`,
      cancel_url: `${appUrl}/integrations/qbo-r365`,
      tax_id_collection: { enabled: true },
      metadata: {
        organizationId,
        userId,
        isAddon: "true",
        moduleCode: "qbo_r365",
        integrationPlanId: plan.id,
        integrationPlanCode: planCode,
        billingPeriod: period,
      },
      subscription_data: {
        metadata: {
          organizationId,
          userId,
          isAddon: "true",
          moduleCode: "qbo_r365",
          integrationPlanId: plan.id,
          integrationPlanCode: planCode,
          billingPeriod: period,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("[checkout-integration] Error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

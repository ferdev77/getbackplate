import type { Metadata } from "next";
import { Fraunces, Inter_Tight } from "next/font/google";

import { stripe } from "@/infrastructure/stripe/client";
import { getActivePlansForIntegration } from "@/modules/plans/queries";
import { IntegrationPricingClient } from "./integration-pricing-client";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600", "700", "800"],
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Pricing — QBO ↔ R365 Integration | GetBackplate",
  description:
    "The only native connector between QuickBooks Online and Restaurant365. Send invoices automatically, in real time.",
};

async function resolveStripePrices(stripePriceId: string) {
  try {
    const basePrice = await stripe.prices.retrieve(stripePriceId);
    if (!basePrice.recurring) return null;

    const productId =
      typeof basePrice.product === "string"
        ? basePrice.product
        : (basePrice.product as { id: string } | null)?.id;
    if (!productId) return null;

    const { data: allPrices } = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100,
    });

    const monthlyPrice = allPrices.find(
      (p) => p.recurring?.interval === "month" && p.currency === basePrice.currency,
    );
    const annualPrice = allPrices.find(
      (p) => p.recurring?.interval === "year" && p.currency === basePrice.currency,
    );

    return {
      monthly_amount: monthlyPrice ? (monthlyPrice.unit_amount ?? 0) / 100 : null,
      annual_total: annualPrice ? (annualPrice.unit_amount ?? 0) / 100 : null,
      annual_per_month: annualPrice
        ? Math.round((annualPrice.unit_amount ?? 0) / 100 / 12)
        : null,
    };
  } catch {
    return null;
  }
}

export default async function QboR365IntegrationPage() {
  const rawPlans = await getActivePlansForIntegration("qbo_r365");

  const plans = await Promise.all(
    rawPlans.map(async (plan) => {
      const stripePriceId =
        typeof (plan as Record<string, unknown>).stripe_price_id === "string"
          ? ((plan as Record<string, unknown>).stripe_price_id as string)
          : null;

      const pricing = stripePriceId ? await resolveStripePrices(stripePriceId) : null;

      return {
        ...plan,
        // Prefer Stripe-resolved monthly; fall back to DB price_amount
        price_amount: pricing?.monthly_amount ?? plan.price_amount,
        annual_per_month: pricing?.annual_per_month ?? null,
        annual_total: pricing?.annual_total ?? null,
        has_stripe_prices: pricing !== null,
      };
    }),
  );

  return (
    <div className={`${fraunces.variable} ${interTight.variable}`}>
      <IntegrationPricingClient plans={plans} />
    </div>
  );
}

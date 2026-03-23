import { redirect } from "next/navigation";
import Stripe from "stripe";
import { stripe } from "@/infrastructure/stripe/client";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";

export default async function CheckoutRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ priceId?: string; planId?: string }>;
}) {
  const params = await searchParams;
  const { priceId, planId } = params;

  if (!priceId) {
    redirect("/app/dashboard");
  }

  // Double check they are authenticated here via Supabase Server Client
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch their organization ID
  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  const organizationId = membership?.organization_id;

  if (!organizationId) {
    redirect("/app/dashboard");
  }

  try {
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app/dashboard?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/app/dashboard?canceled=true`,
      tax_id_collection: {
        enabled: true,
      },
      client_reference_id: organizationId,
      customer_email: user.email ?? undefined,
      metadata: {
        organizationId: organizationId,
        userId: user.id,
        planId: planId || "",
      },
      subscription_data: {
        metadata: {
          organizationId: organizationId,
          userId: user.id,
          planId: planId || "",
        }
      }
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    if (session.url) {
      redirect(session.url);
    } else {
      redirect("/app/dashboard?error=StripeError");
    }
  } catch (err) {
    console.error("Auto-checkout error:", err);
    redirect("/app/dashboard?error=CheckoutFailed");
  }
}

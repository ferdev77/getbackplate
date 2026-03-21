import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createSupabaseServerClient } from '@/infrastructure/supabase/client/server';
import { stripe } from '@/infrastructure/stripe/client';
import { isSuperadminImpersonating } from '@/shared/lib/impersonation';
import { logAuditEvent } from '@/shared/lib/audit';

export async function POST(request: Request) {
  try {
    const { priceId, planId } = await request.json();

    if (!priceId) {
      return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });
    }

    const headersList = request.headers;
    const host = headersList.get('host') || 'localhost:3000';
    const protocol = headersList.get('x-forwarded-proto') || 'http';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'AuthRequired', message: 'You must be logged in to subscribe.' }, { status: 401 });
    }

    if (await isSuperadminImpersonating(user.id)) {
      await logAuditEvent({
        action: 'organization.impersonation.blocked_checkout',
        entityType: 'stripe_checkout',
        eventDomain: 'security',
        outcome: 'denied',
        severity: 'high',
      });
      return NextResponse.json(
        { error: 'impersonation_blocked', message: 'No puedes gestionar billing en modo impersonacion.' },
        { status: 403 },
      );
    }

    let organizationId: string | null = null;
    let stripeCustomerId: string | undefined = undefined;
    let existingStripeSubscriptionId: string | null = null;

    // Fetch organization + existing Stripe mapping for this user
    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membership) {
      organizationId = membership.organization_id;

      const { data: stripeMapping } = await supabase
        .from('stripe_customers')
        .select('stripe_customer_id')
        .eq('organization_id', organizationId)
        .single();

      if (stripeMapping) {
        stripeCustomerId = stripeMapping.stripe_customer_id;
      }

      // Check if there's already an active subscription in our DB
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('stripe_subscription_id, status')
        .eq('organization_id', organizationId)
        .in('status', ['active', 'trialing'])
        .single();

      if (existingSub) {
        existingStripeSubscriptionId = existingSub.stripe_subscription_id;
      }
    }

    // ─────────────────────────────────────────────────────────
    // UPGRADE / DOWNGRADE PATH: User already has a subscription
    // Update the subscription item's price directly — no Checkout page needed
    // ─────────────────────────────────────────────────────────
    if (existingStripeSubscriptionId && stripeCustomerId) {
      const subscription = await stripe.subscriptions.retrieve(existingStripeSubscriptionId);
      const currentItemId = subscription.items.data[0].id;
      const currentPriceId = subscription.items.data[0].price.id;

      // If user clicked their own current plan, just open billing portal
      if (currentPriceId === priceId) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: stripeCustomerId,
          return_url: `${baseUrl}/app/dashboard`,
        });
        return NextResponse.json({ url: portalSession.url });
      }

      // Upgrade/downgrade: update subscription item to new price with proration
      await stripe.subscriptions.update(existingStripeSubscriptionId, {
        items: [{ id: currentItemId, price: priceId }],
        proration_behavior: 'create_prorations',
        metadata: {
          organizationId: organizationId || '',
          userId: user.id,
          planId: planId || '',
        },
      });

      // `customer.subscription.updated` webhook will fire and sync the plan in Supabase automatically
      return NextResponse.json({
        url: `${baseUrl}/app/dashboard?upgraded=true`,
        upgraded: true,
      });
    }

    // ─────────────────────────────────────────────────────────
    // NEW SUBSCRIPTION PATH: No active subscription yet
    // Create a fresh Stripe Checkout Session
    // ─────────────────────────────────────────────────────────
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/app/dashboard?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${baseUrl}/app/dashboard?canceled=true`,
      tax_id_collection: { enabled: true },
      client_reference_id: organizationId || 'guest',
      metadata: {
        organizationId: organizationId || '',
        userId: user?.id || '',
        planId: planId || '',
      },
      subscription_data: {
        metadata: {
          organizationId: organizationId || '',
          userId: user?.id || '',
          planId: planId || '',
        },
      },
    };

    if (stripeCustomerId) {
      sessionConfig.customer = stripeCustomerId;
      sessionConfig.customer_update = { name: 'auto', address: 'auto' };
    } else if (user.email) {
      sessionConfig.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return NextResponse.json({ sessionId: session.id, url: session.url });

  } catch (error: unknown) {
    console.error('Stripe Checkout Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

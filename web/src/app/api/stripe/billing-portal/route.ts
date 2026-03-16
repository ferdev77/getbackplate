import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { stripe } from '@/infrastructure/stripe/client';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Identify the user's active organization
    const { data: membership } = await supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No active organization found' }, { status: 400 });
    }

    // Look up their Stripe Customer ID in our DB
    const { data: stripeMapping } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('organization_id', membership.organization_id)
      .single();

    if (!stripeMapping || !stripeMapping.stripe_customer_id) {
      // It's possible they haven't bought anything yet
      return NextResponse.json({ error: 'No billing account found for this organization. Please purchase a plan first.' }, { status: 400 });
    }

    // Generate the portal link
    // The user will see their past invoices and can update cards
    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/plans`;
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeMapping.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: any) {
    console.error('Stripe Billing Portal Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

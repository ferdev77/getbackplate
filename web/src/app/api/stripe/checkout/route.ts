import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/infrastructure/supabase/client/server';
import { stripe } from '@/infrastructure/stripe/client';

export async function POST(request: Request) {
  try {
    const { priceId, planId } = await request.json();

    if (!priceId) {
      return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });
    }

    // Construir la URL base dinámicamente desde los headers de la request
    const headersList = request.headers;
    const host = headersList.get('host') || 'localhost:3000';
    const protocol = headersList.get('x-forwarded-proto') || 'http';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Enforce authentication before checkout
    if (!user) {
      return NextResponse.json({ error: 'AuthRequired', message: 'You must be logged in to subscribe.' }, { status: 401 });
    }

    // If the user is authenticated, we try to grab their organization
    let organizationId = null;
    let customerEmail = user?.email || undefined;
    let stripeCustomerId = undefined;
    const clientReferenceId = planId || undefined; // We can use this to know which plan they picked if we need to manually reconcile

    if (user) {
      // Find the active organization for this user
      const { data: membership } = await supabase
        .from('memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();
        
      if (membership) {
        organizationId = membership.organization_id;
        
        // Find if we already have a Stripe Customer mapped to this organization
        const { data: stripeMapping } = await supabase
          .from('stripe_customers')
          .select('stripe_customer_id')
          .eq('organization_id', organizationId)
          .single();
          
        if (stripeMapping) {
          stripeCustomerId = stripeMapping.stripe_customer_id;
        }
      }
    }

    // We configure the Stripe Session. 
    // IMPORTANT FOR US MARKET: Tax computation and Billing Address Collection
    const sessionConfig: any = {
      mode: 'subscription',
      payment_method_types: ['card'], // US mostly uses cards for B2B
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/app/dashboard?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${baseUrl}/app/dashboard?canceled=true`,
      
      // TAX settings for the US Market (requires Stripe Tax to be active in dashboard)
      // automatic_tax: { enabled: true },
      
      // Billing address collection is vital for Tax validation
      // billing_address_collection: 'required',
      
      // If we don't have a known customer yet, we force them to type it in Checkout.
      // Easiest is to always collect their TAX IDs (EIN in the US) automatically if we can
      tax_id_collection: {
        enabled: true,
      },
      
      // We pass our internal references so the webhook knows WHO paid
      client_reference_id: organizationId || 'guest',
      metadata: {
        organizationId: organizationId || '',
        userId: user?.id || '',
        planId: planId || '',
      }
    };

    if (stripeCustomerId) {
      sessionConfig.customer = stripeCustomerId;
      // We also want them to be able to update their customer info
      sessionConfig.customer_update = {
        name: 'auto',
        address: 'auto'
      };
    } else if (customerEmail) {
      sessionConfig.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Stripe Checkout Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

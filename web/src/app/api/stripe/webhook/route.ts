import { NextResponse } from 'next/server';
import { stripe } from '@/infrastructure/stripe/client';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';


export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret is not set in env variables.' }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed. ${err.message}`);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // We need a server-role client to bypass RLS since Webhooks are anonymous system calls
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        let organizationId = session.client_reference_id as string | null;
        
        // Sometimes client_reference_id gets lost or is 'guest', fallback to metadata
        if (!organizationId || organizationId === 'guest') {
            organizationId = session.metadata?.organizationId || null;
        }

        if (!organizationId) {
            console.error('No organization ID found in checkout session metadata. Cannot link customer.');
            break;
        }

        const stripeCustomerId = session.customer as string;

        // 1. Ensure the Customer is Mapped
        const { error: customerError } = await supabase
          .from('stripe_customers')
          .upsert(
            { organization_id: organizationId, stripe_customer_id: stripeCustomerId },
            { onConflict: 'organization_id' }
          );

        if (customerError) {
            console.error('Error linking Stripe customer to Organization:', customerError);
        }
        
        // 2. We can optionally fetch the subscription here, but 'customer.subscription.created/updated' 
        // will also fire right after checkout, so we can let those handlers do the work of creating the `subscriptions` row.

        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;
        
        // 1. Try to get organizationId from subscription METADATA first!
        // This solves race conditions if subscription.created arrives before checkout.session.completed mapped the customer.
        let organizationId = subscription.metadata?.organizationId;

        if (!organizationId) {
          // 2. Fallback to our database mapping if metadata is missing
          const { data: customerMapping } = await supabase
              .from('stripe_customers')
              .select('organization_id')
              .eq('stripe_customer_id', stripeCustomerId)
              .single();
              
          if (customerMapping) {
              organizationId = customerMapping.organization_id;
          }
        }
            
        if (!organizationId) {
            console.error(`Received subscription update for unknown customer ${stripeCustomerId} and no metadata`);
            break;
        }
        
        // Create or update mapping if we got it from metadata
        const { error: customerError } = await supabase
          .from('stripe_customers')
          .upsert(
            { organization_id: organizationId, stripe_customer_id: stripeCustomerId },
            { onConflict: 'organization_id' }
          );
        
        // Extract useful data
        const status = subscription.status;
        const priceId = subscription.items.data[0].price.id;
        const quantity = subscription.items.data[0].quantity || 1;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;
        
        // Stripe uses `current_period_start` and `current_period_end`
        const subAny = subscription as any;
        const currentPeriodStart = new Date(subAny.current_period_start * 1000).toISOString();
        const currentPeriodEnd = new Date(subAny.current_period_end * 1000).toISOString();
        
        // Fetch the corresponding internal plan_id using the price_id
        const { data: plan } = await supabase
            .from('plans')
            .select('id, max_branches, max_users, max_storage_mb, max_employees')
            .eq('stripe_price_id', priceId)
            .maybeSingle();

        const isActive = ['active', 'trialing'].includes(status);

        if (plan && isActive) {
            const planId = plan.id;
            
            // 1. Update organization plan
            await supabase.from('organizations').update({ plan_id: planId }).eq('id', organizationId);
            
            // 2. Sync Plan Limits
            await supabase.from('organization_limits').upsert({
                organization_id: organizationId,
                max_branches: plan.max_branches ?? null,
                max_users: plan.max_users ?? null,
                max_storage_mb: plan.max_storage_mb ?? null,
                max_employees: plan.max_employees ?? null,
            }, { onConflict: 'organization_id' });

            // 3. Sync Plan Modules
            const { data: modules } = await supabase.from('module_catalog').select('id, is_core');
            const { data: planModules } = await supabase.from('plan_modules').select('module_id').eq('plan_id', planId).eq('is_enabled', true);
            const planModuleIds = new Set((planModules || []).map((m: any) => m.module_id));

            if (modules?.length) {
                await supabase.from('organization_modules').upsert(
                    modules.map((mod: any) => {
                        const shouldEnable = Boolean(mod.is_core) || planModuleIds.has(mod.id);
                        return {
                            organization_id: organizationId,
                            module_id: mod.id,
                            is_enabled: shouldEnable,
                            enabled_at: shouldEnable ? new Date().toISOString() : null,
                        };
                    }),
                    { onConflict: 'organization_id,module_id' }
                );
            }
        } else if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') {
             // Revert Plan to null if subscription dies
             await supabase.from('organizations').update({ plan_id: null }).eq('id', organizationId);
             
             // Sync modules down to just core
             const { data: modules } = await supabase.from('module_catalog').select('id, is_core');
             if (modules?.length) {
                await supabase.from('organization_modules').upsert(
                    modules.map((mod: any) => {
                        const shouldEnable = Boolean(mod.is_core);
                        return {
                            organization_id: organizationId,
                            module_id: mod.id,
                            is_enabled: shouldEnable,
                            enabled_at: shouldEnable ? new Date().toISOString() : null,
                        };
                    }),
                    { onConflict: 'organization_id,module_id' }
                );
             }
        }
        
        // Upsert into `subscriptions` table
        const { error: subError } = await supabase
            .from('subscriptions')
            .upsert({
                organization_id: organizationId,
                stripe_subscription_id: subscription.id,
                stripe_customer_id: stripeCustomerId,
                status: status,
                price_id: priceId,
                quantity: quantity,
                cancel_at_period_end: cancelAtPeriodEnd,
                current_period_start: currentPeriodStart,
                current_period_end: currentPeriodEnd
            }, { onConflict: 'stripe_subscription_id' });
            
        if (subError) {
            console.error('Error upserting subscription:', subError);
        }

        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Error processing webhook:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

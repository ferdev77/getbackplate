/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { stripe } from '@/infrastructure/stripe/client';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { 
  sendRenewalReminderEmail, 
  sendPaymentFailedEmail 
} from '@/modules/billing/services/billing-notifications.service';
import { sendPlanChangeAppliedEmail } from '@/modules/billing/services/plan-change-notifications.service';

const processedStripeEvents = new Map<string, number>();
const PROCESS_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

function hasBeenProcessed(eventId: string) {
  const processedAt = processedStripeEvents.get(eventId);
  if (!processedAt) return false;
  if (Date.now() - processedAt > PROCESS_EVENT_TTL_MS) {
    processedStripeEvents.delete(eventId);
    return false;
  }
  return true;
}

function markProcessed(eventId: string) {
  processedStripeEvents.set(eventId, Date.now());

  if (processedStripeEvents.size > 2000) {
    const now = Date.now();
    for (const [id, timestamp] of processedStripeEvents.entries()) {
      if (now - timestamp > PROCESS_EVENT_TTL_MS) {
        processedStripeEvents.delete(id);
      }
    }
  }
}

function mapStripeIntervalToBillingPeriod(interval: string | null | undefined): 'monthly' | 'yearly' {
  return interval === 'year' ? 'yearly' : 'monthly';
}

function extractPreviousPriceId(previousAttributes: any): string | null {
  try {
    const previousItems = previousAttributes?.items?.data;
    if (!Array.isArray(previousItems) || previousItems.length === 0) return null;

    const firstItem = previousItems[0];
    const price = firstItem?.price;

    if (typeof price === 'string') return price;
    if (price && typeof price.id === 'string') return price.id;

    return null;
  } catch {
    return null;
  }
}


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

  console.log(`[Webhook] Received event: ${event.type} (id: ${event.id})`);

  if (hasBeenProcessed(event.id)) {
    console.log(`[Webhook] Duplicate event ignored: ${event.id}`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {

      // -------------------------------------------------------
      // PRIMARY HANDLER: Process everything when checkout is done
      // This is more reliable than subscription.created because
      // we have full context (session metadata, customer, etc.)
      // -------------------------------------------------------
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        console.log(`[Webhook] checkout.session.completed - customer: ${session.customer}, subscription: ${session.subscription}`);

        const organizationId = session.metadata?.organizationId || (session.client_reference_id as string | null);
        let planId = session.metadata?.planId || null;

        if (!organizationId) {
            console.error('[Webhook] No organizationId found in checkout session metadata or client_reference_id. Aborting.');
            break;
        }

        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        // 1. Map the stripe customer to our organization
        const { error: custErr } = await supabase
          .from('stripe_customers')
          .upsert(
            { organization_id: organizationId, stripe_customer_id: stripeCustomerId },
            { onConflict: 'organization_id' }
          );
        if (custErr) console.error('[Webhook] Error linking stripe customer:', custErr);
        else console.log('[Webhook] stripe_customers upserted OK');

        // 2. Fetch the full subscription object from Stripe to get pricing and status
        if (!stripeSubscriptionId) {
            console.log('[Webhook] No subscription in session (maybe one-time payment). Skipping subscription sync.');
            break;
        }

        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const status = subscription.status;
        const priceId = subscription.items.data[0].price.id;
        const billingPeriod = mapStripeIntervalToBillingPeriod(subscription.items.data[0].price.recurring?.interval);
        const quantity = subscription.items.data[0].quantity || 1;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;

        // Handle dates — Stripe API v2026-02-25 uses start_date/billing_cycle_anchor
        const subAny = subscription as any;
        const periodStartRaw = subAny.current_period_start ?? subAny.start_date ?? subAny.billing_cycle_anchor;
        const periodEndRaw = subAny.current_period_end ?? null;
        let currentPeriodStart = new Date().toISOString();
        let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        if (periodStartRaw) { try { currentPeriodStart = new Date(periodStartRaw * 1000).toISOString(); } catch {} }
        if (periodEndRaw) { try { currentPeriodEnd = new Date(periodEndRaw * 1000).toISOString(); } catch {} }

        console.log(`[Webhook] Subscription status: ${status}, priceId: ${priceId}`);

        // 3. Look up the internal plan via price_id (or use the one from metadata)
        if (!planId) {
            const { data: planData } = await supabase
                .from('plans')
                .select('id, max_branches, max_users, max_storage_mb, max_employees')
                .eq('stripe_price_id', priceId)
                .maybeSingle();
            if (planData) planId = planData.id;
        }

        const isActive = ['active', 'trialing'].includes(status);

        if (planId && isActive) {
            // 4. Fetch full plan data for limits
            const { data: planData } = await supabase
                .from('plans')
                .select('id, max_branches, max_users, max_storage_mb, max_employees')
                .eq('id', planId)
                .maybeSingle();

            // 5. Update organization plan
            const { error: orgErr } = await supabase.from('organizations').update({ plan_id: planId }).eq('id', organizationId);
            if (orgErr) console.error('[Webhook] Error updating org plan:', orgErr);
            else console.log('[Webhook] Organization plan updated OK');

            // 6. Sync plan limits
            if (planData) {
                const { error: limErr } = await supabase.from('organization_limits').upsert({
                    organization_id: organizationId,
                    max_branches: planData.max_branches ?? null,
                    max_users: planData.max_users ?? null,
                    max_storage_mb: planData.max_storage_mb ?? null,
                    max_employees: planData.max_employees ?? null,
                }, { onConflict: 'organization_id' });
                if (limErr) console.error('[Webhook] Error syncing limits:', limErr);
                else console.log('[Webhook] organization_limits upserted OK');

                await supabase.from('organization_settings').upsert(
                    {
                        organization_id: organizationId,
                        billing_period: billingPeriod,
                    },
                    { onConflict: 'organization_id' },
                );
            }

            // 7. Sync modules
            const { data: modules } = await supabase.from('module_catalog').select('id, is_core');
            const { data: planModules } = await supabase.from('plan_modules').select('module_id').eq('plan_id', planId).eq('is_enabled', true);
            const planModuleIds = new Set((planModules || []).map((m: any) => m.module_id));

            if (modules?.length) {
                const { error: modErr } = await supabase.from('organization_modules').upsert(
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
                if (modErr) console.error('[Webhook] Error syncing modules:', modErr);
                else console.log('[Webhook] organization_modules upserted OK');
            }
        }

        // 8. Upsert subscription record
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

        if (subError) console.error('[Webhook] Error upserting subscription:', subError);
        else console.log('[Webhook] subscriptions upserted OK');

        break;
      }

      // -------------------------------------------------------
      // SECONDARY HANDLER: Handle subscription updates/cancellations
      // (not initial creation — that's handled in checkout.session.completed)
      // -------------------------------------------------------
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        let organizationId = subscription.metadata?.organizationId;

        if (!organizationId) {
          const { data: customerMapping } = await supabase
              .from('stripe_customers')
              .select('organization_id')
              .eq('stripe_customer_id', stripeCustomerId)
              .single();
          if (customerMapping) organizationId = customerMapping.organization_id;
        }

        if (!organizationId) {
            console.error(`[Webhook] No organizationId for subscription event on customer ${stripeCustomerId}`);
            break;
        }

        const status = subscription.status;
        const priceId = subscription.items.data[0].price.id;
        const billingPeriod = mapStripeIntervalToBillingPeriod(subscription.items.data[0].price.recurring?.interval);
        const quantity = subscription.items.data[0].quantity || 1;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;

        const subAny = subscription as any;
        const periodStartRaw = subAny.current_period_start ?? subAny.start_date ?? subAny.billing_cycle_anchor;
        const periodEndRaw = subAny.current_period_end ?? null;
        let currentPeriodStart = new Date().toISOString();
        let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        if (periodStartRaw) { try { currentPeriodStart = new Date(periodStartRaw * 1000).toISOString(); } catch {} }
        if (periodEndRaw) { try { currentPeriodEnd = new Date(periodEndRaw * 1000).toISOString(); } catch {} }

        const isActive = ['active', 'trialing'].includes(status);
        const isCanceled = ['canceled', 'unpaid', 'incomplete_expired'].includes(status);
        const targetPlanIdFromMeta = typeof subscription.metadata?.planId === 'string' ? subscription.metadata.planId : null;

        if (isCanceled) {
            await supabase.from('organizations').update({ plan_id: null }).eq('id', organizationId);
            const { data: modules } = await supabase.from('module_catalog').select('id, is_core');
            if (modules?.length) {
                await supabase.from('organization_modules').upsert(
                    modules.map((mod: any) => ({
                        organization_id: organizationId,
                        module_id: mod.id,
                        is_enabled: Boolean(mod.is_core),
                        enabled_at: Boolean(mod.is_core) ? new Date().toISOString() : null,
                    })),
                    { onConflict: 'organization_id,module_id' }
                );
            }
        } else if (isActive) {
            let planData: {
              id: string;
              max_branches: number | null;
              max_users: number | null;
              max_storage_mb: number | null;
              max_employees: number | null;
            } | null = null;

            if (targetPlanIdFromMeta) {
                const { data: byId } = await supabase
                    .from('plans')
                    .select('id, max_branches, max_users, max_storage_mb, max_employees')
                    .eq('id', targetPlanIdFromMeta)
                    .maybeSingle();
                planData = byId;
            }

            if (!planData) {
                const { data: byPrice } = await supabase
                    .from('plans')
                    .select('id, max_branches, max_users, max_storage_mb, max_employees')
                    .eq('stripe_price_id', priceId)
                    .maybeSingle();
                planData = byPrice;
            }

            if (planData) {
                // Update org plan
                await supabase.from('organizations').update({ plan_id: planData.id }).eq('id', organizationId);

                // Sync limits
                await supabase.from('organization_limits').upsert({
                    organization_id: organizationId,
                    max_branches: planData.max_branches ?? null,
                    max_users: planData.max_users ?? null,
                    max_storage_mb: planData.max_storage_mb ?? null,
                    max_employees: planData.max_employees ?? null,
                }, { onConflict: 'organization_id' });

                await supabase.from('organization_settings').upsert(
                    {
                        organization_id: organizationId,
                        billing_period: billingPeriod,
                    },
                    { onConflict: 'organization_id' },
                );

                // Sync modules for the new plan
                const { data: allModules } = await supabase.from('module_catalog').select('id, is_core');
                const { data: planModules } = await supabase.from('plan_modules').select('module_id').eq('plan_id', planData.id).eq('is_enabled', true);
                const planModuleIds = new Set((planModules || []).map((m: any) => m.module_id));

                if (allModules?.length) {
                    const { error: modErr } = await supabase.from('organization_modules').upsert(
                        allModules.map((mod: any) => {
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
                    if (modErr) console.error('[Webhook] Error syncing modules on upgrade:', modErr);
                    else console.log('[Webhook] Modules synced on plan upgrade OK');
                }
            }
        }


        await supabase.from('subscriptions').upsert({
            organization_id: organizationId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: stripeCustomerId,
            status,
            price_id: priceId,
            quantity,
            cancel_at_period_end: cancelAtPeriodEnd,
            current_period_start: currentPeriodStart,
            current_period_end: currentPeriodEnd,
        }, { onConflict: 'stripe_subscription_id' });

        if (event.type === 'customer.subscription.updated' && isActive) {
            const prevAttributes = event.data.previous_attributes as any;
            const previousPriceId = extractPreviousPriceId(prevAttributes);
            const actorUserId = typeof subscription.metadata?.userId === 'string' ? subscription.metadata.userId : null;

            if (previousPriceId && previousPriceId !== priceId) {
                const applyEmailResult = await sendPlanChangeAppliedEmail({
                    organizationId,
                    actorUserId,
                    previousPriceId,
                    targetPlanId: targetPlanIdFromMeta,
                    targetPriceId: priceId,
                });

                if (!applyEmailResult.ok) {
                    console.error(`[Webhook] Failed to send applied plan-change email: ${applyEmailResult.error}`);
                } else {
                    console.log(`[Webhook] Applied plan-change email sent to actor for org ${organizationId}`);
                }
            }
        }

        console.log(`[Webhook] subscription.${event.type.split('.')[2]} processed for org ${organizationId}`);
        break;
      }

      // -------------------------------------------------------
      // TERTIARY HANDLERS: Invoices (Upcoming renewals, Payment Failures)
      // -------------------------------------------------------
      case 'invoice.upcoming':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        // Find the organization from the customer ID mapping
        const { data: customerMapping } = await supabase
            .from('stripe_customers')
            .select('organization_id')
            .eq('stripe_customer_id', stripeCustomerId)
            .single();

        const organizationId = customerMapping?.organization_id;

        if (!organizationId) {
            console.error(`[Webhook] No organizationId for invoice event on customer ${stripeCustomerId}`);
            break;
        }

        if (event.type === 'invoice.upcoming') {
            const amountStr = new Intl.NumberFormat('es-AR', { style: 'currency', currency: invoice.currency.toUpperCase() }).format(invoice.amount_due / 100);
            const renewalDate = new Date(invoice.period_end * 1000).toLocaleDateString('es-AR');
            
            await sendRenewalReminderEmail(organizationId, renewalDate, amountStr);
            console.log(`[Webhook] Sent renewal reminder for org ${organizationId}`);
        } else if (event.type === 'invoice.payment_failed') {
            const retryLink = invoice.hosted_invoice_url || `${process.env.APP_BASE_URL}/app/billing`;
            
            await sendPaymentFailedEmail(organizationId, retryLink);
            console.log(`[Webhook] Sent payment failed email for org ${organizationId}`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err: any) {
    console.error(`[Webhook] Unhandled error processing event ${event.type}:`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  markProcessed(event.id);

  return NextResponse.json({ received: true });
}

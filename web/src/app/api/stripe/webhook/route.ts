// Stripe Webhook Handler — typed, no as any
import { NextResponse } from 'next/server';
import { stripe } from '@/infrastructure/stripe/client';
import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/infrastructure/supabase/client/admin';
import { syncOrganizationPlan } from '@/modules/organizations/services/organization.service';
import { 
  sendRenewalReminderEmail, 
  sendPaymentFailedEmail,
  sendSubscriptionActivatedEmail,
} from '@/modules/billing/services/billing-notifications.service';
import { sendPlanChangeAppliedEmail } from '@/modules/billing/services/plan-change-notifications.service';
import { billInvoiceUsageForRenewal } from '@/modules/integrations/qbo-r365/usage-billing';
import { logAuditEvent } from '@/shared/lib/audit';

// Deduplication is handled via the stripe_processed_events table in Supabase.
// This works correctly across all Vercel serverless instances (unlike an in-memory Map).

function mapStripeIntervalToBillingPeriod(interval: string | null | undefined): 'monthly' | 'yearly' {
  return interval === 'year' ? 'yearly' : 'monthly';
}

function extractPreviousPriceId(previousAttributes: Partial<Stripe.Subscription> | undefined): string | null {
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

/**
 * Compute the real period end based on subscription interval and trial status.
 * Stripe API v2026-02-25 removed current_period_start/end — we must derive them.
 */
function computePeriodEnd(
  periodStartSeconds: number,
  interval: string | null | undefined,
  trialEnd: number | null | undefined,
): string {
  // If there's an active trial, use its end date
  if (trialEnd && trialEnd > 0) {
    try { return new Date(trialEnd * 1000).toISOString(); } catch { /* fall through */ }
  }

  const start = periodStartSeconds > 0
    ? new Date(periodStartSeconds * 1000)
    : new Date();

  switch (interval) {
    case 'year':
      start.setFullYear(start.getFullYear() + 1);
      break;
    case 'week':
      start.setDate(start.getDate() + 7);
      break;
    case 'day':
      start.setDate(start.getDate() + 1);
      break;
    case 'month':
    default:
      start.setMonth(start.getMonth() + 1);
      break;
  }

  return start.toISOString();
}

async function executeManualAction(
  orgId: string,
  actionType: string,
  actionPayload: Record<string, unknown>,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  if (actionType === 'activate_module') {
    const moduleCode = String(actionPayload.moduleCode ?? '');
    if (!moduleCode) return;
    const { data: moduleRow } = await supabase
      .from('module_catalog')
      .select('id')
      .eq('code', moduleCode)
      .maybeSingle();
    if (moduleRow) {
      const { error: modErr } = await supabase
        .from('organization_modules')
        .upsert(
          { organization_id: orgId, module_id: moduleRow.id, is_enabled: true, enabled_at: new Date().toISOString() },
          { onConflict: 'organization_id,module_id' },
        );
      if (modErr) console.error(`[Webhook][manual] Error enabling module ${moduleCode}:`, modErr);
      else console.info(`[Webhook][manual] Module "${moduleCode}" enabled for org ${orgId}`);
    } else {
      console.error(`[Webhook][manual] Module code "${moduleCode}" not found in catalog`);
    }
  } else if (actionType === 'add_invoices') {
    const count = Number(actionPayload.invoiceCount ?? 0);
    if (count <= 0) return;
    const { error: invErr } = await supabase.rpc('increment_invoice_balance', {
      p_organization_id: orgId,
      p_amount: count,
    });
    if (invErr) {
      console.warn('[Webhook][manual] RPC increment_invoice_balance failed, trying direct update:', invErr);
      const { data: addonRow } = await supabase
        .from('organization_addons')
        .select('id, invoice_balance')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .maybeSingle();
      if (addonRow) {
        await supabase
          .from('organization_addons')
          .update({ invoice_balance: (addonRow.invoice_balance ?? 0) + count })
          .eq('id', addonRow.id);
      }
    }
    console.info(`[Webhook][manual] invoice_balance +${count} for org ${orgId}`);
  } else if (actionType === 'add_slot') {
    const count = Number(actionPayload.slotCount ?? 1);
    if (count <= 0) return;
    const { error: slotErr } = await supabase.rpc('increment_r365_slots', {
      p_organization_id: orgId,
      p_amount: count,
    });
    if (slotErr) {
      console.warn('[Webhook][manual] RPC increment_r365_slots failed, trying direct update:', slotErr);
      const { data: addonRow } = await supabase
        .from('organization_addons')
        .select('id, extra_r365_connections')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .maybeSingle();
      if (addonRow) {
        await supabase
          .from('organization_addons')
          .update({ extra_r365_connections: ((addonRow.extra_r365_connections as number) ?? 0) + count })
          .eq('id', addonRow.id);
      }
    }
    console.info(`[Webhook][manual] extra_r365_connections +${count} for org ${orgId}`);
  }
  // 'custom': payment recorded, no automatic side-effect
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Webhook signature verification failed. ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // We need a server-role client to bypass RLS since Webhooks are anonymous system calls
  const supabase = createSupabaseAdminClient();

  console.info(`[Webhook] Received event: ${event.type} (id: ${event.id})`);

  // Deduplication + lock (atomic): reserve event_id before any processing.
  // If another instance already reserved/processed it, Postgres unique key blocks duplicates.
  const { data: reservation, error: reservationError } = await supabase
    .from('stripe_processed_events')
    .insert({ event_id: event.id })
    .select('event_id')
    .maybeSingle();

  if (reservationError) {
    if (reservationError.code === '23505') {
      console.info(`[Webhook] Duplicate event ignored: ${event.id}`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    console.error(`[Webhook] Failed to reserve event ${event.id}:`, reservationError);
    return NextResponse.json({ error: 'Failed to reserve webhook event' }, { status: 500 });
  }

  if (!reservation) {
    console.info(`[Webhook] Duplicate event ignored (no reservation): ${event.id}`);
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

        console.info(`[Webhook] checkout.session.completed - customer: ${session.customer}, subscription: ${session.subscription}`);

        // ── REGISTRO DE ACEPTACION DE TERMINOS ────────────────────
        // Si la sesion tenia consent_collection.terms_of_service: "required"
        // (ver web/src/shared/lib/legal-consent.ts) y el cliente lo acepto,
        // dejamos constancia en audit_logs. No incluye IP (Stripe no la expone
        // via API), solo fecha, organizacion, email y version del documento.
        if (session.consent?.terms_of_service === 'accepted') {
          await logAuditEvent({
            action: 'organization.billing.terms_accepted',
            entityType: 'stripe_checkout',
            organizationId: session.metadata?.organizationId ?? null,
            eventDomain: 'settings',
            outcome: 'success',
            severity: 'low',
            metadata: {
              customer_email: session.customer_details?.email ?? null,
              legal_version: session.metadata?.legalVersion ?? null,
              stripe_session_id: session.id,
            },
          });
        }

        // ── MANUAL SUBSCRIPTION ORDER (tracking only) ─────────────
        // Created from superadmin/payment-links "Links de Suscripción". The
        // actual provisioning runs unchanged in the addon/platform branches
        // below — this only marks the link as completed for the superadmin UI.
        const manualSubscriptionOrderId = session.metadata?.manualSubscriptionOrderId ?? null;
        const markManualSubscriptionOrderCompleted = async () => {
          if (!manualSubscriptionOrderId) return;
          const { error } = await supabase
            .from('manual_subscription_orders')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', manualSubscriptionOrderId)
            .eq('status', 'pending');
          if (error) console.error('[Webhook][manual-subscription] Error marking order completed:', error);
        };

        // ── MANUAL PAYMENT ORDER ─────────────────────────────────
        // Created from superadmin/payment-links. One-time payment mode.
        // Actions are stored in the DB items column (new orders) or metadata (legacy).
        if (session.metadata?.manualPaymentOrderId) {
          const orderId = session.metadata.manualPaymentOrderId;
          const orgId   = session.metadata.organizationId;

          console.info(`[Webhook][manual] orderId=${orderId} orgId=${orgId}`);

          // Mark order as paid
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent as { id: string } | null)?.id ?? null;
          const customerEmail = session.customer_details?.email ?? null;

          const { data: paidOrder, error: paidErr } = await supabase
            .from('manual_payment_orders')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id: paymentIntentId,
              customer_email: customerEmail,
            })
            .eq('id', orderId)
            .eq('status', 'pending')
            .select('id')
            .maybeSingle();
          if (paidErr) console.error('[Webhook][manual] Error marking order paid:', paidErr);
          if (!paidOrder) {
            console.info(`[Webhook][manual] Ignoring non-pending or missing order ${orderId}`);
            break;
          }

          if (orgId) {
            // Fetch order to get items[] (new orders) or fall back to metadata (legacy)
            type StoredItem = { action_type: string; action_payload: Record<string, unknown> | null };
            const { data: orderRecord } = await supabase
              .from('manual_payment_orders')
              .select('items, action_type, action_payload')
              .eq('id', orderId)
              .maybeSingle();

            const storedItems = orderRecord?.items as StoredItem[] | null;

            if (storedItems && storedItems.length > 0) {
              for (const item of storedItems) {
                await executeManualAction(orgId, item.action_type, item.action_payload ?? {}, supabase);
              }
            } else {
              // Legacy single-item order: read action from session metadata
              let legacyPayload: Record<string, unknown> = {};
              try {
                if (session.metadata.actionPayload) {
                  legacyPayload = JSON.parse(session.metadata.actionPayload) as Record<string, unknown>;
                }
              } catch {
                console.error('[Webhook][manual] Could not parse legacy actionPayload JSON');
              }
              const legacyActionType = session.metadata.actionType ?? 'custom';
              await executeManualAction(orgId, legacyActionType, legacyPayload, supabase);
            }
          }

          break;
        }
        // ── END MANUAL PAYMENT ORDER ─────────────────────────────

        // ── ADD-ON CHECKOUT ──────────────────────────────────────
        if (session.metadata?.isAddon === 'true') {
          const addonOrgId = session.metadata?.organizationId;
          const addonModuleId = session.metadata?.moduleId;
          const addonModuleCode = session.metadata?.moduleCode;
          const addonStripeCustomerId = session.customer as string;
          const addonStripeSubscriptionId = session.subscription as string;

          if (!addonOrgId || !addonModuleId) {
            console.error('[Webhook][addon] Missing organizationId or moduleId in session metadata');
            break;
          }

          // Ensure stripe_customers mapping exists
          await supabase.from('stripe_customers').upsert(
            { organization_id: addonOrgId, stripe_customer_id: addonStripeCustomerId },
            { onConflict: 'organization_id' },
          );

          const integrationPlanId = session.metadata?.integrationPlanId ?? null;
          const setupFeePaidMeta = session.metadata?.setupFeePaid === 'true';
          const setupFeeAmountMeta = session.metadata?.setupFeeAmount
            ? Number(session.metadata.setupFeeAmount)
            : null;

          // Upsert the addon subscription record
          const { error: addonErr } = await supabase.from('organization_addons').upsert(
            {
              organization_id: addonOrgId,
              module_id: addonModuleId,
              stripe_subscription_id: addonStripeSubscriptionId,
              stripe_customer_id: addonStripeCustomerId,
              status: 'active',
              ...(integrationPlanId ? { integration_plan_id: integrationPlanId } : {}),
              ...(setupFeePaidMeta ? { setup_fee_paid: true, setup_fee_amount: setupFeeAmountMeta } : {}),
            },
            { onConflict: 'organization_id,module_id' },
          );
          if (addonErr) console.error('[Webhook][addon] Error upserting organization_addons:', addonErr);

          // ── EXTRA CONNECTION SLOTS (recurring, sumadas en el alta nueva) ─────
          // Mismo mecanismo que el slot de pago unico (actionType "add_slot"),
          // reusado aca para el item recurrente de $80/mes agregado en
          // checkout-manual-subscription. Ver web/src/app/legal/integration/msa
          // Schedule B ("Additional Connection Fee").
          const extraSlotCount = Number(session.metadata?.extraSlotCount ?? 0);
          if (extraSlotCount > 0) {
            const { error: slotErr } = await supabase.rpc('increment_r365_slots', {
              p_organization_id: addonOrgId,
              p_amount: extraSlotCount,
            });
            if (slotErr) {
              console.warn('[Webhook][addon] RPC increment_r365_slots failed, trying direct update:', slotErr);
              const { data: addonRow } = await supabase
                .from('organization_addons')
                .select('id, extra_r365_connections')
                .eq('organization_id', addonOrgId)
                .eq('module_id', addonModuleId)
                .maybeSingle();
              if (addonRow) {
                await supabase
                  .from('organization_addons')
                  .update({ extra_r365_connections: ((addonRow.extra_r365_connections as number) ?? 0) + extraSlotCount })
                  .eq('id', addonRow.id);
              }
            }
            console.info(`[Webhook][addon] extra_r365_connections +${extraSlotCount} for org ${addonOrgId}`);
          }
          // ── END EXTRA CONNECTION SLOTS ────────────────────────────────────────

          // Enable the module for the organization.
          // Also fetch addon_companion_module_codes so we can provision companion
          // modules when the org has no active plan (see below).
          const { data: moduleRow } = await supabase
            .from('module_catalog')
            .select('id, addon_companion_module_codes')
            .eq('id', addonModuleId)
            .maybeSingle();

          if (moduleRow) {
            const { error: modErr } = await supabase.from('organization_modules').upsert(
              {
                organization_id: addonOrgId,
                module_id: addonModuleId,
                is_enabled: true,
                enabled_at: new Date().toISOString(),
              },
              { onConflict: 'organization_id,module_id' },
            );
            if (modErr) console.error('[Webhook][addon] Error enabling module:', modErr);
            else console.info(`[Webhook][addon] Module ${addonModuleCode} enabled for org ${addonOrgId}`);

            // ── COMPANION MODULES (sin plan activo) ───────────────────────────
            // Si la organización no tiene un plan asignado (plan_id IS NULL) y el
            // add-on define módulos compañeros, los provisionamos ahora.
            // Esto replica el comportamiento manual que se hizo para empresas como
            // Prodel, permitiendo que settings y custom_branding queden activos
            // sin necesidad de intervención del superadmin.
            const companionCodes: string[] = (moduleRow as { addon_companion_module_codes?: string[] }).addon_companion_module_codes ?? [];

            if (companionCodes.length > 0) {
              const { data: orgRow } = await supabase
                .from('organizations')
                .select('plan_id')
                .eq('id', addonOrgId)
                .maybeSingle();

              if (!orgRow?.plan_id) {
                // Org without a plan: resolve companion module IDs and activate them
                const { data: companionModules, error: companionLookupErr } = await supabase
                  .from('module_catalog')
                  .select('id, code')
                  .in('code', companionCodes);

                if (companionLookupErr) {
                  console.error('[Webhook][addon] Error looking up companion modules:', companionLookupErr);
                } else if (companionModules && companionModules.length > 0) {
                  for (const companion of companionModules) {
                    const { error: companionErr } = await supabase.from('organization_modules').upsert(
                      {
                        organization_id: addonOrgId,
                        module_id: companion.id,
                        is_enabled: true,
                        enabled_at: new Date().toISOString(),
                      },
                      { onConflict: 'organization_id,module_id' },
                    );
                    if (companionErr) {
                      console.error(`[Webhook][addon] Error enabling companion module ${companion.code}:`, companionErr);
                    } else {
                      console.info(`[Webhook][addon] Companion module "${companion.code}" enabled for org ${addonOrgId} (no active plan)`);
                    }
                  }
                }
              }
            }
            // ── END COMPANION MODULES ─────────────────────────────────────────
          }

          // ── SYNC integration_plan_id en organizations ────────────────────────
          if (integrationPlanId) {
            await supabase
              .from('organizations')
              .update({ integration_plan_id: integrationPlanId })
              .eq('id', addonOrgId);
            console.info(`[Webhook][addon] organizations.integration_plan_id set to ${integrationPlanId} for org ${addonOrgId}`);
          }
          // ── END SYNC ──────────────────────────────────────────────────────────

          if (integrationPlanId) {
            const { data: orgRow } = await supabase
              .from('organizations')
              .select('plan_id')
              .eq('id', addonOrgId)
              .maybeSingle();

            const syncResult = await syncOrganizationPlan({
              organizationId: addonOrgId,
              planId: orgRow?.plan_id ?? null,
              integrationPlanId,
              skipPlanLimitCheck: true,
            });

            if (!syncResult.ok) {
              console.error(`[Webhook][addon] Failed to sync dual-plan modules for org ${addonOrgId}: ${syncResult.message}`);
            }
          }

          // ── BILLING GATE: integration-only orgs must never be blocked ────────
          // Integration plans live in organization_addons, not in subscriptions.
          // The billing gate only reads subscriptions, so orgs without a platform
          // plan would always get isBlocked=true (reason: subscription_missing).
          // Clearing billing_onboarding_required ensures the gate returns
          // reason="not_required" and never blocks the dashboard.
          await supabase
            .from('organizations')
            .update({ billing_onboarding_required: false })
            .eq('id', addonOrgId)
            .is('plan_id', null); // only if they have no platform plan — don't touch platform customers
          console.info(`[Webhook][addon] billing_onboarding_required cleared for integration-only org ${addonOrgId}`);
          // ── END BILLING GATE FIX ─────────────────────────────────────────────

          await markManualSubscriptionOrderCompleted();

          break;
        }
        // ── END ADD-ON CHECKOUT ──────────────────────────────────

        const organizationId = session.metadata?.organizationId || (session.client_reference_id as string | null);
        let planId = session.metadata?.planId || null;

        if (!organizationId) {
            console.error('[Webhook] No organizationId found in checkout session metadata or client_reference_id. Aborting.');
            break;
        }

        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;
        const trialDaysFromMetadata = Number.parseInt(session.metadata?.trialDays || '0', 10);

        const { data: existingActiveBefore } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('organization_id', organizationId)
          .in('status', ['active', 'trialing'])
          .limit(1);
        const hadActiveSubscriptionBefore = Array.isArray(existingActiveBefore) && existingActiveBefore.length > 0;

        // 1. Map the stripe customer to our organization
        const { error: custErr } = await supabase
          .from('stripe_customers')
          .upsert(
            { organization_id: organizationId, stripe_customer_id: stripeCustomerId },
            { onConflict: 'organization_id' }
          );
        if (custErr) console.error('[Webhook] Error linking stripe customer:', custErr);
        else console.info('[Webhook] stripe_customers upserted OK');

        // 2. Fetch the full subscription object from Stripe to get pricing and status
        if (!stripeSubscriptionId) {
            console.info('[Webhook] No subscription in session (maybe one-time payment). Skipping subscription sync.');
            break;
        }

        const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const status = subscription.status;
        const priceId = subscription.items.data[0].price.id;
        const billingPeriod = mapStripeIntervalToBillingPeriod(subscription.items.data[0].price.recurring?.interval);
        const quantity = subscription.items.data[0].quantity || 1;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;

        // Handle dates — Stripe API v2026-02-25 uses billing_cycle_anchor / start_date
        // current_period_start and current_period_end were removed from the API in v2026-02-25
        const periodStartRaw: number = subscription.billing_cycle_anchor ?? subscription.start_date;
        let currentPeriodStart = new Date().toISOString();
        if (periodStartRaw) { try { currentPeriodStart = new Date(periodStartRaw * 1000).toISOString(); } catch {} }
        const interval = subscription.items.data[0].price.recurring?.interval ?? null;
        const currentPeriodEnd = computePeriodEnd(periodStartRaw, interval, subscription.trial_end);

        console.info(`[Webhook] Subscription status: ${status}, priceId: ${priceId}`);

        // 3. Look up the internal plan via price_id (or use the one from metadata)
        if (!planId) {
            const { data: planData } = await supabase
                .from('plans')
                .select('id, name, max_branches, max_users, max_storage_mb, max_employees')
                .eq('stripe_price_id', priceId)
                .maybeSingle();
            if (planData) planId = planData.id;
        }

        const isActive = ['active', 'trialing'].includes(status);

        if (planId && isActive) {
            // 4. Fetch full plan data for limits
            const [{ data: planData }, { data: currentOrg }] = await Promise.all([
                supabase
                    .from('plans')
                    .select('id, name, max_branches, max_users, max_storage_mb, max_employees')
                    .eq('id', planId)
                    .maybeSingle(),
                supabase
                    .from('organizations')
                    .select('integration_plan_id')
                    .eq('id', organizationId)
                    .maybeSingle(),
            ]);

            // 5. Update organization plan
            const { error: orgErr } = await supabase
              .from('organizations')
              .update({
                plan_id: planId,
                billing_activation_status: 'active',
                billing_activated_at: new Date().toISOString(),
              })
              .eq('id', organizationId);
            if (orgErr) console.error('[Webhook] Error updating org plan:', orgErr);
            else console.info('[Webhook] Organization plan updated OK');

            if (planData) {
                const syncResult = await syncOrganizationPlan({
                    organizationId,
                    planId,
                    integrationPlanId: currentOrg?.integration_plan_id ?? null,
                    skipPlanLimitCheck: true,
                });
                if (!syncResult.ok) console.error('[Webhook] Error syncing organization plan:', syncResult.message);

                await supabase.from('organization_settings').upsert(
                    {
                        organization_id: organizationId,
                        billing_period: billingPeriod,
                    },
                    { onConflict: 'organization_id' },
                );
            }

            if (!hadActiveSubscriptionBefore) {
              const planName = typeof planData?.name === 'string' && planData.name.trim()
                ? planData.name.trim()
                : 'Plan contratado';
              const trialDays = Number.isFinite(trialDaysFromMetadata) && trialDaysFromMetadata > 0
                ? trialDaysFromMetadata
                : (status === 'trialing' ? 30 : 0);

              await sendSubscriptionActivatedEmail({
                organizationId,
                planName,
                trialDays,
              });
            }
        } else {
            await supabase
              .from('organizations')
              .update({ billing_activation_status: 'blocked' })
              .eq('id', organizationId);
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
        else console.info('[Webhook] subscriptions upserted OK');

        await markManualSubscriptionOrderCompleted();

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

        // ── ADD-ON SUBSCRIPTION LIFECYCLE ───────────────────────
        if (subscription.metadata?.isAddon === 'true') {
          const addonOrgId = subscription.metadata?.organizationId;
          const addonModuleId = subscription.metadata?.moduleId;
          const addonModuleCode = subscription.metadata?.moduleCode;
          const addonStatus = subscription.status;
          const isAddonActive = ['active', 'trialing'].includes(addonStatus);
          const isAddonCanceled = ['canceled', 'unpaid', 'incomplete_expired'].includes(addonStatus);

          if (!addonOrgId || !addonModuleId) {
            console.error('[Webhook][addon] Missing metadata on subscription lifecycle event');
            break;
          }

          const periodStartRaw: number = subscription.billing_cycle_anchor ?? subscription.start_date;
          const interval = subscription.items.data[0]?.price?.recurring?.interval ?? null;
          const currentPeriodEnd = computePeriodEnd(periodStartRaw, interval, subscription.trial_end);

          // If the subscription's price changed, try to match it to a known integration plan
          const updatedPriceId = subscription.items.data[0]?.price?.id ?? null;
          let updatedIntegrationPlanId: string | null = subscription.metadata?.integrationPlanId ?? null;
          if (!updatedIntegrationPlanId && updatedPriceId) {
            const { data: matchedPlan } = await supabase
              .from('plans')
              .select('id')
              .eq('stripe_price_id', updatedPriceId)
              .eq('plan_type', 'qbo_r365')
              .maybeSingle();
            if (matchedPlan) updatedIntegrationPlanId = matchedPlan.id;
          }

          await supabase.from('organization_addons').upsert(
            {
              organization_id: addonOrgId,
              module_id: addonModuleId,
              stripe_subscription_id: subscription.id,
              stripe_customer_id: stripeCustomerId,
              status: isAddonActive ? 'active' : (isAddonCanceled ? 'canceled' : addonStatus),
              current_period_end: currentPeriodEnd,
              ...(updatedIntegrationPlanId ? { integration_plan_id: updatedIntegrationPlanId } : {}),
            },
            { onConflict: 'organization_id,module_id' },
          );

          // Sync module enablement
          const { data: moduleRow } = await supabase
            .from('module_catalog')
            .select('id')
            .eq('id', addonModuleId)
            .maybeSingle();

          if (moduleRow) {
            await supabase.from('organization_modules').upsert(
              {
                organization_id: addonOrgId,
                module_id: addonModuleId,
                is_enabled: isAddonActive,
                enabled_at: isAddonActive ? new Date().toISOString() : null,
              },
              { onConflict: 'organization_id,module_id' },
            );
            console.info(`[Webhook][addon] Module ${addonModuleCode} set enabled=${isAddonActive} for org ${addonOrgId}`);
          }

          // ── SYNC integration_plan_id en organizations ────────────────────────
          if (isAddonActive && updatedIntegrationPlanId) {
            await supabase
              .from('organizations')
              .update({ integration_plan_id: updatedIntegrationPlanId })
              .eq('id', addonOrgId);
            console.info(`[Webhook][addon] organizations.integration_plan_id updated to ${updatedIntegrationPlanId} for org ${addonOrgId}`);
          } else if (isAddonCanceled) {
            await supabase
              .from('organizations')
              .update({ integration_plan_id: null })
              .eq('id', addonOrgId);
            console.info(`[Webhook][addon] organizations.integration_plan_id cleared for org ${addonOrgId} (addon canceled)`);
          }
          // ── END SYNC ──────────────────────────────────────────────────────────

          if (addonModuleCode === 'qbo_r365' || updatedIntegrationPlanId || isAddonCanceled) {
            const { data: orgRow } = await supabase
              .from('organizations')
              .select('plan_id')
              .eq('id', addonOrgId)
              .maybeSingle();

            const syncResult = await syncOrganizationPlan({
              organizationId: addonOrgId,
              planId: orgRow?.plan_id ?? null,
              integrationPlanId: isAddonCanceled ? null : (updatedIntegrationPlanId ?? null),
              skipPlanLimitCheck: true,
            });

            if (!syncResult.ok) {
              console.error(`[Webhook][addon] Failed to sync organization after addon lifecycle change for org ${addonOrgId}: ${syncResult.message}`);
            }
          }

          break;
        }
        // ── END ADD-ON SUBSCRIPTION LIFECYCLE ───────────────────

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

        // API v2026-02-25: current_period_start/end removed, use billing_cycle_anchor / start_date
        const periodStartRaw: number = subscription.billing_cycle_anchor ?? subscription.start_date;
        let currentPeriodStart = new Date().toISOString();
        if (periodStartRaw) { try { currentPeriodStart = new Date(periodStartRaw * 1000).toISOString(); } catch {} }
        const interval = subscription.items.data[0].price.recurring?.interval ?? null;
        const currentPeriodEnd = computePeriodEnd(periodStartRaw, interval, subscription.trial_end);

        const isActive = ['active', 'trialing'].includes(status);
        const isCanceled = ['canceled', 'unpaid', 'incomplete_expired'].includes(status);
        const targetPlanIdFromMeta = typeof subscription.metadata?.planId === 'string' ? subscription.metadata.planId : null;

        if (isCanceled) {
            const { data: currentOrg } = await supabase
              .from('organizations')
              .select('integration_plan_id')
              .eq('id', organizationId)
              .maybeSingle();

            await supabase
              .from('organizations')
              .update({
                plan_id: null,
                billing_activation_status: 'blocked',
              })
              .eq('id', organizationId);

            const syncResult = await syncOrganizationPlan({
              organizationId,
              planId: null,
              integrationPlanId: currentOrg?.integration_plan_id ?? null,
              skipPlanLimitCheck: true,
            });
            if (!syncResult.ok) console.error('[Webhook] Error syncing organization plan after cancellation:', syncResult.message);
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
                const { data: currentOrg } = await supabase
                  .from('organizations')
                  .select('integration_plan_id')
                  .eq('id', organizationId)
                  .maybeSingle();

                // Update org plan
                await supabase
                  .from('organizations')
                  .update({
                    plan_id: planData.id,
                    billing_activation_status: 'active',
                    billing_activated_at: new Date().toISOString(),
                  })
                  .eq('id', organizationId);

                const syncResult = await syncOrganizationPlan({
                    organizationId,
                    planId: planData.id,
                    integrationPlanId: currentOrg?.integration_plan_id ?? null,
                    skipPlanLimitCheck: true,
                });
                if (!syncResult.ok) console.error('[Webhook] Error syncing organization plan on subscription update:', syncResult.message);

                await supabase.from('organization_settings').upsert(
                    {
                        organization_id: organizationId,
                        billing_period: billingPeriod,
                    },
                    { onConflict: 'organization_id' },
                );

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
            const prevAttributes = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined;
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
                    console.info(`[Webhook] Applied plan-change email sent to actor for org ${organizationId}`);
                }
            }
        }

        console.info(`[Webhook] subscription.${event.type.split('.')[2]} processed for org ${organizationId}`);
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
            const amountStr = new Intl.NumberFormat('es-US', { style: 'currency', currency: invoice.currency.toUpperCase() }).format(invoice.amount_due / 100);
            const renewalDate = new Date(invoice.period_end * 1000).toLocaleDateString('es-US');

            await sendRenewalReminderEmail(organizationId, renewalDate, amountStr);
            console.info(`[Webhook] Sent renewal reminder for org ${organizationId}`);

            // ── USAGE BILLING: cobro por factura enviada (solo integración QBO-R365) ──
            // Si esta renovación es la de la suscripción de integración (no la de
            // plataforma), y la organización tiene un precio por factura configurado,
            // sumamos un pending invoice item antes de que Stripe finalice esta factura.
            const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
            const upcomingSubscriptionId = typeof invoiceSubscription === 'string'
              ? invoiceSubscription
              : invoiceSubscription?.id ?? null;

            if (upcomingSubscriptionId) {
              const { data: integrationAddon } = await supabase
                .from('organization_addons')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('stripe_subscription_id', upcomingSubscriptionId)
                .maybeSingle();

              if (integrationAddon) {
                const liveSubscription = await stripe.subscriptions.retrieve(upcomingSubscriptionId);
                const item = liveSubscription.items.data[0] as unknown as {
                  current_period_start?: number;
                  current_period_end?: number;
                };
                if (item?.current_period_start && item?.current_period_end) {
                  await billInvoiceUsageForRenewal({
                    organizationId,
                    stripeCustomerId,
                    stripeSubscriptionId: upcomingSubscriptionId,
                    periodStart: new Date(item.current_period_start * 1000),
                    periodEnd: new Date(item.current_period_end * 1000),
                  });
                } else {
                  console.error(`[Webhook][usage-billing] No current_period_start/end on subscription item for org ${organizationId}`);
                }
              }
            }
            // ── END USAGE BILLING ─────────────────────────────────────────────────────
        } else if (event.type === 'invoice.payment_failed') {
            const retryLink = invoice.hosted_invoice_url || `${process.env.APP_BASE_URL}/app/billing`;
            
            await sendPaymentFailedEmail(organizationId, retryLink);
            console.info(`[Webhook] Sent payment failed email for org ${organizationId}`);
        }
        break;
      }

      default:
        console.info(`[Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Webhook] Unhandled error processing event ${event.type}:`, err);

    // Mark the event as failed so it won't be retried as a duplicate.
    // Using UPDATE instead of DELETE prevents a race condition where a DELETE failure
    // could allow the same event to be processed twice (double charge risk).
    const { error: markFailedError } = await supabase
      .from('stripe_processed_events')
      .update({ status: 'failed' })
      .eq('event_id', event.id);

    if (markFailedError) {
      console.error(`[Webhook] Failed to mark event ${event.id} as failed:`, markFailedError);
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

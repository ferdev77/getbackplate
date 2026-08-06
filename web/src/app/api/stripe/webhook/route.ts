// Stripe Webhook Handler — typed, no as any
import { NextResponse } from 'next/server';
import { stripe } from '@/infrastructure/stripe/client';
import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/infrastructure/supabase/client/admin';
import { syncOrganizationPlan } from '@/modules/organizations/services/organization.service';
import { 
  sendRenewalReminderEmail, 
  sendPaymentFailedEmail,
  sendSuccessfulPaymentEmail,
  sendSubscriptionActivatedEmail,
} from '@/modules/billing/services/billing-notifications.service';
import { sendPlanChangeAppliedEmail } from '@/modules/billing/services/plan-change-notifications.service';
import { billInvoiceUsageForRenewal } from '@/modules/integrations/qbo-r365/usage-billing';
import { formatIntegrationRenewalReminder } from '@/modules/integrations/qbo-r365/renewal-format';
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

function getStripeObjectId(value: string | { id: string } | null): string | null {
  return typeof value === 'string' ? value : value?.id ?? null;
}

async function retryComplianceWrite(
  label: string,
  write: () => PromiseLike<{ error: { message: string } | null }>,
) {
  let lastError: { message: string } | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await write();
    if (!result.error) return;
    lastError = result.error;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 100));
  }
  throw new Error(`Unable to archive ${label}: ${lastError?.message ?? 'unknown database error'}`);
}

function requireDatabaseSuccess(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function runNotification(label: string, notification: () => Promise<unknown>) {
  try {
    await notification();
  } catch (error) {
    console.error(`[Webhook] ${label} notification failed:`, error);
  }
}

async function recordBillingPayment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  record: {
    organizationId: string;
    recordType: 'stripe_invoice' | 'manual_payment';
    sourceEventId: string;
    amountCents: number;
    currency: string;
    paidAt: string;
    stripeInvoiceId?: string | null;
    stripePaymentIntentId?: string | null;
    stripeCheckoutSessionId?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await retryComplianceWrite('billing record', () => supabase.from('billing_records').upsert({
    organization_id: record.organizationId,
    record_type: record.recordType,
    source_event_id: record.sourceEventId,
    stripe_invoice_id: record.stripeInvoiceId ?? null,
    stripe_payment_intent_id: record.stripePaymentIntentId ?? null,
    stripe_checkout_session_id: record.stripeCheckoutSessionId ?? null,
    amount_cents: Math.max(0, Math.round(record.amountCents)),
    currency: record.currency.toLowerCase(),
    paid_at: record.paidAt,
    description: record.description ?? null,
    metadata: record.metadata ?? {},
  }, { onConflict: 'source_event_id', ignoreDuplicates: true }));
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

  const { data: claimRows, error: reservationError } = await supabase.rpc('claim_stripe_event', {
    p_event_id: event.id,
    p_event_type: event.type,
    p_stripe_created_at: event.created ? new Date(event.created * 1000).toISOString() : null,
    p_lease_seconds: 1800,
    p_max_attempts: 8,
  });

  if (reservationError) {
    console.error(`[Webhook] Failed to reserve event ${event.id}:`, reservationError);
    return NextResponse.json({ error: 'Failed to reserve webhook event' }, { status: 500 });
  }

  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  if (!claim) {
    console.error(`[Webhook] Claim RPC returned no result for event ${event.id}`);
    return NextResponse.json({ error: 'Failed to claim webhook event' }, { status: 500 });
  }
  if (claim.outcome === 'processed') {
    console.info(`[Webhook] Processed duplicate event ignored: ${event.id}`);
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claim.outcome === 'legacy_blocked' || claim.outcome === 'dead_lettered') {
    console.error(`[Webhook] Event ${event.id} requires manual reconciliation (${claim.outcome})`);
    const { error: reconciliationError } = await supabase.rpc('queue_stripe_event_reconciliation', {
      p_event_id: event.id,
      p_reason: claim.outcome,
    });
    if (reconciliationError) {
      console.error(`[Webhook] Failed to queue reconciliation for event ${event.id}:`, reconciliationError);
      return NextResponse.json({ error: 'Failed to queue webhook reconciliation' }, { status: 500 });
    }
    return NextResponse.json({ received: true, reconciliationRequired: true });
  }
  if (claim.outcome === 'busy') {
    console.warn(`[Webhook] Event ${event.id} is already processing or waiting for retry`);
    return NextResponse.json({ error: 'Webhook event is temporarily unavailable' }, { status: 503 });
  }
  if (claim.outcome !== 'claimed' || !claim.processing_token) {
    console.error(`[Webhook] Unexpected claim outcome for event ${event.id}:`, claim);
    return NextResponse.json({ error: 'Failed to claim webhook event' }, { status: 500 });
  }
  const processingToken = claim.processing_token;

  try {
    switch (event.type) {

      // -------------------------------------------------------
      // PRIMARY HANDLER: Process everything when checkout is done
      // This is more reliable than subscription.created because
      // we have full context (session metadata, customer, etc.)
      // -------------------------------------------------------
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;

        console.info(`[Webhook] checkout.session.completed - customer: ${session.customer}, subscription: ${session.subscription}`);

        // ── REGISTRO DE ACEPTACION DE TERMINOS ────────────────────
        // Si la sesion tenia consent_collection.terms_of_service: "required"
        // (ver web/src/shared/lib/legal-consent.ts) y el cliente lo acepto,
        // dejamos constancia en audit_logs. No incluye IP (Stripe no la expone
        // via API), solo fecha, organizacion, email y version del documento.
        if (session.consent?.terms_of_service === 'accepted') {
          await retryComplianceWrite('legal acceptance', () => supabase.from('legal_acceptance_records').upsert({
            organization_id: session.metadata?.organizationId ?? null,
            stripe_checkout_session_id: session.id,
            customer_email: session.customer_details?.email ?? null,
            legal_version: session.metadata?.legalVersion ?? null,
            accepted_at: new Date().toISOString(),
          }, { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true }));

          await runNotification('Terms acceptance audit', () => logAuditEvent({
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
            }));
        }

        // ── MANUAL SUBSCRIPTION ORDER (tracking only) ─────────────
        // Created from superadmin/payment-links "Links de Suscripción". The
        // actual provisioning runs unchanged in the addon/platform branches
        // below — this only marks the link as completed for the superadmin UI.
        const manualSubscriptionOrderId = session.metadata?.manualSubscriptionOrderId ?? null;
        const markManualSubscriptionOrderCompleted = async () => {
          if (!manualSubscriptionOrderId) return;
          const { data: order, error: orderError } = await supabase
            .from('manual_subscription_orders')
            .select('id, status, stripe_session_id')
            .eq('id', manualSubscriptionOrderId)
            .maybeSingle();
          requireDatabaseSuccess('Load manual subscription order', orderError);
          if (!order || order.stripe_session_id !== session.id) {
            throw new Error('Manual subscription order does not match Checkout Session');
          }
          if (order.status === 'completed') return;
          if (order.status !== 'pending') {
            throw new Error(`Manual subscription order cannot complete from status ${order.status}`);
          }
          const { data: completedOrder, error } = await supabase
            .from('manual_subscription_orders')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', manualSubscriptionOrderId)
            .eq('status', 'pending')
            .select('id')
            .maybeSingle();
          requireDatabaseSuccess('Complete manual subscription order', error);
          if (!completedOrder) throw new Error('Manual subscription order was not completed');
        };

        // ── MANUAL PAYMENT ORDER ─────────────────────────────────
        // Created from superadmin/payment-links. One-time payment mode.
        // Actions are stored in the DB items column (new orders) or metadata (legacy).
        if (session.metadata?.manualPaymentOrderId) {
          const orderId = session.metadata.manualPaymentOrderId;
          const orgId   = session.metadata.organizationId;

          console.info(`[Webhook][manual] orderId=${orderId} orgId=${orgId}`);

          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent as { id: string } | null)?.id ?? null;
          const customerEmail = session.customer_details?.email ?? null;
          if (!orgId || session.amount_subtotal == null || session.amount_total == null || !session.currency) {
            throw new Error('Manual payment Checkout Session is missing required payment data');
          }
          if (event.type === 'checkout.session.completed' && session.payment_status === 'unpaid') {
            console.info(`[Webhook][manual] Session ${session.id} is awaiting asynchronous payment confirmation`);
            break;
          }
          if (session.payment_status !== 'paid') {
            throw new Error(`Manual payment order is not paid (status: ${session.payment_status})`);
          }
          if (session.amount_total < session.amount_subtotal) {
            throw new Error('Manual payment total is below the configured order amount');
          }

          const { error: manualPaymentError } = await supabase.rpc('apply_manual_payment_order_transaction_v2', {
            p_order_id: orderId,
            p_event_id: event.id,
            p_checkout_session_id: session.id,
            p_metadata_organization_id: orgId,
            p_amount_subtotal: session.amount_subtotal,
            p_amount_total: session.amount_total,
            p_currency: session.currency,
            p_payment_intent_id: paymentIntentId,
            p_customer_email: customerEmail,
            p_paid_at: new Date().toISOString(),
          });
          requireDatabaseSuccess('Apply manual payment order', manualPaymentError);

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

          if (!addonOrgId || !addonModuleId || !addonStripeCustomerId || !addonStripeSubscriptionId) {
            throw new Error('Add-on Checkout Session is missing organization, module, customer, or subscription');
          }

          // Ensure stripe_customers mapping exists
          const { error: addonCustomerError } = await supabase.from('stripe_customers').upsert(
            { organization_id: addonOrgId, stripe_customer_id: addonStripeCustomerId },
            { onConflict: 'organization_id' },
          );
          requireDatabaseSuccess('Link add-on Stripe customer', addonCustomerError);

          const integrationPlanId = session.metadata?.integrationPlanId ?? null;
          const setupFeePaidMeta = session.metadata?.setupFeePaid === 'true';
          const setupFeeAmountMeta = session.metadata?.setupFeeAmount
            ? Number(session.metadata.setupFeeAmount)
            : null;

          // Fetch the full subscription to compute the initial billing-cycle end.
          // Without this, current_period_end stays NULL until the first
          // customer.subscription.updated event (next renewal), and the dashboard's
          // "this billing cycle" invoice count silently falls back to a lifetime total.
          const addonSubscription = await stripe.subscriptions.retrieve(addonStripeSubscriptionId);
          const addonPeriodStartRaw = addonSubscription.billing_cycle_anchor ?? addonSubscription.start_date;
          const addonInterval = addonSubscription.items.data[0]?.price?.recurring?.interval ?? null;
          const addonCurrentPeriodEnd = computePeriodEnd(addonPeriodStartRaw, addonInterval, addonSubscription.trial_end);
          const isAddonActive = ['active', 'trialing'].includes(addonSubscription.status);
          const isAddonCanceled = ['canceled', 'unpaid', 'incomplete_expired'].includes(addonSubscription.status);
          const persistedAddonStatus = isAddonActive ? 'active' : (isAddonCanceled ? 'canceled' : addonSubscription.status);

          // Upsert the addon subscription record
          const { error: addonErr } = await supabase.from('organization_addons').upsert(
            {
              organization_id: addonOrgId,
              module_id: addonModuleId,
              stripe_subscription_id: addonStripeSubscriptionId,
              stripe_customer_id: addonStripeCustomerId,
              status: persistedAddonStatus,
              current_period_end: addonCurrentPeriodEnd,
              integration_plan_id: isAddonActive ? integrationPlanId : null,
              ...(setupFeePaidMeta ? { setup_fee_paid: true, setup_fee_amount: setupFeeAmountMeta } : {}),
            },
            { onConflict: 'organization_id,module_id' },
          );
          requireDatabaseSuccess('Upsert organization add-on', addonErr);

          // ── EXTRA CONNECTION SLOTS (recurring, sumadas en el alta nueva) ─────
          // Mismo mecanismo que el slot de pago unico (actionType "add_slot"),
          // reusado aca para el item recurrente de $80/mes agregado en
          // checkout-manual-subscription. Ver web/src/app/legal/integration/msa
          // Schedule B ("Additional Connection Fee").
          const extraSlotCount = Number(session.metadata?.extraSlotCount ?? 0);
          if (isAddonActive && extraSlotCount > 0) {
            const { error: slotErr } = await supabase.rpc('apply_stripe_increment_once', {
              p_event_id: event.id,
              p_effect_key: `checkout:${session.id}:extra-r365-slots`,
              p_organization_id: addonOrgId,
              p_module_id: addonModuleId,
              p_effect_type: 'r365_slots',
              p_amount: extraSlotCount,
            });
            requireDatabaseSuccess('Apply recurring extra R365 slots', slotErr);
            console.info(`[Webhook][addon] extra_r365_connections +${extraSlotCount} for org ${addonOrgId}`);
          }
          // ── END EXTRA CONNECTION SLOTS ────────────────────────────────────────

          // Enable the module for the organization.
          // Also fetch addon_companion_module_codes so we can provision companion
          // modules when the org has no active plan (see below).
          const { data: moduleRow, error: moduleLookupError } = await supabase
            .from('module_catalog')
            .select('id, addon_companion_module_codes')
            .eq('id', addonModuleId)
            .maybeSingle();
          requireDatabaseSuccess('Resolve add-on module', moduleLookupError);

          if (moduleRow) {
            const { error: modErr } = await supabase.from('organization_modules').upsert(
              {
                organization_id: addonOrgId,
                module_id: addonModuleId,
                is_enabled: isAddonActive,
                enabled_at: isAddonActive ? new Date().toISOString() : null,
              },
              { onConflict: 'organization_id,module_id' },
            );
            requireDatabaseSuccess('Enable add-on module', modErr);
            console.info(`[Webhook][addon] Module ${addonModuleCode} enabled for org ${addonOrgId}`);

            // ── COMPANION MODULES (sin plan activo) ───────────────────────────
            // Si la organización no tiene un plan asignado (plan_id IS NULL) y el
            // add-on define módulos compañeros, los provisionamos ahora.
            // Esto replica el comportamiento manual que se hizo para empresas como
            // Prodel, permitiendo que settings y custom_branding queden activos
            // sin necesidad de intervención del superadmin.
            const companionCodes: string[] = (moduleRow as { addon_companion_module_codes?: string[] }).addon_companion_module_codes ?? [];

            if (isAddonActive && companionCodes.length > 0) {
              const { data: orgRow, error: organizationLookupError } = await supabase
                .from('organizations')
                .select('plan_id')
                .eq('id', addonOrgId)
                .maybeSingle();
              requireDatabaseSuccess('Load add-on organization', organizationLookupError);

              if (!orgRow?.plan_id) {
                // Org without a plan: resolve companion module IDs and activate them
                const { data: companionModules, error: companionLookupErr } = await supabase
                  .from('module_catalog')
                  .select('id, code')
                  .in('code', companionCodes);

                requireDatabaseSuccess('Resolve add-on companion modules', companionLookupErr);
                if (companionModules && companionModules.length > 0) {
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
                    requireDatabaseSuccess(`Enable companion module ${companion.code}`, companionErr);
                    console.info(`[Webhook][addon] Companion module "${companion.code}" enabled for org ${addonOrgId} (no active plan)`);
                  }
                }
              }
            }
            // ── END COMPANION MODULES ─────────────────────────────────────────
          } else throw new Error(`Add-on module ${addonModuleId} was not found`);

          // ── SYNC integration_plan_id en organizations ────────────────────────
          if (isAddonActive && integrationPlanId) {
            const { error: integrationPlanError } = await supabase
              .from('organizations')
              .update({ integration_plan_id: integrationPlanId })
              .eq('id', addonOrgId);
            requireDatabaseSuccess('Set organization integration plan', integrationPlanError);
            console.info(`[Webhook][addon] organizations.integration_plan_id set to ${integrationPlanId} for org ${addonOrgId}`);
          } else if (!isAddonActive) {
            const { error: integrationPlanError } = await supabase
              .from('organizations')
              .update({ integration_plan_id: null })
              .eq('id', addonOrgId);
            requireDatabaseSuccess('Clear stale organization integration plan', integrationPlanError);
          }
          // ── END SYNC ──────────────────────────────────────────────────────────

          if (integrationPlanId || !isAddonActive) {
            const { data: orgRow, error: organizationLookupError } = await supabase
              .from('organizations')
              .select('plan_id')
              .eq('id', addonOrgId)
              .maybeSingle();
            requireDatabaseSuccess('Load organization platform plan', organizationLookupError);

            const syncResult = await syncOrganizationPlan({
              organizationId: addonOrgId,
              planId: orgRow?.plan_id ?? null,
              integrationPlanId: isAddonActive ? integrationPlanId : null,
              skipPlanLimitCheck: true,
            });

            if (!syncResult.ok) {
              throw new Error(`Sync dual-plan modules for org ${addonOrgId}: ${syncResult.message}`);
            }
          }

          // ── BILLING GATE: integration-only orgs must never be blocked ────────
          // Integration plans live in organization_addons, not in subscriptions.
          // The billing gate only reads subscriptions, so orgs without a platform
          // plan would always get isBlocked=true (reason: subscription_missing).
          // Clearing billing_onboarding_required ensures the gate returns
          // reason="not_required" and never blocks the dashboard.
          if (isAddonActive) {
            const { error: billingGateError } = await supabase
              .from('organizations')
              .update({ billing_onboarding_required: false })
              .eq('id', addonOrgId)
              .is('plan_id', null); // only if they have no platform plan — don't touch platform customers
            requireDatabaseSuccess('Clear integration-only billing gate', billingGateError);
            console.info(`[Webhook][addon] billing_onboarding_required cleared for integration-only org ${addonOrgId}`);
          }
          // ── END BILLING GATE FIX ─────────────────────────────────────────────

          await markManualSubscriptionOrderCompleted();

          break;
        }
        // ── END ADD-ON CHECKOUT ──────────────────────────────────

        const organizationId = session.metadata?.organizationId || (session.client_reference_id as string | null);
        let planId = session.metadata?.planId || null;

        if (!organizationId) {
            throw new Error('Platform Checkout Session is missing organizationId');
        }

        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;
        const trialDaysFromMetadata = Number.parseInt(session.metadata?.trialDays || '0', 10);

        const { data: existingActiveBefore, error: activeSubscriptionLookupError } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('organization_id', organizationId)
          .in('status', ['active', 'trialing'])
          .limit(1);
        requireDatabaseSuccess('Load existing active subscription', activeSubscriptionLookupError);
        const hadActiveSubscriptionBefore = Array.isArray(existingActiveBefore) && existingActiveBefore.length > 0;

        // 1. Map the stripe customer to our organization
        const { error: custErr } = await supabase
          .from('stripe_customers')
          .upsert(
            { organization_id: organizationId, stripe_customer_id: stripeCustomerId },
            { onConflict: 'organization_id' }
          );
        requireDatabaseSuccess('Link Stripe customer', custErr);
        console.info('[Webhook] stripe_customers upserted OK');

        // 2. Fetch the full subscription object from Stripe to get pricing and status
        if (!stripeSubscriptionId) {
            throw new Error('Platform Checkout Session is missing subscription');
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
            const { data: planData, error: planLookupError } = await supabase
                .from('plans')
                .select('id, name, max_branches, max_users, max_storage_mb, max_employees')
                .eq('stripe_price_id', priceId)
                .maybeSingle();
            requireDatabaseSuccess('Resolve platform plan by Stripe price', planLookupError);
            if (planData) planId = planData.id;
        }

        const isActive = ['active', 'trialing'].includes(status);
        if (isActive && !planId) throw new Error(`No platform plan matches Stripe price ${priceId}`);

        if (planId && isActive) {
            // 4. Fetch full plan data for limits
            const [planResult, organizationResult] = await Promise.all([
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
            requireDatabaseSuccess('Load platform plan', planResult.error);
            requireDatabaseSuccess('Load organization integration plan', organizationResult.error);
            const planData = planResult.data;
            const currentOrg = organizationResult.data;
            if (!planData) throw new Error(`Platform plan ${planId} was not found`);

            // 5. Update organization plan
            const { error: orgErr } = await supabase
              .from('organizations')
              .update({
                plan_id: planId,
                billing_activation_status: 'active',
                billing_activated_at: new Date().toISOString(),
              })
              .eq('id', organizationId);
            requireDatabaseSuccess('Activate organization plan', orgErr);
            console.info('[Webhook] Organization plan updated OK');

            if (planData) {
                const syncResult = await syncOrganizationPlan({
                    organizationId,
                    planId,
                    integrationPlanId: currentOrg?.integration_plan_id ?? null,
                    skipPlanLimitCheck: true,
                });
                if (!syncResult.ok) throw new Error(`Sync organization plan: ${syncResult.message}`);

                const { error: settingsError } = await supabase.from('organization_settings').upsert(
                    {
                        organization_id: organizationId,
                        billing_period: billingPeriod,
                    },
                    { onConflict: 'organization_id' },
                );
                requireDatabaseSuccess('Set organization billing period', settingsError);
            }

            if (!hadActiveSubscriptionBefore) {
              const planName = typeof planData?.name === 'string' && planData.name.trim()
                ? planData.name.trim()
                : 'Plan contratado';
              const trialDays = Number.isFinite(trialDaysFromMetadata) && trialDaysFromMetadata > 0
                ? trialDaysFromMetadata
                : (status === 'trialing' ? 30 : 0);

              await runNotification('Subscription activation', () => sendSubscriptionActivatedEmail({
                  organizationId,
                  planName,
                  trialDays,
                }));
            }
        } else {
            const { error: blockOrganizationError } = await supabase
              .from('organizations')
              .update({ billing_activation_status: 'blocked' })
              .eq('id', organizationId);
            requireDatabaseSuccess('Block inactive organization subscription', blockOrganizationError);
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

        requireDatabaseSuccess('Upsert subscription', subError);
        console.info('[Webhook] subscriptions upserted OK');

        await markManualSubscriptionOrderCompleted();

        break;
      }

      // -------------------------------------------------------
      // SECONDARY HANDLER: Handle subscription updates/cancellations
      // (not initial creation — that's handled in checkout.session.completed)
      // -------------------------------------------------------
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const deliveredSubscription = event.data.object as Stripe.Subscription;
        // Stripe does not guarantee delivery order. Always project the current
        // object so retrying an old event cannot reactivate a canceled plan.
        const subscription = await stripe.subscriptions.retrieve(deliveredSubscription.id);
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
            throw new Error('Add-on subscription event is missing organizationId or moduleId');
          }

          const periodStartRaw: number = subscription.billing_cycle_anchor ?? subscription.start_date;
          const interval = subscription.items.data[0]?.price?.recurring?.interval ?? null;
          const currentPeriodEnd = computePeriodEnd(periodStartRaw, interval, subscription.trial_end);

          // If the subscription's price changed, try to match it to a known integration plan
          const updatedPriceId = subscription.items.data[0]?.price?.id ?? null;
          let updatedIntegrationPlanId: string | null = subscription.metadata?.integrationPlanId ?? null;
          if (!updatedIntegrationPlanId && updatedPriceId) {
            const { data: matchedPlan, error: matchedPlanError } = await supabase
              .from('plans')
              .select('id')
              .eq('stripe_price_id', updatedPriceId)
              .eq('plan_type', 'qbo_r365')
              .maybeSingle();
            requireDatabaseSuccess('Resolve integration plan by Stripe price', matchedPlanError);
            if (matchedPlan) updatedIntegrationPlanId = matchedPlan.id;
          }

          const { error: addonLifecycleError } = await supabase.from('organization_addons').upsert(
            {
              organization_id: addonOrgId,
              module_id: addonModuleId,
              stripe_subscription_id: subscription.id,
              stripe_customer_id: stripeCustomerId,
              status: isAddonActive ? 'active' : (isAddonCanceled ? 'canceled' : addonStatus),
              current_period_end: currentPeriodEnd,
              integration_plan_id: isAddonActive ? updatedIntegrationPlanId : null,
            },
            { onConflict: 'organization_id,module_id' },
          );
          requireDatabaseSuccess('Update add-on subscription lifecycle', addonLifecycleError);

          // Sync module enablement
          const { data: moduleRow, error: moduleLookupError } = await supabase
            .from('module_catalog')
            .select('id')
            .eq('id', addonModuleId)
            .maybeSingle();
          requireDatabaseSuccess('Resolve add-on lifecycle module', moduleLookupError);

          if (moduleRow) {
            const { error: addonModuleError } = await supabase.from('organization_modules').upsert(
              {
                organization_id: addonOrgId,
                module_id: addonModuleId,
                is_enabled: isAddonActive,
                enabled_at: isAddonActive ? new Date().toISOString() : null,
              },
              { onConflict: 'organization_id,module_id' },
            );
            requireDatabaseSuccess('Update add-on module lifecycle', addonModuleError);
            console.info(`[Webhook][addon] Module ${addonModuleCode} set enabled=${isAddonActive} for org ${addonOrgId}`);
          }

          // ── SYNC integration_plan_id en organizations ────────────────────────
          if (isAddonActive && updatedIntegrationPlanId) {
            const { error: integrationPlanError } = await supabase
              .from('organizations')
              .update({ integration_plan_id: updatedIntegrationPlanId })
              .eq('id', addonOrgId);
            requireDatabaseSuccess('Update organization integration plan', integrationPlanError);
            console.info(`[Webhook][addon] organizations.integration_plan_id updated to ${updatedIntegrationPlanId} for org ${addonOrgId}`);
          } else if (isAddonCanceled) {
            const { error: clearIntegrationPlanError } = await supabase
              .from('organizations')
              .update({ integration_plan_id: null })
              .eq('id', addonOrgId);
            requireDatabaseSuccess('Clear organization integration plan', clearIntegrationPlanError);
            console.info(`[Webhook][addon] organizations.integration_plan_id cleared for org ${addonOrgId} (addon canceled)`);
          }
          // ── END SYNC ──────────────────────────────────────────────────────────

          if (addonModuleCode === 'qbo_r365' || updatedIntegrationPlanId || isAddonCanceled) {
            const { data: orgRow, error: organizationLookupError } = await supabase
              .from('organizations')
              .select('plan_id')
              .eq('id', addonOrgId)
              .maybeSingle();
            requireDatabaseSuccess('Load add-on lifecycle organization', organizationLookupError);

            const syncResult = await syncOrganizationPlan({
              organizationId: addonOrgId,
              planId: orgRow?.plan_id ?? null,
              integrationPlanId: isAddonCanceled ? null : (updatedIntegrationPlanId ?? null),
              skipPlanLimitCheck: true,
            });

            if (!syncResult.ok) {
              throw new Error(`Sync organization after add-on lifecycle change: ${syncResult.message}`);
            }
          }

          break;
        }
        // ── END ADD-ON SUBSCRIPTION LIFECYCLE ───────────────────

        let organizationId = subscription.metadata?.organizationId;

        if (!organizationId) {
          const { data: customerMapping, error: customerMappingError } = await supabase
              .from('stripe_customers')
              .select('organization_id')
              .eq('stripe_customer_id', stripeCustomerId)
              .single();
          requireDatabaseSuccess('Resolve subscription customer', customerMappingError);
          if (customerMapping) organizationId = customerMapping.organization_id;
        }

        if (!organizationId) {
            throw new Error(`No organizationId for subscription event on customer ${stripeCustomerId}`);
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
            const { data: currentOrg, error: organizationLookupError } = await supabase
              .from('organizations')
              .select('integration_plan_id')
              .eq('id', organizationId)
              .maybeSingle();
            requireDatabaseSuccess('Load canceled subscription organization', organizationLookupError);

            const { error: cancelOrganizationError } = await supabase
              .from('organizations')
              .update({
                plan_id: null,
                billing_activation_status: 'blocked',
              })
              .eq('id', organizationId);
            requireDatabaseSuccess('Cancel organization platform plan', cancelOrganizationError);

            const syncResult = await syncOrganizationPlan({
              organizationId,
              planId: null,
              integrationPlanId: currentOrg?.integration_plan_id ?? null,
              skipPlanLimitCheck: true,
            });
            if (!syncResult.ok) throw new Error(`Sync organization plan after cancellation: ${syncResult.message}`);
        } else if (isActive) {
            let planData: {
              id: string;
              max_branches: number | null;
              max_users: number | null;
              max_storage_mb: number | null;
              max_employees: number | null;
            } | null = null;

            if (targetPlanIdFromMeta) {
                const { data: byId, error: planByIdError } = await supabase
                    .from('plans')
                    .select('id, max_branches, max_users, max_storage_mb, max_employees')
                    .eq('id', targetPlanIdFromMeta)
                    .maybeSingle();
                requireDatabaseSuccess('Resolve updated platform plan by ID', planByIdError);
                planData = byId;
            }

            if (!planData) {
                const { data: byPrice, error: planByPriceError } = await supabase
                    .from('plans')
                    .select('id, max_branches, max_users, max_storage_mb, max_employees')
                    .eq('stripe_price_id', priceId)
                    .maybeSingle();
                requireDatabaseSuccess('Resolve updated platform plan by price', planByPriceError);
                planData = byPrice;
            }

            if (planData) {
                const { data: currentOrg, error: organizationLookupError } = await supabase
                  .from('organizations')
                  .select('integration_plan_id')
                  .eq('id', organizationId)
                  .maybeSingle();
                requireDatabaseSuccess('Load updated subscription organization', organizationLookupError);

                // Update org plan
                const { error: activateOrganizationError } = await supabase
                  .from('organizations')
                  .update({
                    plan_id: planData.id,
                    billing_activation_status: 'active',
                    billing_activated_at: new Date().toISOString(),
                  })
                  .eq('id', organizationId);
                requireDatabaseSuccess('Activate updated organization plan', activateOrganizationError);

                const syncResult = await syncOrganizationPlan({
                    organizationId,
                    planId: planData.id,
                    integrationPlanId: currentOrg?.integration_plan_id ?? null,
                    skipPlanLimitCheck: true,
                });
                if (!syncResult.ok) throw new Error(`Sync organization plan on subscription update: ${syncResult.message}`);

                const { error: settingsError } = await supabase.from('organization_settings').upsert(
                    {
                        organization_id: organizationId,
                        billing_period: billingPeriod,
                    },
                    { onConflict: 'organization_id' },
                );
                requireDatabaseSuccess('Update subscription billing period', settingsError);

            } else throw new Error(`No platform plan matches updated Stripe price ${priceId}`);
        }


        const { error: subscriptionLifecycleError } = await supabase.from('subscriptions').upsert({
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
        requireDatabaseSuccess('Update subscription lifecycle', subscriptionLifecycleError);

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
      // TERTIARY HANDLERS: Invoices (Receipts, Upcoming renewals, Payment Failures)
      // -------------------------------------------------------
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const billingStripeCustomerId = getStripeObjectId(invoice.customer);
        if (billingStripeCustomerId) {
          const { data: billingCustomerMapping, error: billingMappingError } = await supabase
            .from('stripe_customers')
            .select('organization_id')
            .eq('stripe_customer_id', billingStripeCustomerId)
            .maybeSingle();
          requireDatabaseSuccess('Resolve paid invoice customer', billingMappingError);
          let billingOrganizationId = billingCustomerMapping?.organization_id ?? null;
          if (!billingOrganizationId) {
            const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
            const invoiceSubscriptionId = typeof invoiceSubscription === 'string'
              ? invoiceSubscription
              : invoiceSubscription?.id ?? null;
            if (invoiceSubscriptionId) {
              const liveSubscription = await stripe.subscriptions.retrieve(invoiceSubscriptionId);
              billingOrganizationId = liveSubscription.metadata.organizationId || null;
            }
          }

          if (billingOrganizationId) {
            const paidTimestamp = invoice.status_transitions?.paid_at ?? invoice.created;
            await recordBillingPayment(supabase, {
              organizationId: billingOrganizationId,
              recordType: 'stripe_invoice',
              sourceEventId: `stripe_invoice:${invoice.id}`,
              amountCents: invoice.amount_paid,
              currency: invoice.currency,
              paidAt: new Date(paidTimestamp * 1000).toISOString(),
              stripeInvoiceId: invoice.id,
              description: invoice.billing_reason ?? 'Stripe invoice payment',
              metadata: { billingReason: invoice.billing_reason },
            });
          } else {
            throw new Error(`No organization mapping for paid invoice ${invoice.id}`);
          }
        } else throw new Error(`Paid invoice ${invoice.id} has no Stripe customer`);

        const { data: purchase, error: purchaseLookupError } = await supabase
          .from('r365_connection_purchases')
          .select('id, stripe_subscription_id, extra_price_id, target_quantity, delta_quantity, status')
          .eq('stripe_invoice_id', invoice.id)
          .maybeSingle();
        requireDatabaseSuccess('Resolve R365 connection purchase', purchaseLookupError);

        let appliedR365Purchase = purchase?.status === 'paid_applied';
        if (purchase) {
          if (purchase.status === 'pending_payment') {
            const subscription = await stripe.subscriptions.retrieve(purchase.stripe_subscription_id);
            const hasPurchasedQuantity = subscription.items.data.some(
              (item) => item.price.id === purchase.extra_price_id && (item.quantity ?? 0) >= purchase.target_quantity,
            );
            if (!hasPurchasedQuantity) {
              console.info(`[Webhook][r365-extra-connections] Purchase ${purchase.id} is paid but its pending update is not applied yet.`);
              break;
            }

            const { error } = await supabase.rpc('apply_r365_connection_purchase', {
              p_purchase_id: purchase.id,
            });
            if (error) throw error;
            appliedR365Purchase = true;
            console.info(`[Webhook][r365-extra-connections] Applied purchase ${purchase.id}`);
          }
        }

        const isRecurringRenewal = invoice.billing_reason === 'subscription_cycle';
        if (!isRecurringRenewal && !appliedR365Purchase) break;

        const stripeCustomerId = getStripeObjectId(invoice.customer);
        if (!stripeCustomerId) {
          throw new Error(`No Stripe customer found for paid invoice ${invoice.id}`);
        }

        const { data: customerMapping, error: customerMappingError } = await supabase
          .from('stripe_customers')
          .select('organization_id')
          .eq('stripe_customer_id', stripeCustomerId)
          .maybeSingle();
        requireDatabaseSuccess('Resolve paid invoice organization', customerMappingError);
        const organizationId = customerMapping?.organization_id;
        if (!organizationId) {
          throw new Error(`No organizationId for paid invoice ${invoice.id} on customer ${stripeCustomerId}`);
        }

        const currency = invoice.currency.toUpperCase();
        const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });
        const amount = currencyFormatter.format(invoice.amount_paid / 100);
        const paymentTimestamp = invoice.status_transitions?.paid_at ?? invoice.created;
        const paymentDate = new Date(paymentTimestamp * 1000).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        try {
          await sendSuccessfulPaymentEmail({
            organizationId,
            invoiceUrl: invoice.hosted_invoice_url ?? undefined,
            invoicePdfUrl: invoice.invoice_pdf ?? undefined,
            invoiceNumber: invoice.number ?? invoice.id,
            amount,
            paymentDate,
            lineItems: invoice.lines.data.map((line) => ({
              description: line.description ?? 'Subscription payment',
              amount: currencyFormatter.format(line.amount / 100),
            })),
            extraR365Connections: appliedR365Purchase ? purchase?.delta_quantity ?? undefined : undefined,
            sendPush: true,
          });
          console.info(`[Webhook] Sent payment receipt for paid invoice ${invoice.id} org ${organizationId}`);
        } catch (emailError) {
          // A notification issue must not cause Stripe to retry an already-applied payment.
          console.error(`[Webhook] Failed to send payment receipt for invoice ${invoice.id}:`, emailError);
        }
        break;
      }

      case 'invoice.upcoming':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        if (event.type === 'invoice.payment_failed') {
          const { error } = await supabase
            .from('r365_connection_purchases')
            .update({ status: 'payment_failed' })
            .eq('stripe_invoice_id', invoice.id)
            .eq('status', 'pending_payment');
          if (error) throw error;
        }

        // Find the organization from the customer ID mapping
        const { data: customerMapping, error: customerMappingError } = await supabase
            .from('stripe_customers')
            .select('organization_id')
            .eq('stripe_customer_id', stripeCustomerId)
            .single();
        requireDatabaseSuccess('Resolve invoice customer', customerMappingError);

        const organizationId = customerMapping?.organization_id;

        if (!organizationId) {
            throw new Error(`No organizationId for invoice event on customer ${stripeCustomerId}`);
        }

        if (event.type === 'invoice.upcoming') {
            // ── USAGE BILLING: cobro por factura enviada (solo integración QBO-R365) ──
            // Si esta renovación es la de la suscripción de integración (no la de
            // plataforma), y la organización tiene un precio por factura configurado,
            // sumamos un pending invoice item antes de que Stripe finalice esta factura.
            const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
            const upcomingSubscriptionId = typeof invoiceSubscription === 'string'
              ? invoiceSubscription
              : invoiceSubscription?.id ?? null;

            const { data: integrationAddon, error: integrationAddonError } = upcomingSubscriptionId
              ? await supabase
                .from('organization_addons')
                .select('id')
                .eq('organization_id', organizationId)
                .eq('stripe_subscription_id', upcomingSubscriptionId)
                .maybeSingle()
              : { data: null, error: null };
            requireDatabaseSuccess('Resolve integration renewal add-on', integrationAddonError);

            const reminderValues = integrationAddon
              ? formatIntegrationRenewalReminder(invoice.amount_due, invoice.currency, invoice.period_end)
              : {
                  amount: new Intl.NumberFormat('es-MX', { style: 'currency', currency: invoice.currency.toUpperCase() }).format(invoice.amount_due / 100),
                  renewalDate: new Date(invoice.period_end * 1000).toLocaleDateString('es-MX'),
                };

            // Lineas reales de la factura de Stripe en este momento (plan + slot
            // recurrentes) -- el cargo por uso todavia no esta agregado, por eso
            // avisamos aparte con usageNote cuando es la suscripcion de integracion.
            const reminderCurrencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency.toUpperCase() });
            const reminderLineItems = invoice.lines.data.map((line) => ({
              description: line.description ?? 'Subscription renewal',
              amount: reminderCurrencyFormatter.format(line.amount / 100),
            }));
            const usageNote = integrationAddon
              ? "This total doesn't include usage charges yet — invoices delivered this billing period are added automatically before your billing cycle closes."
              : undefined;

            if (upcomingSubscriptionId && integrationAddon) {
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
            await runNotification('Renewal reminder', () => sendRenewalReminderEmail(
              organizationId,
              reminderValues.renewalDate,
              reminderValues.amount,
              reminderLineItems,
              usageNote,
            ));
            // ── END USAGE BILLING ─────────────────────────────────────────────────────
        } else if (event.type === 'invoice.payment_failed') {
            const retryLink = invoice.hosted_invoice_url || `${process.env.APP_BASE_URL}/app/billing/portal-launch`;

            await runNotification('Payment failure', () => sendPaymentFailedEmail(organizationId, retryLink));
        }
        break;
      }

      default:
        console.info(`[Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Webhook] Unhandled error processing event ${event.type}:`, err);

    const errorMessage = err instanceof Error ? err.message : String(err);
    const { error: markFailedError } = await supabase.rpc('fail_stripe_event_v2', {
      p_event_id: event.id,
      p_processing_token: processingToken,
      p_error: errorMessage,
      p_retry_after_seconds: 30,
      p_max_attempts: 8,
    });

    if (markFailedError) {
      console.error(`[Webhook] Failed to mark event ${event.id} as failed:`, markFailedError);
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { data: finalized, error: markProcessedError } = await supabase.rpc('complete_stripe_event', {
    p_event_id: event.id,
    p_processing_token: processingToken,
  });

  if (markProcessedError || finalized !== true) {
    console.error(`[Webhook] Failed to mark event ${event.id} as processed:`, markProcessedError);
    return NextResponse.json({ error: 'Failed to finalize webhook event' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

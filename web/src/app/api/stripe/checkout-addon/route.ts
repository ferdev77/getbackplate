import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/infrastructure/supabase/client/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/infrastructure/stripe/client';
import { assertCompanyAdminModuleApi } from '@/shared/lib/access';
import { isSuperadminImpersonating } from '@/shared/lib/impersonation';
import { logAuditEvent } from '@/shared/lib/audit';
import { resolveCanonicalAppUrl } from '@/shared/lib/app-url';
import { resolveTenantAppUrlByOrganizationId } from '@/shared/lib/custom-domains';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const moduleId = typeof payload.moduleId === 'string' ? payload.moduleId : '';

    if (!moduleId) {
      return NextResponse.json({ error: 'Missing moduleId' }, { status: 400 });
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const requestBaseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

    const moduleAccess = await assertCompanyAdminModuleApi('dashboard', {
      allowBillingBypass: true,
    });
    if (!moduleAccess.ok) {
      return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== moduleAccess.userId) {
      return NextResponse.json({ error: 'AuthRequired' }, { status: 401 });
    }

    if (await isSuperadminImpersonating(user.id)) {
      return NextResponse.json(
        { error: 'impersonation_blocked', message: 'No puedes gestionar billing en modo impersonación.' },
        { status: 403 },
      );
    }

    const organizationId = moduleAccess.tenant.organizationId;

    const { data: customBrandingEnabledData } = await supabase.rpc('is_module_enabled', {
      org_id: organizationId,
      module_code: 'custom_branding',
    });
    const customBrandingEnabled = Boolean(customBrandingEnabledData);
    const baseUrl = customBrandingEnabled
      ? await resolveTenantAppUrlByOrganizationId({ organizationId, fallbackAppUrl: requestBaseUrl })
      : resolveCanonicalAppUrl(requestBaseUrl);

    // Fetch the add-on module
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data: addonModule } = await adminSupabase
      .from('module_catalog')
      .select('id, code, name, addon_name, addon_stripe_price_id, is_available_as_addon')
      .eq('id', moduleId)
      .maybeSingle();

    if (!addonModule || !addonModule.is_available_as_addon) {
      return NextResponse.json({ error: 'Módulo no disponible como add-on' }, { status: 400 });
    }

    if (!addonModule.addon_stripe_price_id) {
      return NextResponse.json({ error: 'Este add-on no tiene precio configurado en Stripe' }, { status: 400 });
    }

    // Check if org already has an active add-on subscription for this module
    const { data: existingAddon } = await adminSupabase
      .from('organization_addons')
      .select('id, stripe_subscription_id, status')
      .eq('organization_id', organizationId)
      .eq('module_id', moduleId)
      .maybeSingle();

    if (existingAddon?.status === 'active' && existingAddon.stripe_subscription_id) {
      // Already active — open billing portal so they can manage/cancel
      const { data: stripeMapping } = await adminSupabase
        .from('stripe_customers')
        .select('stripe_customer_id')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (stripeMapping?.stripe_customer_id) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: stripeMapping.stripe_customer_id,
          return_url: `${baseUrl}/app/dashboard`,
        });
        return NextResponse.json({ url: portalSession.url });
      }
    }

    // Resolve or create Stripe customer
    let stripeCustomerId: string | undefined;
    const { data: stripeMapping } = await adminSupabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (stripeMapping?.stripe_customer_id) {
      stripeCustomerId = stripeMapping.stripe_customer_id;
    }

    const customerEmail = user.email;

    const sharedMetadata = {
      organizationId,
      userId: user.id,
      moduleId,
      moduleCode: addonModule.code,
      isAddon: 'true',
    };

    const baseSessionParams = {
      mode: 'subscription' as const,
      line_items: [{ price: addonModule.addon_stripe_price_id, quantity: 1 }],
      success_url: `${baseUrl}/app/dashboard?addon_success=1&module=${addonModule.code}`,
      cancel_url: `${baseUrl}/app/dashboard`,
      metadata: sharedMetadata,
      subscription_data: { metadata: sharedMetadata },
    };

    const session = await stripe.checkout.sessions.create(
      stripeCustomerId
        ? { ...baseSessionParams, customer: stripeCustomerId }
        : customerEmail
          ? { ...baseSessionParams, customer_email: customerEmail }
          : baseSessionParams,
    );

    await logAuditEvent({
      action: 'organization.billing.addon_checkout_started',
      entityType: 'stripe_checkout',
      organizationId,
      eventDomain: 'settings',
      outcome: 'success',
      severity: 'medium',
      metadata: {
        module_id: moduleId,
        module_code: addonModule.code,
        stripe_session_id: session.id,
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: unknown) {
    console.error('[checkout-addon] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

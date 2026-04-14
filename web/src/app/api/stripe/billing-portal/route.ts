import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { stripe } from '@/infrastructure/stripe/client';
import { assertCompanyAdminModuleApi } from '@/shared/lib/access';
import { isSuperadminImpersonating } from '@/shared/lib/impersonation';
import { logAuditEvent } from '@/shared/lib/audit';
import { resolveCanonicalAppUrl } from '@/shared/lib/app-url';
import { resolveTenantAppUrlByOrganizationId } from '@/shared/lib/custom-domains';

export async function POST(request: Request) {
  try {
    const moduleAccess = await assertCompanyAdminModuleApi('dashboard');
    if (!moduleAccess.ok) {
      return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.id !== moduleAccess.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (await isSuperadminImpersonating(user.id)) {
      await logAuditEvent({
        action: 'organization.impersonation.blocked_billing_portal',
        entityType: 'stripe_billing_portal',
        eventDomain: 'security',
        outcome: 'denied',
        severity: 'high',
      });
      return NextResponse.json(
        { error: 'impersonation_blocked', message: 'No puedes gestionar billing en modo impersonacion.' },
        { status: 403 },
      );
    }

    const organizationId = moduleAccess.tenant.organizationId;
    const { data: customBrandingEnabledData } = await supabase.rpc('is_module_enabled', {
      org_id: organizationId,
      module_code: 'custom_branding',
    });
    const customBrandingEnabled = Boolean(customBrandingEnabledData);

    // Look up their Stripe Customer ID in our DB
    const { data: stripeMapping } = await supabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!stripeMapping || !stripeMapping.stripe_customer_id) {
      // It's possible they haven't bought anything yet
      return NextResponse.json({ error: 'No billing account found for this organization. Please purchase a plan first.' }, { status: 400 });
    }

    // Generate the portal link
    // The user will see their past invoices and can update cards
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const requestBaseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
    const resolvedBaseUrl = customBrandingEnabled
      ? await resolveTenantAppUrlByOrganizationId({
          organizationId,
          fallbackAppUrl: requestBaseUrl,
        })
      : resolveCanonicalAppUrl(requestBaseUrl);
    const returnUrl = `${resolvedBaseUrl}/app/dashboard`;
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeMapping.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: unknown) {
    console.error('Stripe Billing Portal Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

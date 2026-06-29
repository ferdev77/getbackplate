import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToOrg } from "@/infrastructure/push/send-to-org";
import {
  paymentFailedTemplate,
  planChangedTemplate,
  planRenewalReminderTemplate,
  subscriptionActivatedTemplate,
} from "@/shared/lib/email-templates/billing";
import { resolveTenantAppUrlByOrganizationId } from "@/shared/lib/custom-domains";
import {
  buildBrandedEmailSubject,
  getTenantEmailBranding,
  resolveEmailSenderName,
  type TenantEmailBranding,
} from "@/shared/lib/email-branding";

async function getOrganizationAdminEmail(organizationId: string): Promise<{ email: string; userId: string | null } | null> {
  const supabase = createSupabaseAdminClient();

  const { data: settings } = await supabase
    .from("organization_settings")
    .select("billing_email")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (typeof settings?.billing_email === "string" && settings.billing_email.trim()) {
    return { email: settings.billing_email.trim().toLowerCase(), userId: null };
  }

  const { data: roleRows } = await supabase
    .from("roles")
    .select("id")
    .in("code", ["company_admin"]);

  const roleIds = (roleRows ?? []).map((row) => row.id).filter(Boolean);
  if (!roleIds.length) {
    return null;
  }

  const { data: memberships } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("role_id", roleIds)
    .order("created_at", { ascending: true })
    .limit(3);

  for (const membership of memberships ?? []) {
    if (!membership.user_id) continue;
    const { data: userData } = await supabase.auth.admin.getUserById(membership.user_id);
    if (userData?.user?.email) {
      return { email: userData.user.email, userId: membership.user_id };
    }
  }

  return null;
}

async function getOrganizationName(organizationId: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("organizations").select("name").eq("id", organizationId).single();
  return data?.name || "Tu Empresa";
}

async function sendBillingEmail(params: {
  organizationId: string;
  subject: string;
  html: string;
  branding: TenantEmailBranding;
  type: "renewal_reminder" | "plan_changed" | "payment_failed" | "subscription_activated";
  actionUrl: string;
}) {
  const admin = await getOrganizationAdminEmail(params.organizationId);
  if (!admin) {
    console.warn(`[Billing Notification] No admin email found for org ${params.organizationId}`);
    return { ok: false as const, error: "no_admin_email" };
  }

  const result = await sendTransactionalEmail({
    to: admin.email,
    subject: buildBrandedEmailSubject(params.subject, params.branding),
    html: params.html,
    senderName: resolveEmailSenderName(params.branding),
    notification: {
      source: "billing",
      sourceId: params.type,
      organizationId: params.organizationId,
      userId: admin.userId,
      actionUrl: params.actionUrl,
      title: params.subject,
    },
  });

  if (!result.ok) {
    console.error(
      `[Billing Notification] Failed (${params.type}) org=${params.organizationId} to=${admin.email}: ${result.error}`,
    );
    return result;
  }

  console.info(`[Billing Notification] Sent (${params.type}) org=${params.organizationId} to=${admin.email}`);
  return result;
}

export async function sendRenewalReminderEmail(organizationId: string, renewalDate: string, amount: string) {
  const [orgName, branding] = await Promise.all([
    getOrganizationName(organizationId),
    getTenantEmailBranding(organizationId),
  ]);
  const html = planRenewalReminderTemplate({ orgName, renewalDate, amount, branding });
  await sendBillingEmail({
    organizationId,
    subject: "Tu plan se renueva pronto",
    html,
    branding,
    type: "renewal_reminder",
    actionUrl: "/app/billing",
  });
  void sendPushToOrg(
    organizationId,
    {
      title: "Tu plan se renueva pronto",
      body: `El plan de ${orgName} se renueva el ${renewalDate} por ${amount}.`,
      url: "/app/billing",
    },
    { source: "billing", sourceId: "renewal_reminder", organizationId },
  ).catch(() => {});
}

export async function sendPlanChangedEmail(organizationId: string, planName: string) {
  const [orgName, branding] = await Promise.all([
    getOrganizationName(organizationId),
    getTenantEmailBranding(organizationId),
  ]);
  const html = planChangedTemplate({ orgName, planName, branding });
  await sendBillingEmail({
    organizationId,
    subject: "Tu plan ha sido actualizado",
    html,
    branding,
    type: "plan_changed",
    actionUrl: "/app/billing",
  });
  void sendPushToOrg(
    organizationId,
    {
      title: "Tu plan ha sido actualizado",
      body: `Tu nuevo plan activo es: ${planName}.`,
      url: "/app/billing",
    },
    { source: "billing", sourceId: "plan_changed", organizationId },
  ).catch(() => {});
}

export async function sendPaymentFailedEmail(organizationId: string, retryLink: string) {
  const [orgName, branding] = await Promise.all([
    getOrganizationName(organizationId),
    getTenantEmailBranding(organizationId),
  ]);
  const html = paymentFailedTemplate({ orgName, retryLink, branding });

  await sendBillingEmail({
    organizationId,
    subject: "Acción requerida: Problema con tu pago",
    html,
    branding,
    type: "payment_failed",
    actionUrl: "/app/billing",
  });
  void sendPushToOrg(
    organizationId,
    {
      title: "Problema con tu pago",
      body: "Hay un problema con el pago de tu suscripción. Revisá los detalles de facturación.",
      url: "/app/billing",
    },
    { source: "billing", sourceId: "payment_failed", organizationId },
  ).catch(() => {});
}

export async function sendSubscriptionActivatedEmail(params: {
  organizationId: string;
  planName: string;
  trialDays: number;
}) {
  const [orgName, branding, tenantAppUrl] = await Promise.all([
    getOrganizationName(params.organizationId),
    getTenantEmailBranding(params.organizationId),
    resolveTenantAppUrlByOrganizationId({
      organizationId: params.organizationId,
      fallbackAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://getbackplate.com",
    }),
  ]);
  const html = subscriptionActivatedTemplate({
    orgName,
    planName: params.planName,
    trialDays: params.trialDays,
    dashboardUrl: `${tenantAppUrl.replace(/\/$/, "")}/app/dashboard`,
    branding,
  });

  await sendBillingEmail({
    organizationId: params.organizationId,
    subject: "¡Tu suscripción ya está activa!",
    html,
    branding,
    type: "subscription_activated",
    actionUrl: "/app/dashboard",
  });
  void sendPushToOrg(
    params.organizationId,
    {
      title: "¡Tu suscripción ya está activa!",
      body: `Plan ${params.planName} activado. ¡Bienvenido a bordo!`,
      url: "/app/dashboard",
    },
    { source: "billing", sourceId: "subscription_activated", organizationId: params.organizationId },
  ).catch(() => {});
}

import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToOrg } from "@/infrastructure/push/send-to-org";
import {
  BILLING_SENDER_NAME,
  buildBillingSubject,
  paymentFailedTemplate,
  planRenewalReminderTemplate,
  successfulPaymentTemplate,
  subscriptionActivatedTemplate,
} from "@/shared/lib/email-templates/billing";
import { resolveTenantAppUrlByOrganizationId } from "@/shared/lib/custom-domains";

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
  return data?.name || "Your Company";
}

async function sendBillingEmail(params: {
  organizationId: string;
  subject: string;
  html: string;
  type: "renewal_reminder" | "plan_changed" | "payment_failed" | "subscription_activated" | "successful_payment";
  actionUrl: string;
  attachmentUrl?: string;
  attachmentName?: string;
  /**
   * Si este aviso tambien se manda por push a la org (sendPushToOrg alcanza a
   * todos los miembros activos), y admin.userId es un miembro real, el push
   * ya le garantiza su fila en la campanita -- el email va con userId:null
   * para no duplicarla. Cuando no hay push acompañando (ej: pago exitoso sin
   * sendPush), el email es la unica via y debe armar su propia fila.
   */
  pushAcompanaEsteAviso: boolean;
}) {
  const admin = await getOrganizationAdminEmail(params.organizationId);
  if (!admin) {
    console.warn(`[Billing Notification] No admin email found for org ${params.organizationId}`);
    return { ok: false as const, error: "no_admin_email" };
  }

  const result = await sendTransactionalEmail({
    to: admin.email,
    subject: buildBillingSubject(params.subject),
    html: params.html,
    senderName: BILLING_SENDER_NAME,
    attachmentUrl: params.attachmentUrl,
    attachmentName: params.attachmentName,
    notification: {
      source: "billing",
      sourceId: params.type,
      organizationId: params.organizationId,
      userId: params.pushAcompanaEsteAviso ? null : admin.userId,
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

export async function sendRenewalReminderEmail(
  organizationId: string,
  renewalDate: string,
  amount: string,
  lineItems?: Array<{ description: string; amount: string }>,
  usageNote?: string,
) {
  const orgName = await getOrganizationName(organizationId);
  const html = planRenewalReminderTemplate({ orgName, renewalDate, amount, lineItems, usageNote });
  await sendBillingEmail({
    organizationId,
    subject: "Your plan renews soon",
    html,
    type: "renewal_reminder",
    actionUrl: "/app/billing/portal-launch",
    pushAcompanaEsteAviso: true,
  });
  void sendPushToOrg(
    organizationId,
    {
      title: "Your plan renews soon",
      body: `${orgName}'s plan renews on ${renewalDate} for ${amount}.`,
      url: "/app/billing/portal-launch",
    },
    { source: "billing", sourceId: "renewal_reminder", organizationId },
  ).catch(() => {});
}
export async function sendPaymentFailedEmail(organizationId: string, retryLink: string) {
  const orgName = await getOrganizationName(organizationId);
  const html = paymentFailedTemplate({ orgName, retryLink });

  await sendBillingEmail({
    organizationId,
    subject: "Action required: Issue with your payment",
    html,
    type: "payment_failed",
    actionUrl: "/app/billing/portal-launch",
    pushAcompanaEsteAviso: true,
  });
  void sendPushToOrg(
    organizationId,
    {
      title: "Issue with your payment",
      body: "There is an issue with your subscription payment. Review your billing details.",
      url: "/app/billing/portal-launch",
    },
    { source: "billing", sourceId: "payment_failed", organizationId },
  ).catch(() => {});
}

export async function sendSubscriptionActivatedEmail(params: {
  organizationId: string;
  planName: string;
  trialDays: number;
}) {
  const [orgName, tenantAppUrl] = await Promise.all([
    getOrganizationName(params.organizationId),
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
  });

  await sendBillingEmail({
    organizationId: params.organizationId,
    subject: "Your subscription is now active!",
    html,
    type: "subscription_activated",
    actionUrl: "/app/dashboard",
    pushAcompanaEsteAviso: true,
  });
  void sendPushToOrg(
    params.organizationId,
    {
      title: "Your subscription is now active!",
      body: `${params.planName} plan activated. Welcome aboard!`,
      url: "/app/dashboard",
    },
    { source: "billing", sourceId: "subscription_activated", organizationId: params.organizationId },
  ).catch(() => {});
}

export async function sendSuccessfulPaymentEmail(params: {
  organizationId: string;
  invoiceUrl?: string;
  invoicePdfUrl?: string;
  invoiceNumber: string;
  amount: string;
  paymentDate: string;
  lineItems: Array<{ description: string; amount: string }>;
  extraR365Connections?: number;
  sendPush?: boolean;
}) {
  const [orgName, tenantAppUrl] = await Promise.all([
    getOrganizationName(params.organizationId),
    resolveTenantAppUrlByOrganizationId({
      organizationId: params.organizationId,
      fallbackAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://getbackplate.com",
    }),
  ]);
  const billingPortalUrl = `${tenantAppUrl.replace(/\/$/, "")}/app/billing/portal-launch`;
  const html = successfulPaymentTemplate({
    orgName,
    paymentDate: params.paymentDate,
    amount: params.amount,
    invoiceNumber: params.invoiceNumber,
    lineItems: params.lineItems,
    extraR365Connections: params.extraR365Connections,
    invoiceUrl: params.invoiceUrl,
    billingPortalUrl,
  });

  await sendBillingEmail({
    organizationId: params.organizationId,
    subject: `Payment received — ${params.amount}`,
    html,
    type: "successful_payment",
    actionUrl: params.invoiceUrl ?? "/app/billing/portal-launch",
    attachmentUrl: params.invoicePdfUrl,
    attachmentName: `Invoice-${params.invoiceNumber}.pdf`,
    pushAcompanaEsteAviso: Boolean(params.sendPush),
  });

  if (params.sendPush) {
    void sendPushToOrg(
      params.organizationId,
      {
        title: "Payment received",
        body: `Your payment of ${params.amount} was successful.`,
        url: params.invoiceUrl ?? "/app/billing/portal-launch",
      },
      { source: "billing", sourceId: "successful_payment", organizationId: params.organizationId },
    ).catch(() => {});
  }
}

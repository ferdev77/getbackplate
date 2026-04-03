import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  paymentFailedTemplate,
  planChangedTemplate,
  planRenewalReminderTemplate,
  subscriptionActivatedTemplate,
} from "@/shared/lib/email-templates/billing";

async function getOrganizationAdminEmail(organizationId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  const { data: settings } = await supabase
    .from("organization_settings")
    .select("billing_email")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (typeof settings?.billing_email === "string" && settings.billing_email.trim()) {
    return settings.billing_email.trim().toLowerCase();
  }

  const { data: roleRows } = await supabase
    .from("roles")
    .select("id")
    .in("code", ["company_admin", "manager"]);

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
      return userData.user.email;
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
  type: "renewal_reminder" | "plan_changed" | "payment_failed" | "subscription_activated";
}) {
  const email = await getOrganizationAdminEmail(params.organizationId);
  if (!email) {
    console.warn(`[Billing Notification] No admin email found for org ${params.organizationId}`);
    return { ok: false as const, error: "no_admin_email" };
  }

  const result = await sendTransactionalEmail({
    to: email,
    subject: params.subject,
    html: params.html,
  });

  if (!result.ok) {
    console.error(
      `[Billing Notification] Failed (${params.type}) org=${params.organizationId} to=${email}: ${result.error}`,
    );
    return result;
  }

  console.info(`[Billing Notification] Sent (${params.type}) org=${params.organizationId} to=${email}`);
  return result;
}

export async function sendRenewalReminderEmail(organizationId: string, renewalDate: string, amount: string) {
  const orgName = await getOrganizationName(organizationId);
  const html = planRenewalReminderTemplate({ orgName, renewalDate, amount });
  await sendBillingEmail({
    organizationId,
    subject: "Tu plan se renueva pronto",
    html,
    type: "renewal_reminder",
  });
}

export async function sendPlanChangedEmail(organizationId: string, planName: string) {
  const orgName = await getOrganizationName(organizationId);
  const html = planChangedTemplate({ orgName, planName });
  await sendBillingEmail({
    organizationId,
    subject: "Tu plan ha sido actualizado",
    html,
    type: "plan_changed",
  });
}

export async function sendPaymentFailedEmail(organizationId: string, retryLink: string) {
  const orgName = await getOrganizationName(organizationId);
  const html = paymentFailedTemplate({ orgName, retryLink });

  await sendBillingEmail({
    organizationId,
    subject: "Acción requerida: Problema con tu pago",
    html,
    type: "payment_failed",
  });
}

export async function sendSubscriptionActivatedEmail(params: {
  organizationId: string;
  planName: string;
  trialDays: number;
}) {
  const orgName = await getOrganizationName(params.organizationId);
  const html = subscriptionActivatedTemplate({
    orgName,
    planName: params.planName,
    trialDays: params.trialDays,
  });

  await sendBillingEmail({
    organizationId: params.organizationId,
    subject: "¡Tu suscripción ya está activa!",
    html,
    type: "subscription_activated",
  });
}

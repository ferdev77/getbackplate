import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { planRenewalReminderTemplate, planChangedTemplate, paymentFailedTemplate } from "@/shared/lib/email-templates/billing";

// Helper para encontrar el email de contacto de una organización
async function getOrganizationAdminEmail(organizationId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  
  // Opción 1: Validamos si la tabla organizations tiene contact_email (según modelo)
  const { data: orgData } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .single();

  if (!orgData) return null;

  // Opción 2: Buscamos al primer administrador/dueño de la org en organization_users
  const { data: admins } = await supabase
    .from("organization_users")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .limit(1);

  if (admins && admins.length > 0) {
    const userId = admins[0].user_id;
    // Debemos buscar el email del usuario en auth.users
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    if (userData?.user?.email) {
      return userData.user.email;
    }
  }

  // Fallback a un email por defecto o null
  return null;
}

async function getOrganizationName(organizationId: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("organizations").select("name").eq("id", organizationId).single();
  return data?.name || "Tu Empresa";
}

export async function sendRenewalReminderEmail(organizationId: string, renewalDate: string, amount: string) {
  const email = await getOrganizationAdminEmail(organizationId);
  if (!email) {
    console.warn(`[Billing Notification] No admin email found for org ${organizationId}`);
    return;
  }
  const orgName = await getOrganizationName(organizationId);
  const html = planRenewalReminderTemplate({ orgName, renewalDate, amount });
  
  await sendTransactionalEmail({
    to: email,
    subject: "Tu plan se renueva pronto",
    html
  });
}

export async function sendPlanChangedEmail(organizationId: string, planName: string) {
  const email = await getOrganizationAdminEmail(organizationId);
  if (!email) {
    console.warn(`[Billing Notification] No admin email found for org ${organizationId}`);
    return;
  }
  const orgName = await getOrganizationName(organizationId);
  const html = planChangedTemplate({ orgName, planName });
  
  await sendTransactionalEmail({
    to: email,
    subject: "Tu plan ha sido actualizado",
    html
  });
}

export async function sendPaymentFailedEmail(organizationId: string, retryLink: string) {
  const email = await getOrganizationAdminEmail(organizationId);
  if (!email) {
    console.warn(`[Billing Notification] No admin email found for org ${organizationId}`);
    return;
  }
  const orgName = await getOrganizationName(organizationId);
  const html = paymentFailedTemplate({ orgName, retryLink });
  
  await sendTransactionalEmail({
    to: email,
    subject: "Acción requerida: Problema con tu pago",
    html
  });
}

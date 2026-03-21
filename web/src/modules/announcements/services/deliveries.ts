import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendTwilioMessage } from "@/infrastructure/twilio/client";
import { getAuthEmailByUserId } from "@/shared/lib/auth-users";
import { AnnouncementScope, parseAnnouncementScope } from "../lib/scope";

export async function processAnnouncementDeliveries() {
  const supabase = await createSupabaseServerClient();
  
  // 1. Fetch queued deliveries
  const { data: deliveries, error: fetchError } = await supabase
    .from("announcement_deliveries")
    .select(`
      id,
      organization_id,
      announcement_id,
      channel,
      announcement:announcements (
        title,
        body,
        target_scope
      )
    `)
    .eq("status", "queued")
    .limit(50); // Process in batches
    
  if (fetchError) {
    console.error("Failed to fetch queued deliveries:", fetchError);
    return { success: false, error: fetchError.message };
  }

  if (!deliveries || deliveries.length === 0) {
    return { success: true, processed: 0, message: "No queued deliveries found." };
  }

  let successCount = 0;
  let failCount = 0;

  for (const delivery of deliveries) {
    try {
      const announcement = Array.isArray(delivery.announcement) 
        ? delivery.announcement[0] 
        : delivery.announcement;

      if (!announcement) {
        await markDeliveryStatus(supabase, delivery.id, "failed", "Announcement not found");
        failCount++;
        continue;
      }

      const scope = parseAnnouncementScope(announcement.target_scope);
      
      // 2. Resolve audience to phones
      const audience = await resolveAnnouncementAudienceContacts(supabase, delivery.organization_id, scope);
      const targetContacts =
        delivery.channel === "email"
          ? audience.emails
          : audience.phones;

      if (targetContacts.length === 0) {
        await markDeliveryStatus(supabase, delivery.id, "sent", "No se encontraron contactos validos en la audiencia");
        successCount++;
        continue;
      }

      // 3. Send messages
      // Note: Realistically, you should create a robust queue for Fan-out, 
      // but considering Twilio supports multiple recipients or we can loop, 
      // we will loop here for the MVP.
      let sentCount = 0;
      const errorMsgs: string[] = [];

      for (const contact of targetContacts) {
        const result =
          delivery.channel === "email"
            ? await sendAnnouncementEmail(contact, announcement.title, announcement.body)
            : await sendTwilioMessage(
                contact,
                `*${announcement.title}*\n\n${announcement.body}`,
                delivery.channel as "whatsapp" | "sms",
              );
        
        if (result.success) {
          sentCount++;
        } else {
          errorMsgs.push(result.error || "Unknown error");
        }
      }

      if (sentCount > 0) {
        await markDeliveryStatus(
          supabase, 
          delivery.id,
          "sent",
          `Sent to ${sentCount}/${targetContacts.length}. Errors: ${errorMsgs.join(", ")}`
        );
        successCount++;
      } else {
        await markDeliveryStatus(
          supabase, 
          delivery.id, 
          "failed", 
          `All sends failed. Errors: ${errorMsgs.join(", ")}`
        );
        failCount++;
      }

    } catch (err: unknown) {
      console.error(`Error processing delivery ${delivery.id}:`, err);
      const message = err instanceof Error ? err.message : "Error desconocido";
      await markDeliveryStatus(supabase, delivery.id, "failed", message);
      failCount++;
    }
  }

  return { success: true, processed: deliveries.length, successCount, failCount };
}

async function sendAnnouncementEmail(email: string, title: string, body: string) {
  const result = await sendTransactionalEmail({
    to: email,
    subject: `Nuevo aviso: ${title}`,
    html: `
      <h2 style="margin:0 0 10px 0;">${title}</h2>
      <p style="margin:0 0 14px 0;color:#444;">${body.replace(/\n/g, "<br/>")}</p>
      <p style="margin:14px 0 0 0;font-size:12px;color:#666;">Entra a GetBackplate para ver el aviso completo.</p>
    `,
    text: `${title}\n\n${body}\n\nIngresa a GetBackplate para ver el aviso completo.`,
  });

  return result.ok
    ? { success: true as const }
    : { success: false as const, error: result.error };
}

async function resolveAnnouncementAudienceContacts(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  scope: AnnouncementScope
) {
  const hasSpecificScope = 
    scope.locations.length > 0 || 
    scope.department_ids.length > 0 || 
    scope.position_ids.length > 0 || 
    scope.users.length > 0;

  const { data: employees, error } = await supabase
    .from("employees")
    .select("user_id, branch_id, department_id, position, phone_country_code, phone, status")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (error || !employees) {
    throw new Error(`No se pudo resolver audiencia de aviso: ${error?.message ?? "sin datos"}`);
  }

  const { data: userProfiles } = await supabase
    .from("organization_user_profiles")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("is_employee", false)
    .is("deleted_at", null)
    .not("user_id", "is", null);

  const matchedPhones = new Set<string>();
  const matchedUserIds = new Set<string>();

  for (const emp of employees) {
    if (!emp.user_id) continue;
    let isMatch = false;

    if (!hasSpecificScope) {
      isMatch = true;
    } else {
      if (emp.branch_id && scope.locations.includes(emp.branch_id)) isMatch = true;
      if (emp.department_id && scope.department_ids.includes(emp.department_id)) isMatch = true;
      if (emp.position && scope.position_ids.includes(emp.position)) isMatch = true;
      if (scope.users.includes(emp.user_id)) isMatch = true;
    }

    if (isMatch) {
      matchedUserIds.add(emp.user_id);

      if (!emp.phone) continue;
      // Format phone: e.g. +54 9 11 1234 5678 -> +5491112345678
      const code = (emp.phone_country_code || "").replace(/[^0-9+]/g, "");
      const number = emp.phone.replace(/[^0-9]/g, "");
      
      let fullNumber = number;
      if (code && !number.startsWith(code) && !number.startsWith(code.replace("+", ""))) {
         fullNumber = `${code}${number}`;
      } else if (!code && !number.startsWith("+")) {
         // Best effort fallback, guess it's already got a country code or needs one
         fullNumber = `+${number}`; // Might fail in Twilio if not fully qualified
      } else if (number.startsWith("+")) {
        fullNumber = number;
      } else {
         fullNumber = `+${number}`;
      }

      matchedPhones.add(fullNumber);
    }
  }

  for (const profile of userProfiles ?? []) {
    if (!profile.user_id) continue;
    if (!hasSpecificScope || scope.users.includes(profile.user_id)) {
      matchedUserIds.add(profile.user_id);
    }
  }

  const emailByUserId = await getAuthEmailByUserId([...matchedUserIds]);
  const emails = [...emailByUserId.values()].filter(Boolean);

  return {
    phones: Array.from(matchedPhones),
    emails,
  };
}

async function markDeliveryStatus(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  deliveryId: string,
  status: "sent" | "failed",
  errorMsg?: string,
) {
  await supabase
    .from("announcement_deliveries")
    .update({ 
      status, 
      error_message: errorMsg ? errorMsg.substring(0, 255) : null,
      processed_at: new Date().toISOString()
    })
    .eq("id", deliveryId);
}

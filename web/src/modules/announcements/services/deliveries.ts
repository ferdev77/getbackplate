import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendTwilioMessage } from "@/infrastructure/twilio/client";
import { getAuthEmailByUserId } from "@/shared/lib/auth-users";
import { AnnouncementScope, parseAnnouncementScope } from "../lib/scope";

export async function processAnnouncementDeliveries() {
  const supabase = createSupabaseAdminClient();
  
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
    .order("created_at", { ascending: true })
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
  let sentContactsCount = 0;
  const processedKeys = new Set<string>();

  for (const delivery of deliveries) {
    try {
      const dedupeKey = `${delivery.announcement_id}:${delivery.channel}`;
      if (processedKeys.has(dedupeKey)) {
        await markDeliveryStatus(supabase, delivery.id, "sent");
        continue;
      }
      processedKeys.add(dedupeKey);

      const announcement = Array.isArray(delivery.announcement) 
        ? delivery.announcement[0] 
        : delivery.announcement;

      if (!announcement) {
        await markDeliveryStatus(supabase, delivery.id, "failed");
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
        await markDeliveryStatus(supabase, delivery.id, "sent");
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
        await markDeliveryStatus(supabase, delivery.id, "sent");
        successCount++;
        sentContactsCount += sentCount;
      } else {
        await markDeliveryStatus(supabase, delivery.id, "failed");
        failCount++;
      }

    } catch (err: unknown) {
      console.error(`Error processing delivery ${delivery.id}:`, err);
      await markDeliveryStatus(supabase, delivery.id, "failed");
      failCount++;
    }
  }

  return { success: true, processed: deliveries.length, successCount, failCount, sentContactsCount };
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
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  scope: AnnouncementScope
) {
  const hasSpecificScope = 
    scope.locations.length > 0 || 
    scope.department_ids.length > 0 || 
    scope.position_ids.length > 0 || 
    scope.users.length > 0;

  const [{ data: employees, error }, { data: positionRows }, { data: profiles }, { data: memberships }] = await Promise.all([
    supabase
      .from("employees")
      .select("user_id, branch_id, department_id, position, phone_country_code, phone, status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("department_positions")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("organization_user_profiles")
      .select("user_id, branch_id, department_id, position_id, phone, status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("memberships")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .not("user_id", "is", null),
  ]);

  if (error || !employees) {
    throw new Error(`No se pudo resolver audiencia de aviso: ${error?.message ?? "sin datos"}`);
  }

  const matchedPhones = new Set<string>();
  const matchedUserIds = new Set<string>();
  const membershipUserIds = new Set((memberships ?? []).map((row) => row.user_id).filter(Boolean));
  const positionIdsByName = new Map<string, string[]>();

  for (const row of positionRows ?? []) {
    const key = row.name.trim().toLowerCase();
    if (!key) continue;
    const list = positionIdsByName.get(key) ?? [];
    list.push(row.id);
    positionIdsByName.set(key, list);
  }

  for (const emp of employees) {
    if (!emp.user_id) continue;
    let isMatch = false;

    if (!hasSpecificScope) {
      isMatch = membershipUserIds.has(emp.user_id);
    } else {
      if (emp.branch_id && scope.locations.includes(emp.branch_id)) isMatch = true;
      if (emp.department_id && scope.department_ids.includes(emp.department_id)) isMatch = true;
       const employeePositionIds = emp.position
         ? positionIdsByName.get(emp.position.trim().toLowerCase()) ?? []
         : [];
       if (employeePositionIds.some((positionId) => scope.position_ids.includes(positionId))) isMatch = true;
      if (scope.users.includes(emp.user_id)) isMatch = true;
    }

    if (isMatch) {
      matchedUserIds.add(emp.user_id);
    }
  }

  for (const profile of profiles ?? []) {
    if (!profile.user_id) continue;

    let isMatch = false;
    if (!hasSpecificScope) {
      isMatch = membershipUserIds.has(profile.user_id);
    } else {
      if (profile.branch_id && scope.locations.includes(profile.branch_id)) isMatch = true;
      if (profile.department_id && scope.department_ids.includes(profile.department_id)) isMatch = true;
      if (profile.position_id && scope.position_ids.includes(profile.position_id)) isMatch = true;
      if (scope.users.includes(profile.user_id)) isMatch = true;
    }

    if (isMatch) {
      matchedUserIds.add(profile.user_id);
    }
  }

  if (!hasSpecificScope) {
    for (const membershipUserId of membershipUserIds) {
      matchedUserIds.add(membershipUserId);
    }
  } else {
    for (const userId of scope.users) {
      matchedUserIds.add(userId);
    }
  }

  const emailByUserId = await getAuthEmailByUserId([...matchedUserIds]);
  const emails = [...emailByUserId.values()].filter(Boolean);

  for (const emp of employees ?? []) {
    if (!emp.user_id || !matchedUserIds.has(emp.user_id) || !emp.phone) continue;

    const code = (emp.phone_country_code || "").replace(/[^0-9+]/g, "");
    const number = emp.phone.replace(/[^0-9]/g, "");
    if (!number) continue;

    if (code && !number.startsWith(code) && !number.startsWith(code.replace("+", ""))) {
      matchedPhones.add(`${code}${number}`);
    } else {
      matchedPhones.add(number.startsWith("+") ? number : `+${number}`);
    }
  }

  for (const profile of profiles ?? []) {
    if (!profile.user_id || !matchedUserIds.has(profile.user_id) || !profile.phone) continue;
    const number = profile.phone.replace(/[^0-9+]/g, "");
    if (!number) continue;
    matchedPhones.add(number.startsWith("+") ? number : `+${number}`);
  }

  return {
    phones: Array.from(matchedPhones),
    emails,
  };
}

async function markDeliveryStatus(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  deliveryId: string,
  status: "sent" | "failed",
) {
  await supabase
    .from("announcement_deliveries")
    .update({ 
      status, 
      sent_at: new Date().toISOString(),
    })
    .eq("id", deliveryId);
}

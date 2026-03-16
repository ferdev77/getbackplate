import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { sendTwilioMessage } from "@/infrastructure/twilio/client";
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
      const audiencePhones = await resolveAudiencePhones(
        supabase, 
        delivery.organization_id, 
        scope
      );

      if (audiencePhones.length === 0) {
        await markDeliveryStatus(supabase, delivery.id, "sent", "No valid phones found in audience");
        successCount++;
        continue;
      }

      // 3. Send messages
      // Note: Realistically, you should create a robust queue for Fan-out, 
      // but considering Twilio supports multiple recipients or we can loop, 
      // we will loop here for the MVP.
      let sentCount = 0;
      let errorMsgs: string[] = [];

      for (const phone of audiencePhones) {
        const result = await sendTwilioMessage(
          phone, 
          `*${announcement.title}*\n\n${announcement.body}`, 
          delivery.channel as "whatsapp" | "sms"
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
          `Sent to ${sentCount}/${audiencePhones.length}. Errors: ${errorMsgs.join(", ")}`
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

    } catch (err: any) {
      console.error(`Error processing delivery ${delivery.id}:`, err);
      await markDeliveryStatus(supabase, delivery.id, "failed", err.message);
      failCount++;
    }
  }

  return { success: true, processed: deliveries.length, successCount, failCount };
}

async function resolveAudiencePhones(
  supabase: any,
  organizationId: string,
  scope: AnnouncementScope
): Promise<string[]> {
  
  // We need to fetch all employees in the organization that match the scope
  // If scope is entirely empty, we could assume ALL employees, or NO employees. 
  // Let's build a query.
  
  let query = supabase
    .from("employees")
    .select("phone_country_code, phone")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .not("phone", "is", null);

  // If we have specific filters, we apply them. If ALL are empty, it likely means
  // the entire organization (or no restriction). We will send to all active in that case,
  // OR we can restrict based on how UI builds it. 
  // In typical SaaS, empty scope = all company. Let's check if we have any.
  const hasSpecificScope = 
    scope.locations.length > 0 || 
    scope.department_ids.length > 0 || 
    scope.position_ids.length > 0 || 
    scope.users.length > 0;

  if (hasSpecificScope) {
    // Supabase JS doesn't have an easy OR across different joined tables for IN clauses without RPC.
    // For MVP, if it gets too complex, we fetch all active and filter in memory.
    const { data: allActive } = await query;
    if (!allActive) return [];

    const { data: matchingUsers, error } = await supabase.rpc("resolve_audience_users", {
       p_org_id: organizationId,
       p_locations: scope.locations,
       p_departments: scope.department_ids,
       p_positions: scope.position_ids,
       p_users: scope.users
    });
    
    // If RPC doesn't exist, fallback to in-memory filtering by fetching more details
    // It's highly likely the RPC resolve_audience_users doesn't exist.
    // Let's do in-memory filtering for MVP since we know the typical payload size is small.
  }
  
  // Re-fetch with details for in-memory filter
  const { data: employees, error } = await supabase
    .from("employees")
    .select("user_id, branch_id, department_id, position, phone_country_code, phone")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .not("phone", "is", null);

  if (error || !employees) return [];

  const matchedPhones = new Set<string>();

  for (const emp of employees) {
    if (!emp.phone) continue;
    
    let isMatch = false;

    if (!hasSpecificScope) {
      isMatch = true;
    } else {
      if (scope.locations.includes(emp.branch_id)) isMatch = true;
      if (emp.department_id && scope.department_ids.includes(emp.department_id)) isMatch = true;
      if (emp.position && scope.position_ids.includes(emp.position)) isMatch = true; // Assuming position is an ID or matched by name
      if (scope.users.includes(emp.user_id)) isMatch = true;
    }

    if (isMatch) {
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

  return Array.from(matchedPhones);
}

async function markDeliveryStatus(supabase: any, deliveryId: string, status: "sent" | "failed", errorMsg?: string) {
  await supabase
    .from("announcement_deliveries")
    .update({ 
      status, 
      error_message: errorMsg ? errorMsg.substring(0, 255) : null,
      processed_at: new Date().toISOString()
    })
    .eq("id", deliveryId);
}

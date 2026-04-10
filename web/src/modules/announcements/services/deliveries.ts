import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendTwilioMessage } from "@/infrastructure/twilio/client";
import { getAuthEmailByUserId } from "@/shared/lib/auth-users";
import { AnnouncementScope, parseAnnouncementScope } from "../lib/scope";

type DeliveryRow = {
  id: string;
  organization_id: string;
  announcement_id: string;
  channel: string;
  announcement:
    | {
        title: string;
        body: string;
        target_scope: unknown;
      }
    | {
        title: string;
        body: string;
        target_scope: unknown;
      }[]
    | null;
};

const DELIVERY_BATCH_SIZE = Number(process.env.ANNOUNCEMENT_DELIVERIES_BATCH_SIZE ?? "50");
const DELIVERY_MAX_CONCURRENCY = Number(process.env.ANNOUNCEMENT_DELIVERIES_CONCURRENCY ?? "4");
const DELIVERY_SEND_TIMEOUT_MS = Number(process.env.ANNOUNCEMENT_DELIVERIES_SEND_TIMEOUT_MS ?? "12000");
const DELIVERY_SEND_RETRIES = Number(process.env.ANNOUNCEMENT_DELIVERIES_SEND_RETRIES ?? "2");
const RETRY_BASE_DELAY_MS = 250;

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withRetries<T>(
  task: (attempt: number) => Promise<T>,
  options?: { retries?: number; baseDelayMs?: number },
) {
  const retries = clampNumber(options?.retries ?? DELIVERY_SEND_RETRIES, 0, 5, DELIVERY_SEND_RETRIES);
  const baseDelayMs = clampNumber(options?.baseDelayMs ?? RETRY_BASE_DELAY_MS, 50, 2_000, RETRY_BASE_DELAY_MS);

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt + 1);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      const delay = baseDelayMs * 2 ** attempt;
      await sleep(delay);
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("retry exhausted"));
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const safeConcurrency = clampNumber(concurrency, 1, 20, 4);

  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(safeConcurrency, items.length) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}

export async function processAnnouncementDeliveries() {
  const supabase = createSupabaseAdminClient();
  const batchSize = clampNumber(DELIVERY_BATCH_SIZE, 1, 200, 50);
  const sendConcurrency = clampNumber(DELIVERY_MAX_CONCURRENCY, 1, 20, 4);
  
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
    .limit(batchSize);
    
  if (fetchError) {
    console.error("Failed to fetch queued deliveries:", fetchError);
    return { success: false, error: fetchError.message };
  }

  if (!deliveries || deliveries.length === 0) {
    return { success: true, processed: 0, message: "No queued deliveries found." };
  }

  const grouped = new Map<string, DeliveryRow[]>();
  for (const row of deliveries as DeliveryRow[]) {
    const dedupeKey = `${row.announcement_id}:${row.channel}`;
    const list = grouped.get(dedupeKey) ?? [];
    list.push(row);
    grouped.set(dedupeKey, list);
  }

  let successCount = 0;
  let failCount = 0;
  let sentContactsCount = 0;

  const groups = Array.from(grouped.values());
  await mapWithConcurrency(groups, sendConcurrency, async (rows) => {
    const primary = rows[0];

    try {
      const announcement = Array.isArray(primary.announcement)
        ? primary.announcement[0]
        : primary.announcement;

      if (!announcement) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "failed");
        failCount += rows.length;
        return;
      }

      const scope = parseAnnouncementScope(announcement.target_scope);

      const audience = await resolveAnnouncementAudienceContacts(
        supabase,
        primary.organization_id,
        scope,
      );
      const targetContacts = primary.channel === "email" ? audience.emails : audience.phones;

      if (targetContacts.length === 0) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "sent");
        successCount += rows.length;
        return;
      }

      const sendResults = await mapWithConcurrency(targetContacts, sendConcurrency, async (contact) => {
        return withRetries(async () => {
          if (primary.channel === "email") {
            return withTimeout(
              sendAnnouncementEmail(contact, announcement.title, announcement.body),
              DELIVERY_SEND_TIMEOUT_MS,
              `announcement email to ${contact}`,
            );
          }

          return withTimeout(
            sendTwilioMessage(
              contact,
              `*${announcement.title}*\n\n${announcement.body}`,
              primary.channel as "whatsapp" | "sms",
            ),
            DELIVERY_SEND_TIMEOUT_MS,
            `announcement ${primary.channel} to ${contact}`,
          );
        });
      });

      const sentCount = sendResults.filter((result) => result.success).length;

      if (sentCount > 0) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "sent");
        successCount += rows.length;
        sentContactsCount += sentCount;
      } else {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "failed");
        failCount += rows.length;
      }
    } catch (err: unknown) {
      console.error(`Error processing delivery group ${primary.announcement_id}:${primary.channel}:`, err);
      await markDeliveryStatuses(supabase, rows.map((row) => row.id), "failed");
      failCount += rows.length;
    }
  });

  return {
    success: true,
    processed: deliveries.length,
    successCount,
    failCount,
    sentContactsCount,
    groupsProcessed: groups.length,
    batchSize,
    sendConcurrency,
  };
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

async function markDeliveryStatuses(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  deliveryIds: string[],
  status: "sent" | "failed",
) {
  if (!deliveryIds.length) return;

  await supabase
    .from("announcement_deliveries")
    .update({ 
      status, 
      sent_at: new Date().toISOString(),
    })
    .in("id", deliveryIds);
}

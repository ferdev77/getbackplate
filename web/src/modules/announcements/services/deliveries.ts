import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendTwilioMessage } from "@/infrastructure/twilio/client";
import {
  buildBrandedEmailSubject,
  getTenantEmailBranding,
  resolveEmailSenderName,
  type TenantEmailBranding,
} from "@/shared/lib/email-branding";
import { resolveAudienceContacts } from "@/shared/lib/audience-resolver";
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
  const brandingByOrganizationId = new Map<string, Awaited<ReturnType<typeof getTenantEmailBranding>>>();
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

      const audience = await resolveAudienceContacts({
        supabase,
        organizationId: primary.organization_id,
        scope: {
          locations: scope.locations,
          department_ids: scope.department_ids,
          position_ids: scope.position_ids,
          users: scope.users,
        },
      });
      const targetContacts = primary.channel === "email" ? audience.emails : audience.phones;

      if (targetContacts.length === 0) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "sent");
        successCount += rows.length;
        return;
      }

      const sendResults = await mapWithConcurrency(targetContacts, sendConcurrency, async (contact) => {
        return withRetries(async () => {
          if (primary.channel === "email") {
            let branding = brandingByOrganizationId.get(primary.organization_id);
            if (!branding) {
              branding = await getTenantEmailBranding(primary.organization_id);
              brandingByOrganizationId.set(primary.organization_id, branding);
            }
            return withTimeout(
              sendAnnouncementEmail(contact, announcement.title, announcement.body, branding),
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

async function sendAnnouncementEmail(email: string, title: string, body: string, branding: TenantEmailBranding) {
  const brandName = branding.companyName;
  const result = await sendTransactionalEmail({
    to: email,
    subject: buildBrandedEmailSubject(`Nuevo aviso: ${title}`, branding),
    html: `
      <h2 style="margin:0 0 10px 0;">${title}</h2>
      <p style="margin:0 0 14px 0;color:#444;">${body.replace(/\n/g, "<br/>")}</p>
      <p style="margin:14px 0 0 0;font-size:12px;color:#666;">Entra a ${brandName} para ver el aviso completo.</p>
    `,
    text: `${title}\n\n${body}\n\nIngresa a ${brandName} para ver el aviso completo.`,
    senderName: resolveEmailSenderName(branding),
  });

  return result.ok
    ? { success: true as const }
    : { success: false as const, error: result.error };
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

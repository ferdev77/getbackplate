import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendPushPorRol } from "@/shared/lib/notification-links";
import {
  buildBrandedEmailSubject,
  getTenantEmailBranding,
  resolveEmailSenderName,
  type TenantEmailBranding,
} from "@/shared/lib/email-branding";
import { resolveAudienceContacts } from "@/shared/lib/audience-resolver";
import { userIdParaEmailSinDuplicarCampanita } from "@/shared/lib/notification-recipients";
import { parseAnnouncementScope } from "../lib/scope";

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
        publish_at: string | null;
        expires_at: string | null;
      }
    | {
        title: string;
        body: string;
        target_scope: unknown;
        publish_at: string | null;
        expires_at: string | null;
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

  // 1. Leer IDs candidatos (solo IDs, sin datos pesados)
  const { data: candidates, error: candidatesError } = await supabase
    .from("announcement_deliveries")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (candidatesError) {
    console.error("Failed to fetch candidate deliveries:", candidatesError);
    return { success: false, error: candidatesError.message };
  }

  if (!candidates || candidates.length === 0) {
    return { success: true, processed: 0, message: "No queued deliveries found." };
  }

  const candidateIds = candidates.map((r) => r.id);

  // 2. Claim atómico: UPDATE status='processing' WHERE id IN candidates AND status='queued'
  // Solo se actualizan las filas que siguen en 'queued' en este momento.
  // Si otro proceso corrió al mismo tiempo, su UPDATE no encontrará filas y no procesará nada.
  const { data: deliveries, error: claimError } = await supabase
    .from("announcement_deliveries")
    .update({ status: "processing" })
    .in("id", candidateIds)
    .eq("status", "queued")
    .select(`
      id,
      organization_id,
      announcement_id,
      channel,
      announcement:announcements (
        title,
        body,
        target_scope,
        publish_at,
        expires_at
      )
    `);

  if (claimError) {
    console.error("Failed to claim deliveries:", claimError);
    return { success: false, error: claimError.message };
  }

  if (!deliveries || deliveries.length === 0) {
    return { success: true, processed: 0, message: "No deliveries claimed (taken by another process)." };
  }

  const grouped = new Map<string, DeliveryRow[]>();
  for (const row of deliveries as DeliveryRow[]) {
    const dedupeKey = `${row.announcement_id}:${row.channel}`;
    const list = grouped.get(dedupeKey) ?? [];
    list.push(row);
    grouped.set(dedupeKey, list);
  }

  // Que avisos de este lote tambien salen por push. El push ya deja la fila en
  // la campanita de cada destinatario, asi que el email del MISMO aviso no
  // debe volver a dejarla (ver userIdParaEmailSinDuplicarCampanita).
  //
  // Se consulta la tabla en vez de mirar solo el lote reclamado porque el push
  // y el email son filas distintas: el batch puede partirlas en dos corridas y
  // el email quedaria sin saber que su push gemelo existe.
  const announcementIdsDelLote = [...new Set((deliveries as DeliveryRow[]).map((row) => row.announcement_id))];
  const { data: entregasPush } = await supabase
    .from("announcement_deliveries")
    .select("announcement_id")
    .in("announcement_id", announcementIdsDelLote)
    .eq("channel", "push");
  const avisosQueTambienVanPorPush = new Set(
    (entregasPush ?? []).map((row) => row.announcement_id).filter(Boolean),
  );

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

      if (!isAnnouncementDeliverable(announcement, new Date())) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "expired");
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

      // Releer justo antes de cruzar el limite externo. El aviso pudo vencer o
      // ser editado mientras se resolvia una audiencia grande.
      const eligibility = await readAnnouncementEligibility(
        supabase,
        primary.organization_id,
        primary.announcement_id,
      );
      if (eligibility === "missing") {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "failed");
        failCount += rows.length;
        return;
      }
      if (!isAnnouncementDeliverable(eligibility, new Date())) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "expired");
        return;
      }

      // Canal in_app: no se encola mas, porque la campanita la escribe el push
      // (que ahora es obligatorio). Pueden quedar filas viejas de cuando in_app
      // era un canal elegible aparte, y hasta hoy caian al camino de contactos
      // y terminaban mandando un mensaje que no correspondia.
      //
      // Si el mismo aviso tiene su fila push, esa ya deja la campanita y esta
      // se cierra sin hacer nada. Si no la tiene (aviso viejo que se creo solo
      // con in_app), se manda por push: es lo unico que escribe la campanita, y
      // al no haber gemela no puede duplicarla.
      if (primary.channel === "in_app" && avisosQueTambienVanPorPush.has(primary.announcement_id)) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "sent");
        successCount += rows.length;
        return;
      }

      // Canal push: acotado a los usuarios resueltos por el alcance del aviso
      if (primary.channel === "push" || primary.channel === "in_app") {
        try {
          await withTimeout(
            sendPushPorRol({
              supabase,
              organizationId: primary.organization_id,
              userIds: audience.userIds,
              payload: { title: announcement.title, body: announcement.body },
              adminUrl: "/app/announcements",
              employeeUrl: "/portal/announcements",
              options: {
                source: "announcement",
                sourceId: primary.announcement_id,
                organizationId: primary.organization_id,
              },
            }),
            DELIVERY_SEND_TIMEOUT_MS,
            `announcement push to org ${primary.organization_id}`,
          );
          await markDeliveryStatuses(supabase, rows.map((row) => row.id), "sent");
          successCount += rows.length;
        } catch (err) {
          console.error(`Error procesando push delivery para org ${primary.organization_id}:`, err);
          await markDeliveryStatuses(supabase, rows.map((row) => row.id), "failed");
          failCount += rows.length;
        }
        return;
      }

      // SMS discontinuado. Puede haber filas 'queued' creadas antes del corte:
      // se cierran sin enviar en vez de dejarlas girando en la cola para
      // siempre. Se marcan 'expired' (no 'failed') porque no es un error de
      // entrega: el canal dejo de existir.
      if (primary.channel === "sms") {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "expired");
        return;
      }

      const targetContacts = audience.emails;

      if (targetContacts.length === 0) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "sent");
        successCount += rows.length;
        return;
      }

      const sendResults = await mapWithConcurrency(targetContacts, sendConcurrency, async (contact) => {
        return withRetries(async () => {
          // Cada reintento vuelve a respetar el limite exacto de expiracion.
          if (!isAnnouncementDeliverable(eligibility, new Date())) {
            return { success: false as const, expired: true as const };
          }
          // Llegado aca el canal solo puede ser email: push tiene su rama propia
          // mas arriba, in_app lo resuelve el push, y sms se cierra antes.
          let branding = brandingByOrganizationId.get(primary.organization_id);
          if (!branding) {
            branding = await getTenantEmailBranding(primary.organization_id);
            brandingByOrganizationId.set(primary.organization_id, branding);
          }
          return withTimeout(
            sendAnnouncementEmail(contact, announcement.title, announcement.body, branding, {
              organizationId: primary.organization_id,
              announcementId: primary.announcement_id,
              // Si este aviso tambien sale por push, quien este en el grupo
              // de push ya tiene su fila en la campanita: el email no la
              // duplica. Al resto (contacto sin cuenta o fuera del alcance
              // del push) se le arma la suya, que es su unica via.
              userId: avisosQueTambienVanPorPush.has(primary.announcement_id)
                ? userIdParaEmailSinDuplicarCampanita(audience.userIdByEmail[contact], audience.userIds)
                : audience.userIdByEmail[contact],
            }),
            DELIVERY_SEND_TIMEOUT_MS,
            `announcement email to ${contact}`,
          );
        });
      });

      const sentCount = sendResults.filter((result) => result.success).length;
      const allExpired = sendResults.length > 0 && sendResults.every((result) => "expired" in result);

      if (sentCount > 0) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "sent");
        successCount += rows.length;
        sentContactsCount += sentCount;
      } else if (allExpired) {
        await markDeliveryStatuses(supabase, rows.map((row) => row.id), "expired");
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

type AnnouncementEligibility = {
  publish_at: string | null;
  expires_at: string | null;
};

function isAnnouncementDeliverable(announcement: AnnouncementEligibility, now: Date) {
  const nowTime = now.getTime();
  const publishAt = announcement.publish_at ? new Date(announcement.publish_at).getTime() : null;
  const expiresAt = announcement.expires_at ? new Date(announcement.expires_at).getTime() : null;
  return (publishAt === null || publishAt <= nowTime) && (expiresAt === null || expiresAt > nowTime);
}

async function readAnnouncementEligibility(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  announcementId: string,
): Promise<AnnouncementEligibility | "missing"> {
  const { data, error } = await supabase
    .from("announcements")
    .select("publish_at, expires_at")
    .eq("organization_id", organizationId)
    .eq("id", announcementId)
    .maybeSingle();

  if (error) throw new Error(`Failed to recheck announcement lifecycle: ${error.message}`);
  return data ?? "missing";
}

async function sendAnnouncementEmail(
  email: string,
  title: string,
  body: string,
  branding: TenantEmailBranding,
  notification: { organizationId: string; announcementId: string; userId?: string | null },
) {
  const brandName = branding.companyName;
  const result = await sendTransactionalEmail({
    to: email,
    subject: buildBrandedEmailSubject(`New announcement: ${title}`, branding),
    html: `
      <h2 style="margin:0 0 10px 0;">${title}</h2>
      <p style="margin:0 0 14px 0;color:#444;">${body.replace(/\n/g, "<br/>")}</p>
      <p style="margin:14px 0 0 0;font-size:12px;color:#666;">Go to ${brandName} to view the full announcement.</p>
    `,
    text: `${title}\n\n${body}\n\nGo to ${brandName} to view the full announcement.`,
    senderName: resolveEmailSenderName(branding),
    notification: {
      source: "announcement",
      sourceId: notification.announcementId,
      organizationId: notification.organizationId,
      userId: notification.userId,
      actionUrl: "/portal/announcements",
      title: `New announcement: ${title}`,
    },
  });

  return result.ok
    ? { success: true as const }
    : { success: false as const, error: result.error };
}

async function markDeliveryStatuses(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  deliveryIds: string[],
  status: "sent" | "failed" | "expired",
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

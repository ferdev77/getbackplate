import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendTwilioMessage } from "@/infrastructure/twilio/client";
import { sendPushPorRol } from "@/shared/lib/notification-links";
import { resolveTenantAppUrlByOrganizationId } from "@/shared/lib/custom-domains";
import { buildBrandedEmailSubject, getTenantEmailBranding, resolveEmailSenderName } from "@/shared/lib/email-branding";
import { resolveAudienceContacts } from "@/shared/lib/audience-resolver";
import { userIdParaEmailSinDuplicarCampanita } from "@/shared/lib/notification-recipients";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChecklistAudienceInput = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  organizationId: string;
  targetScope: {
    locations?: string[];
    department_ids?: string[];
    position_ids?: string[];
    users?: string[];
  } | null;
  templateBranchId?: string | null;
};

/**
 * De donde salio un envio. Queda en notifications.metadata y es lo unico que
 * permite distinguirlos despues: el alta y el reparto del cron mandan el mismo
 * titulo ("Nuevo checklist: X"), asi que sin esto el historial muestra filas
 * identicas y no se sabe si el checklist se esta repartiendo de verdad.
 */
export type OrigenDelEnvio = "alta" | "edicion" | "recurrencia";

/**
 * Lo que hace falta para que un envio quede atribuido a su plantilla.
 *
 * `templateId` viaja como source_id: sin el, las filas de notifications dicen
 * source='checklist' y nada mas, y no hay forma de saber de que checklist eran.
 * Es opcional para no romper llamadores viejos, pero un envio sin templateId no
 * aparece en el historial.
 */
export type TrazaDelEnvio = {
  templateId?: string | null;
  origen?: OrigenDelEnvio;
};

function trazaANotificacion(traza: TrazaDelEnvio) {
  return {
    sourceId: traza.templateId ?? undefined,
    metadata: traza.origen ? { origen: traza.origen } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Audience Resolution
// ---------------------------------------------------------------------------

async function resolveChecklistAudienceContacts(input: ChecklistAudienceInput) {
  const raw = input.targetScope ?? {};
  const contacts = await resolveAudienceContacts({
    supabase: input.supabase,
    organizationId: input.organizationId,
    scope: {
      locations: Array.isArray(raw.locations) ? raw.locations.filter(Boolean) as string[] : [],
      department_ids: Array.isArray(raw.department_ids) ? raw.department_ids.filter(Boolean) as string[] : [],
      position_ids: Array.isArray(raw.position_ids) ? raw.position_ids.filter(Boolean) as string[] : [],
      users: Array.isArray(raw.users) ? raw.users.filter(Boolean) as string[] : [],
    },
    templateBranchId: input.templateBranchId,
  });
  return {
    emails: contacts.emails,
    phones: contacts.phones,
    userIds: contacts.userIds,
    userIdByEmail: contacts.userIdByEmail,
  };
}

// ---------------------------------------------------------------------------
// Email Delivery
// ---------------------------------------------------------------------------

export async function sendChecklistAudienceEmail(input: ChecklistAudienceInput & TrazaDelEnvio & {
  templateName: string;
  event: "created" | "updated" | "submitted";
  itemsCount: number;
  flaggedCount?: number;
  actorEmail?: string;
}) {
  const contacts = await resolveChecklistAudienceContacts(input);
  if (!contacts.emails.length) return 0;

  const appUrl = await resolveTenantAppUrlByOrganizationId({
    organizationId: input.organizationId,
    fallbackAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://getbackplate.com",
  });
  const reportsUrl = appUrl ? `${appUrl}/app/reports` : "/app/reports";
  const branding = await getTenantEmailBranding(input.organizationId);
  const subject =
    input.event === "created"
      ? `New checklist created: ${input.templateName}`
      : input.event === "updated"
        ? `Checklist updated: ${input.templateName}`
        : `Checklist submitted: ${input.templateName}`;
  const brandedSubject = buildBrandedEmailSubject(subject, branding);
  const html =
    input.event === "created"
      ? `
    <h2 style="margin:0 0 10px 0;">New checklist created</h2>
    <p style="margin:0 0 8px 0;color:#444;">Template: <strong>${input.templateName}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Items: <strong>${input.itemsCount}</strong></p>
    <p style="margin:0 0 14px 0;color:#444;">Created by: <strong>${input.actorEmail ?? "Internal user"}</strong></p>
    <p style="margin:14px 0 0 0;"><a href="${reportsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">View checklists</a></p>
  `
      : input.event === "updated"
        ? `
    <h2 style="margin:0 0 10px 0;">Checklist updated</h2>
    <p style="margin:0 0 8px 0;color:#444;">Template: <strong>${input.templateName}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Items: <strong>${input.itemsCount}</strong></p>
    <p style="margin:0 0 14px 0;color:#444;">Updated by: <strong>${input.actorEmail ?? "Internal user"}</strong></p>
    <p style="margin:14px 0 0 0;"><a href="${reportsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">View checklists</a></p>
  `
        : `
    <h2 style="margin:0 0 10px 0;">Checklist submitted</h2>
    <p style="margin:0 0 8px 0;color:#444;">Template: <strong>${input.templateName}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Items: <strong>${input.itemsCount}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Issues: <strong>${input.flaggedCount ?? 0}</strong></p>
    <p style="margin:0 0 14px 0;color:#444;">Submitted by: <strong>${input.actorEmail ?? "Internal user"}</strong></p>
    <p style="margin:14px 0 0 0;"><a href="${reportsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">View in reports</a></p>
  `;
  const text =
    input.event === "created"
      ? `New checklist created\nTemplate: ${input.templateName}\nItems: ${input.itemsCount}\nCreated by: ${input.actorEmail ?? "Internal user"}\nView checklists: ${reportsUrl}`
      : input.event === "updated"
        ? `Checklist updated\nTemplate: ${input.templateName}\nItems: ${input.itemsCount}\nUpdated by: ${input.actorEmail ?? "Internal user"}\nView checklists: ${reportsUrl}`
        : `Checklist submitted\nTemplate: ${input.templateName}\nItems: ${input.itemsCount}\nIssues: ${input.flaggedCount ?? 0}\nSubmitted by: ${input.actorEmail ?? "Internal user"}\nView in reports: ${reportsUrl}`;

  await Promise.allSettled(
    contacts.emails.map((to) =>
      sendTransactionalEmail({
        to,
        subject: brandedSubject,
        html,
        text,
        senderName: resolveEmailSenderName(branding),
        notification: {
          source: "checklist",
          organizationId: input.organizationId,
          ...trazaANotificacion(input),
          // El push de este mismo evento es siempre activo y va a la misma
          // audiencia (ver sendChecklistAudiencePush), asi que a quien esta
          // ahi ya le dejo su fila en la campanita: el email no la duplica.
          // A quien solo tiene email (contacto sin cuenta o fuera del push)
          // se le arma la suya, que es su unica via.
          userId: userIdParaEmailSinDuplicarCampanita(contacts.userIdByEmail[to], contacts.userIds),
          actionUrl: reportsUrl.startsWith("http") ? "/app/reports" : reportsUrl,
          title: subject,
        },
      }),
    ),
  );
  return contacts.emails.length;
}

// ---------------------------------------------------------------------------
// Push Delivery (siempre activo, no es opcional)
// ---------------------------------------------------------------------------

export async function sendChecklistAudiencePush(input: ChecklistAudienceInput & TrazaDelEnvio & {
  templateName: string;
  event: "created" | "updated" | "submitted";
  itemsCount: number;
  flaggedCount?: number;
}) {
  const contacts = await resolveChecklistAudienceContacts(input);
  if (!contacts.userIds.length) return 0;

  const title =
    input.event === "created"
      ? `Nuevo checklist: ${input.templateName}`
      : input.event === "updated"
        ? `Checklist actualizado: ${input.templateName}`
        : `Checklist enviado: ${input.templateName}`;
  const body =
    input.event === "submitted"
      ? `Items: ${input.itemsCount}${input.flaggedCount ? ` · Incidencias: ${input.flaggedCount}` : ""}`
      : `Items: ${input.itemsCount}`;

  // La audiencia de un checklist se resuelve por sucursal, departamento y
  // puesto: es mayormente gente del portal. Cada rol recibe su propio link.
  return sendPushPorRol({
    supabase: input.supabase,
    organizationId: input.organizationId,
    userIds: contacts.userIds,
    payload: { title, body },
    adminUrl: "/app/reports",
    employeeUrl: "/portal/checklist",
    options: {
      source: "checklist",
      organizationId: input.organizationId,
      ...trazaANotificacion(input),
    },
  });
}

// ---------------------------------------------------------------------------
// SMS Delivery — DISCONTINUADO, SIN LLAMADORES
//
// SMS se retiro del producto. Esta funcion ya no se invoca desde ningun lado:
// ni actions.ts ni el cron de recurrencia la importan. Se conserva sin borrar
// por pedido explicito (cambio minimo), pero NO volver a conectarla: los
// canales oficiales son in_app, push y email.
// Ver modules/checklists/lib/notification-channels.ts para el corte real.
// ---------------------------------------------------------------------------

export async function sendChecklistAudienceTwilio(input: ChecklistAudienceInput & {
  channel: "sms";
  templateName: string;
  itemsCount: number;
  actorEmail?: string;
  event?: "created" | "updated";
}) {
  const contacts = await resolveChecklistAudienceContacts(input);
  if (!contacts.phones.length) return 0;

  const action = input.event === "updated" ? "actualizado" : "creado";
  const body = `Checklist ${action}\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\n${input.event === "updated" ? "Actualizado" : "Creado"} por: ${input.actorEmail ?? "Usuario interno"}`;

  const results = await Promise.allSettled(
    contacts.phones.map((phone) => sendTwilioMessage(phone, body, input.channel)),
  );

  return results.filter((result) => result.status === "fulfilled" && result.value.success).length;
}

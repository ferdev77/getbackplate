import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendTwilioMessage } from "@/infrastructure/twilio/client";
import { resolveTenantAppUrlByOrganizationId } from "@/shared/lib/custom-domains";
import { buildBrandedEmailSubject, getTenantEmailBranding, resolveEmailSenderName } from "@/shared/lib/email-branding";
import { resolveAudienceContacts } from "@/shared/lib/audience-resolver";

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

// ---------------------------------------------------------------------------
// Audience Resolution
// ---------------------------------------------------------------------------

export async function resolveChecklistAudienceContacts(input: ChecklistAudienceInput) {
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
  return { emails: contacts.emails, phones: contacts.phones };
}

// ---------------------------------------------------------------------------
// Email Delivery
// ---------------------------------------------------------------------------

export async function sendChecklistAudienceEmail(input: ChecklistAudienceInput & {
  templateName: string;
  event: "created" | "submitted";
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
      ? `Nuevo checklist creado: ${input.templateName}`
      : `Checklist enviado: ${input.templateName}`;
  const brandedSubject = buildBrandedEmailSubject(subject, branding);
  const html =
    input.event === "created"
      ? `
    <h2 style="margin:0 0 10px 0;">Nuevo checklist creado</h2>
    <p style="margin:0 0 8px 0;color:#444;">Plantilla: <strong>${input.templateName}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Items: <strong>${input.itemsCount}</strong></p>
    <p style="margin:0 0 14px 0;color:#444;">Creado por: <strong>${input.actorEmail ?? "Usuario interno"}</strong></p>
    <p style="margin:14px 0 0 0;"><a href="${reportsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Ver checklists</a></p>
  `
      : `
    <h2 style="margin:0 0 10px 0;">Checklist enviado</h2>
    <p style="margin:0 0 8px 0;color:#444;">Plantilla: <strong>${input.templateName}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Items: <strong>${input.itemsCount}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Incidencias: <strong>${input.flaggedCount ?? 0}</strong></p>
    <p style="margin:0 0 14px 0;color:#444;">Enviado por: <strong>${input.actorEmail ?? "Usuario interno"}</strong></p>
    <p style="margin:14px 0 0 0;"><a href="${reportsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Ver en reportes</a></p>
  `;
  const text =
    input.event === "created"
      ? `Nuevo checklist creado\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nCreado por: ${input.actorEmail ?? "Usuario interno"}\nVer checklists: ${reportsUrl}`
      : `Checklist enviado\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nIncidencias: ${input.flaggedCount ?? 0}\nEnviado por: ${input.actorEmail ?? "Usuario interno"}\nVer en reportes: ${reportsUrl}`;

  await Promise.allSettled(contacts.emails.map((to) => sendTransactionalEmail({ to, subject: brandedSubject, html, text, senderName: resolveEmailSenderName(branding) })));
  return contacts.emails.length;
}

// ---------------------------------------------------------------------------
// SMS / WhatsApp Delivery
// ---------------------------------------------------------------------------

export async function sendChecklistAudienceTwilio(input: ChecklistAudienceInput & {
  channel: "sms" | "whatsapp";
  templateName: string;
  itemsCount: number;
  actorEmail?: string;
}) {
  const contacts = await resolveChecklistAudienceContacts(input);
  if (!contacts.phones.length) return 0;

  const body =
    input.channel === "whatsapp"
      ? `*Nuevo checklist creado*\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nCreado por: ${input.actorEmail ?? "Usuario interno"}`
      : `Nuevo checklist creado\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nCreado por: ${input.actorEmail ?? "Usuario interno"}`;

  const results = await Promise.allSettled(
    contacts.phones.map((phone) => sendTwilioMessage(phone, body, input.channel)),
  );

  return results.filter((result) => result.status === "fulfilled" && result.value.success).length;
}

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { COMPANY_ADDRESS } from "@/shared/lib/company-addresses";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { resolveUserIdByEmail } from "@/infrastructure/notifications/log-notification";
import { userIdParaEmailSinDuplicarCampanita } from "@/shared/lib/notification-recipients";
import { buildWeeklyReportHtml } from "./weekly-report-template";
import { createReferralToken } from "./referral-token";
import { createQboReportPreferenceToken } from "./report-preference-token";
import { isActiveClaim } from "../pipeline-rules";
import {
  getOrCreateQboReportSubscription,
  shouldSendQboReport,
  type QboReportCadence,
} from "./report-preferences.service";

// These emails are GetBackplate's own operational communication about the
// integration it runs — the brand must always read "GetBackplate", never the
// recipient organization's own custom branding.
const FIXED_SENDER_NAME = "GetBackplate";
function brandedSubject(subject: string): string {
  return `[${FIXED_SENDER_NAME}] ${subject}`;
}

function ownerReportRecipients(primaryRecipient: string): string[] {
  const primary = primaryRecipient.trim().toLowerCase();
  return (process.env.OWNER_WEEKLY_REPORT_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter((email, index, all) =>
      Boolean(email) &&
      email.toLowerCase() !== primary &&
      all.findIndex((candidate) => candidate.toLowerCase() === email.toLowerCase()) === index,
    );

}

async function sendInternalOwnerCopies(input: {
  primaryRecipient: string;
  organizationId: string;
  subject: string;
  text: string;
  renderHtml: (originalRecipient: string) => string;
}): Promise<void> {
  await Promise.allSettled(ownerReportRecipients(input.primaryRecipient).map((to) =>
    sendTransactionalEmail({
      to,
      subject: brandedSubject(`[Internal copy] ${input.subject}`),
      html: input.renderHtml(input.primaryRecipient),
      text: `Internal copy. Original recipient: ${input.primaryRecipient}\n\n${input.text}`,
      senderName: FIXED_SENDER_NAME,
      notification: {
        source: "qbo_report_internal_copy",
        organizationId: input.organizationId,
        title: `[Internal copy] ${input.subject}`,
      },
    }),
  ));
}

type BranchInvoiceLine = {
  docNumber: string;
  sentAt: string;
  totalAmount: number | null;
};

type BranchReport = {
  syncConfigCustomerId: string;
  branchName: string;
  invoices: BranchInvoiceLine[];
  hasDeliveredInvoices: boolean;
  resolvedEmail: string | null;
  skipReason: string | null;
};

type ClientGroupReport = {
  syncConfigName: string;
  branches: BranchReport[];
};

export type OrgWeeklyReportData = {
  organizationId: string;
  organizationName: string;
  periodStart: string | null;
  periodEnd: string | null;
  isHistorical: boolean;
  groups: ClientGroupReport[];
};

type OrgVendorDisplayInfo = {
  vendorCompany: string;
  vendorLogoUrl: string | null;
  vendorPhone: string | null;
  vendorEmail: string | null;
};

export const WEEKLY_RECURRENCE_NOTICE =
  "You'll receive this report every Monday around 10am your local time.";

export const MONTHLY_RECURRENCE_NOTICE =
  "You'll receive this report at the close of each billing cycle, when your subscription renews.";

export const FIRST_REPORT_NOTICE =
  "This is a one-time summary of everything delivered since your integration went live. " +
  "Starting next Monday, you'll receive this report weekly, covering just that week's documents.";

export const FIRST_ORG_REPORT_NOTICE =
  "This is a summary of everything delivered since your integration went live. " +
  "Going forward, you'll receive this report at the end of each monthly reporting cycle, " +
  "covering all documents delivered during that period.";

function recurrenceNotice(cadence: QboReportCadence, isHistorical: boolean): string {
  if (isHistorical) {
    return cadence === "monthly" ? FIRST_ORG_REPORT_NOTICE : FIRST_REPORT_NOTICE;
  }
  return cadence === "monthly" ? MONTHLY_RECURRENCE_NOTICE : WEEKLY_RECURRENCE_NOTICE;
}

function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.getbackplate.com").replace(/\/$/, "");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function nextUtcDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type ReportRunRow = {
  id: string;
  status: "processing" | "completed" | "failed";
  claimed_at: string | null;
  attempt_count: number;
};

type ReportClaim = { id: string; claimedAt: string };

async function claimReportRun(input: {
  organizationId: string;
  cadence: QboReportCadence;
  periodStart: string;
  periodEnd: string;
}): Promise<ReportClaim | null> {
  const admin = createSupabaseAdminClient();
  const claimedAt = new Date().toISOString();
  const identity = {
    organization_id: input.organizationId,
    report_kind: input.cadence,
    period_start: input.periodStart,
    period_end: input.periodEnd,
  };
  const { data: inserted, error: insertError } = await admin
    .from("qbo_weekly_invoice_report_runs")
    .insert({ ...identity, status: "processing", claimed_at: claimedAt })
    .select("id")
    .maybeSingle();
  if (!insertError && inserted) return { id: inserted.id as string, claimedAt };
  if (insertError?.code !== "23505") throw new Error(insertError?.message ?? "Report run could not be claimed");

  const { data: existing, error: existingError } = await admin
    .from("qbo_weekly_invoice_report_runs")
    .select("id, status, claimed_at, attempt_count")
    .match(identity)
    .single();
  if (existingError || !existing) throw new Error(existingError?.message ?? "Report run not found");

  const row = existing as ReportRunRow;
  if (row.status === "completed") return null;
  if (row.status === "processing" && isActiveClaim(row.claimed_at, 15 * 60_000)) {
    return null;
  }

  let retry = admin
    .from("qbo_weekly_invoice_report_runs")
    .update({
      status: "processing",
      claimed_at: claimedAt,
      attempt_count: row.attempt_count + 1,
      last_error: null,
    })
    .eq("id", row.id)
    .eq("status", row.status);
  retry = row.claimed_at ? retry.eq("claimed_at", row.claimed_at) : retry.is("claimed_at", null);
  const { data: retried, error: retryError } = await retry.select("id").maybeSingle();
  if (retryError) throw new Error(retryError.message);
  const retriedId = retried?.id as string | undefined;
  if (!retriedId) return null;

  const { error: releaseError } = await admin
    .from("qbo_report_deliveries")
    .update({ status: "failed", last_error: "Previous report attempt did not finish" })
    .eq("run_id", retriedId)
    .eq("status", "processing");
  if (releaseError) throw new Error(releaseError.message);
  return { id: retriedId, claimedAt };
}

async function finishReportRun(
  claim: ReportClaim,
  status: "completed" | "failed",
  lastError?: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("qbo_weekly_invoice_report_runs")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      last_error: lastError?.slice(0, 2000) ?? null,
    })
    .eq("id", claim.id)
    .eq("status", "processing")
    .eq("claimed_at", claim.claimedAt)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Report run claim expired");
}

type ReportDeliveryRow = {
  id: string;
  status: "processing" | "sent" | "failed";
  claimed_at: string;
  attempt_count: number;
};

async function claimReportDelivery(input: {
  runId: string;
  targetType: "organization" | "branch";
  targetId: string;
  recipientEmail: string;
}): Promise<ReportClaim | null> {
  const admin = createSupabaseAdminClient();
  const claimedAt = new Date().toISOString();
  const identity = {
    run_id: input.runId,
    target_type: input.targetType,
    target_id: input.targetId,
    recipient_email: input.recipientEmail,
  };
  const { data: inserted, error: insertError } = await admin
    .from("qbo_report_deliveries")
    .insert({ ...identity, claimed_at: claimedAt })
    .select("id")
    .maybeSingle();
  if (!insertError && inserted) return { id: inserted.id as string, claimedAt };
  if (insertError?.code !== "23505") throw new Error(insertError?.message ?? "Report delivery could not be claimed");

  const { data: existing, error: existingError } = await admin
    .from("qbo_report_deliveries")
    .select("id, status, claimed_at, attempt_count")
    .match(identity)
    .single();
  if (existingError || !existing) throw new Error(existingError?.message ?? "Report delivery not found");

  const row = existing as ReportDeliveryRow;
  if (row.status === "sent") return null;
  if (row.status === "processing" && isActiveClaim(row.claimed_at, 15 * 60_000)) return null;

  const { data: retried, error: retryError } = await admin
    .from("qbo_report_deliveries")
    .update({
      status: "processing",
      claimed_at: claimedAt,
      attempt_count: row.attempt_count + 1,
      last_error: null,
    })
    .eq("id", row.id)
    .eq("status", row.status)
    .eq("claimed_at", row.claimed_at)
    .select("id")
    .maybeSingle();
  if (retryError) throw new Error(retryError.message);
  const retriedId = retried?.id as string | undefined;
  return retriedId ? { id: retriedId, claimedAt } : null;
}

async function finishReportDelivery(
  claim: ReportClaim,
  status: "sent" | "failed",
  lastError?: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("qbo_report_deliveries")
    .update({
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      last_error: lastError?.slice(0, 2000) ?? null,
    })
    .eq("id", claim.id)
    .eq("status", "processing")
    .eq("claimed_at", claim.claimedAt)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Report delivery claim expired");
}

// ---------------------------------------------------------------------------
// Organizaciones con plan de integracion QBO-R365 activo
// ---------------------------------------------------------------------------

export async function listQboIntegrationOrganizations(): Promise<Array<{ id: string; name: string }>> {
  const admin = createSupabaseAdminClient();
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, integration_plan_id")
    .not("integration_plan_id", "is", null);

  if (error) throw new Error(error.message);
  if (!orgs?.length) return [];

  const planIds = [...new Set(orgs.map((o) => o.integration_plan_id).filter(Boolean))] as string[];
  const { data: plans, error: plansError } = await admin
    .from("plans")
    .select("id, plan_type")
    .in("id", planIds);

  if (plansError) throw new Error(plansError.message);

  const qboPlanIds = new Set((plans ?? []).filter((p) => p.plan_type === "qbo_r365").map((p) => p.id));
  const qboOrgIds = orgs
    .filter((org) => qboPlanIds.has(org.integration_plan_id as string))
    .map((org) => org.id as string);
  if (!qboOrgIds.length) return [];

  const { data: activeConfigs, error: configsError } = await admin
    .from("qbo_r365_sync_configs")
    .select("organization_id")
    .in("organization_id", qboOrgIds)
    .eq("status", "active");
  if (configsError) throw new Error(configsError.message);

  const configuredOrgIds = new Set((activeConfigs ?? []).map((config) => config.organization_id as string));

  return orgs
    .filter((org) => qboPlanIds.has(org.integration_plan_id as string) && configuredOrgIds.has(org.id as string))
    .map((org) => ({ id: org.id as string, name: org.name as string }));
}

// ---------------------------------------------------------------------------
// Datos de presentacion del vendor (Prodel) para los emails a sus sucursales
// ---------------------------------------------------------------------------

async function getOrgVendorDisplayInfo(organizationId: string): Promise<OrgVendorDisplayInfo> {
  const admin = createSupabaseAdminClient();

  const [{ data: orgRow }, { data: settings }] = await Promise.all([
    admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle(),
    admin
      .from("organization_settings")
      .select("support_email, support_phone, company_logo_url")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  const vendorCompany =
    (typeof orgRow?.name === "string" && orgRow.name.trim()) ||
    "Your Vendor";

  const vendorLogoUrl =
    (typeof settings?.company_logo_url === "string" && settings.company_logo_url.trim()) || null;

  const vendorPhone =
    (typeof settings?.support_phone === "string" && settings.support_phone.trim()) ||
    null;

  const vendorEmail =
    (typeof settings?.support_email === "string" && settings.support_email.trim()) ||
    null;

  return { vendorCompany, vendorLogoUrl, vendorPhone, vendorEmail };
}

// ---------------------------------------------------------------------------
// Resolucion del destinatario del lado de la empresa (Prodel)
// ---------------------------------------------------------------------------

async function getOrgOwnEmailSet(organizationId: string): Promise<Set<string>> {
  const admin = createSupabaseAdminClient();
  const own = new Set<string>();

  const { data: settings } = await admin
    .from("organization_settings")
    .select("support_email, billing_email")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (settings?.support_email) own.add(String(settings.support_email).trim().toLowerCase());
  if (settings?.billing_email) own.add(String(settings.billing_email).trim().toLowerCase());

  const { data: roleRows } = await admin.from("roles").select("id").in("code", ["company_admin"]);
  const roleIds = (roleRows ?? []).map((r) => r.id).filter(Boolean);

  if (roleIds.length) {
    const { data: memberships } = await admin
      .from("memberships")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("role_id", roleIds)
      .limit(20);

    for (const membership of memberships ?? []) {
      if (!membership.user_id) continue;
      const { data: userData } = await admin.auth.admin.getUserById(membership.user_id);
      if (userData?.user?.email) own.add(userData.user.email.trim().toLowerCase());
    }
  }

  return own;
}

async function getOrgReportRecipient(
  organizationId: string,
): Promise<{ email: string | null; pushUserIds: string[] }> {
  const admin = createSupabaseAdminClient();

  const { data: settings } = await admin
    .from("organization_settings")
    .select("support_email, billing_email")
    .eq("organization_id", organizationId)
    .maybeSingle();

  let email: string | null =
    (settings?.support_email && String(settings.support_email).trim()) ||
    (settings?.billing_email && String(settings.billing_email).trim()) ||
    null;

  const { data: roleRows } = await admin.from("roles").select("id").in("code", ["company_admin"]);
  const roleIds = (roleRows ?? []).map((r) => r.id).filter(Boolean);

  const pushUserIds: string[] = [];

  if (roleIds.length) {
    const { data: memberships } = await admin
      .from("memberships")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("role_id", roleIds)
      .order("created_at", { ascending: true })
      .limit(10);

    for (const membership of memberships ?? []) {
      if (!membership.user_id) continue;
      pushUserIds.push(membership.user_id);
      if (!email) {
        const { data: userData } = await admin.auth.admin.getUserById(membership.user_id);
        if (userData?.user?.email) email = userData.user.email;
      }
    }
  }

  return { email: email ? email.trim().toLowerCase() : null, pushUserIds };
}

// ---------------------------------------------------------------------------
// Agregacion de facturas por sync_config / sucursal
// ---------------------------------------------------------------------------

export async function buildOrgWeeklyReportData(input: {
  organizationId: string;
  organizationName: string;
  periodStart: string | null;
  periodEnd: string | null;
  isHistorical: boolean;
  // Limite exclusivo exacto para la consulta (ej. medianoche en hora de Chicago
  // del dia siguiente al cierre). Si no se pasa, se calcula con nextUtcDate()
  // a partir de periodEnd, como antes.
  periodEndExclusive?: string | null;
}): Promise<OrgWeeklyReportData> {
  const admin = createSupabaseAdminClient();
  const ownEmails = await getOrgOwnEmailSet(input.organizationId);

  const { data: syncConfigs, error: syncConfigsError } = await admin
    .from("qbo_r365_sync_configs")
    .select("id, name")
    .eq("organization_id", input.organizationId)
    .eq("status", "active");

  if (syncConfigsError) throw new Error(syncConfigsError.message);

  const groups: ClientGroupReport[] = [];

  for (const config of syncConfigs ?? []) {
    const { data: customers, error: customersError } = await admin
      .from("qbo_r365_sync_config_customers")
      .select("id, qbo_customer_name, contact_email_override")
      .eq("sync_config_id", config.id);

    if (customersError) throw new Error(customersError.message);

    const branches: BranchReport[] = [];

    for (const customer of customers ?? []) {
      let invoiceQuery = admin
        .from("qbo_unified_invoices")
        .select("doc_number, sent_at, total_amount, raw_entity")
        .eq("organization_id", input.organizationId)
        .eq("sync_config_id", config.id)
        .ilike("customer_name", customer.qbo_customer_name)
        .eq("pipeline_status", "enviada")
        .order("sent_at", { ascending: false });

      if (!input.isHistorical && input.periodStart && input.periodEnd) {
        const exclusiveEnd = input.periodEndExclusive ?? nextUtcDate(input.periodEnd);
        invoiceQuery = invoiceQuery.gte("sent_at", input.periodStart).lt("sent_at", exclusiveEnd);
      }

      const { data: invoices, error: invoicesError } = await invoiceQuery;
      if (invoicesError) throw new Error(invoicesError.message);

      // Sin facturas en esta ventana: igual se incluye la sucursal (para poder
      // mandarle el correo de "sin facturas esta semana"), resolviendo el email
      // de contacto a partir de su factura mas reciente en cualquier momento.
      let emailSourceRawEntity: unknown = invoices?.[0]?.raw_entity ?? null;
      let hasDeliveredInvoices = Boolean(invoices?.length);
      if (!invoices?.length) {
        const { data: lastEver, error: lastEverError } = await admin
          .from("qbo_unified_invoices")
          .select("raw_entity")
          .eq("organization_id", input.organizationId)
          .eq("sync_config_id", config.id)
          .ilike("customer_name", customer.qbo_customer_name)
          .eq("pipeline_status", "enviada")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastEverError) throw new Error(lastEverError.message);
        emailSourceRawEntity = lastEver?.raw_entity ?? null;
        hasDeliveredInvoices = Boolean(lastEver);
      }

      const billEmailRaw = (emailSourceRawEntity as Record<string, unknown> | null)?.["BillEmail"] as
        | Record<string, unknown>
        | undefined;
      const billEmail =
        typeof billEmailRaw?.["Address"] === "string" ? (billEmailRaw["Address"] as string).trim().toLowerCase() : "";

      let resolvedEmail: string | null = null;
      let skipReason: string | null = null;

      if (billEmail && !ownEmails.has(billEmail)) {
        resolvedEmail = billEmail;
      } else {
        const override = customer.contact_email_override?.trim().toLowerCase() || null;
        if (override && !ownEmails.has(override)) {
          resolvedEmail = override;
        } else if (billEmail && ownEmails.has(billEmail)) {
          skipReason = "the email QuickBooks® Online has on file matches your own email, not the client's";
        } else {
          skipReason = "QuickBooks® Online has no email on file for this client and no backup email is configured";
        }
      }

      branches.push({
        syncConfigCustomerId: customer.id as string,
        branchName: customer.qbo_customer_name,
        hasDeliveredInvoices,
        invoices: (invoices ?? [])
          .slice()
          .reverse()
          .map((inv) => ({
            docNumber: String(inv.doc_number ?? "?"),
            sentAt: inv.sent_at as string,
            totalAmount: inv.total_amount != null ? Number(inv.total_amount) : null,
          })),
        resolvedEmail,
        skipReason,
      });
    }

    if (branches.length) {
      groups.push({ syncConfigName: config.name, branches });
    }
  }

  return {
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    isHistorical: input.isHistorical,
    groups,
  };
}

// ---------------------------------------------------------------------------
// Texto de los correos (plano — usado como fallback de texto para email clients)
// ---------------------------------------------------------------------------

function periodLabel(data: OrgWeeklyReportData): string {
  if (data.isHistorical) return "through today";
  return `${formatDate(data.periodStart!)} – ${formatDate(data.periodEnd!)}`;
}

export function buildOrgReportText(data: OrgWeeklyReportData, cadence: "weekly" | "monthly" = "weekly"): { subject: string; text: string } {
  const subject = data.isHistorical
    ? "Historical document delivery summary"
    : `${cadence === "monthly" ? "Monthly" : "Weekly"} document delivery summary — ${periodLabel(data)}`;

  const lines: string[] = [];
  lines.push(
    data.isHistorical
      ? "Hi! Here is your first report: a summary of all documents your integration has delivered through today."
      : `Here is your ${cadence} report: a summary of documents your integration delivered ${periodLabel(data)}.`,
  );
  lines.push("");

  let total = 0;
  const skipped: string[] = [];

  for (const group of data.groups) {
    lines.push(group.syncConfigName);
    for (const branch of group.branches) {
      if (!branch.invoices.length) continue;
      const isSingleBranchGroup = group.branches.length === 1 && group.syncConfigName === branch.branchName;
      const prefix = isSingleBranchGroup ? "  •" : `  • ${branch.branchName} —`;
      for (const inv of branch.invoices) {
        lines.push(`${prefix} Document #${inv.docNumber} — ${formatDate(inv.sentAt)}`);
        total += 1;
      }
      if (branch.skipReason) {
        skipped.push(`${branch.branchName}: ${branch.skipReason}`);
      }
    }
    lines.push("");
  }

  lines.push(`Total: ${total} document${total === 1 ? "" : "s"} delivered.`);

  if (skipped.length) {
    lines.push("");
    lines.push("Could not notify these clients:");
    for (const reason of skipped) {
      lines.push(`  • ${reason}`);
    }
  }

  lines.push("", COMPANY_ADDRESS.inline);

  return { subject, text: lines.join("\n") };
}

export function buildBranchReportText(
  data: OrgWeeklyReportData,
  branch: BranchReport,
  cadence: QboReportCadence = "weekly",
): { subject: string; text: string } {
  const cadenceLabel = cadence === "monthly" ? "Monthly" : "Weekly";
  const cadencePeriod = cadence === "monthly" ? "month" : "week";
  const subject = data.isHistorical
    ? `Historical ${cadence} document delivery summary`
    : `${cadenceLabel} document delivery summary — ${periodLabel(data)}`;

  const lines: string[] = [];
  lines.push(`Hi ${branch.branchName},`);
  lines.push("");
  lines.push(
    data.isHistorical
      ? "Here is your first report: a summary of all documents you received in your FTP through today."
      : `Here is your ${cadence} report: a summary of documents you received in your FTP ${periodLabel(data)}.`,
  );
  lines.push("");
  if (!data.isHistorical && branch.invoices.length === 0) {
    lines.push(`No documents this ${cadencePeriod}. Your integration is active and monitoring — nothing was issued between ${periodLabel(data)}.`);
  } else {
    for (const inv of branch.invoices) {
      lines.push(`  • Document #${inv.docNumber} — ${formatDate(inv.sentAt)}`);
    }
  }

  lines.push("", COMPANY_ADDRESS.inline);

  return { subject, text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Envio (con soporte de override para pruebas)
// ---------------------------------------------------------------------------

export async function sendWeeklyInvoiceReport(input: {
  organizationId: string;
  periodStart: string | null;
  periodEnd: string | null;
  isHistorical: boolean;
  cadence?: QboReportCadence;
  overrideRecipientEmail?: string;
  recordRun?: boolean;
  sendTo?: "all" | "org" | "branches";
  periodEndExclusive?: string | null;
}): Promise<{
  orgEmailsSent: number;
  branchEmailsSent: number;
  skippedBranches: number;
  deliveryFailures: number;
  skippedAlreadySent?: boolean;
}> {
  const admin = createSupabaseAdminClient();
  const appBase = getAppBaseUrl();
  const cadence = input.cadence ?? "weekly";

  const { data: org } = await admin.from("organizations").select("name").eq("id", input.organizationId).single();
  const organizationName = org?.name ?? "Your Company";

  const [data, vendorDisplay] = await Promise.all([
    buildOrgWeeklyReportData({
      organizationId: input.organizationId,
      organizationName,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      isHistorical: input.isHistorical,
      periodEndExclusive: input.periodEndExclusive,
    }),
    getOrgVendorDisplayInfo(input.organizationId),
  ]);

  const pLabel = periodLabel(data);
  const sendTo = input.sendTo ?? "all";
  const orgReport = buildOrgReportText(data, cadence);
  const orgRecipient = await getOrgReportRecipient(input.organizationId);
  const orgEmailTarget = input.overrideRecipientEmail ?? orgRecipient.email;

  // Org email: link a la landing pública de la integración
  const orgPlatformUrl = `${appBase}/integrations/qbo-r365`;

  const reportRecurrenceNotice = recurrenceNotice(cadence, data.isHistorical);
  const hasDeliveredInvoices = data.groups.some((group) =>
    group.branches.some((branch) => branch.hasDeliveredInvoices),
  );
  if (!hasDeliveredInvoices && !input.overrideRecipientEmail) {
    return {
      orgEmailsSent: 0,
      branchEmailsSent: 0,
      skippedBranches: data.groups.reduce((total, group) => total + group.branches.length, 0),
      deliveryFailures: 0,
    };
  }

  let runClaim: ReportClaim | null = null;
  if (input.recordRun && !input.overrideRecipientEmail && input.periodStart && input.periodEnd) {
    runClaim = await claimReportRun({
      organizationId: input.organizationId,
      cadence,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    if (!runClaim) {
      return {
        orgEmailsSent: 0,
        branchEmailsSent: 0,
        skippedBranches: 0,
        deliveryFailures: 0,
        skippedAlreadySent: true,
      };
    }
  }
  const runId = runClaim?.id ?? null;

  let deliveryFailures = 0;

  try {

  // Org email: un solo mail agregado con todas las facturas, solo si sendTo incluye "org"
  let orgEmailsSent = 0;
  if ((sendTo === "all" || sendTo === "org") && orgEmailTarget) {
    let preferencesUrl: string | null = null;
    let shouldSend = true;
    if (!input.overrideRecipientEmail) {
      const subscription = await getOrCreateQboReportSubscription({
        organizationId: input.organizationId,
        targetType: "organization",
        targetId: input.organizationId,
        recipientEmail: orgEmailTarget,
        defaultFrequency: "monthly",
      });
      shouldSend = shouldSendQboReport(subscription.frequency, cadence);
      if (shouldSend) {
        const token = createQboReportPreferenceToken(subscription);
        preferencesUrl = `${appBase}/email/preferences?token=${encodeURIComponent(token)}&unsub=1`;
      }
    }

    if (shouldSend) {
      const deliveryClaim = runId ? await claimReportDelivery({
        runId,
        targetType: "organization",
        targetId: input.organizationId,
        recipientEmail: orgEmailTarget,
      }) : null;
      if (!runId || deliveryClaim) {
      const allOrgInvoices = data.groups.flatMap((g) =>
        g.branches.flatMap((b) => b.invoices.map((inv) => ({ ...inv, clientName: b.branchName }))),
      );
      const orgSubjectBase = data.isHistorical
        ? `Historical ${cadence} document delivery summary — ${pLabel}`
        : `${cadence === "monthly" ? "Monthly" : "Weekly"} document delivery summary — ${pLabel}`;
      const subject = input.overrideRecipientEmail
        ? `[test] ${orgSubjectBase}`
        : orgSubjectBase;

      const renderHtml = (internalCopyRecipient?: string) => buildWeeklyReportHtml({
        recipientName: organizationName,
        periodLabel: pLabel,
        invoiceLines: allOrgInvoices,
        vendorCompany: vendorDisplay.vendorCompany,
        vendorLogoUrl: vendorDisplay.vendorLogoUrl,
        vendorPhone: vendorDisplay.vendorPhone,
        vendorEmail: vendorDisplay.vendorEmail,
        showReferralCta: false,
        showClientColumn: true,
        referralUrl: null,
        platformUrl: orgPlatformUrl,
        recurrenceNotice: reportRecurrenceNotice,
        isFirstReport: data.isHistorical,
        cadence,
        preferencesUrl: internalCopyRecipient ? null : preferencesUrl,
        internalCopyRecipient,
      });
      const primaryText = `${orgReport.text}\n\n${reportRecurrenceNotice}${preferencesUrl ? `\n\nUnsubscribe: ${preferencesUrl}` : ""}`;

      // Si el push de mas abajo va a alcanzar a quien recibe este email, la
      // campanita ya le queda por ahi: el email no la duplica. Se resuelve el
      // usuario del email a mano porque el destinatario puede ser una casilla
      // generica (support/billing) que no es de nadie en particular.
      const usuarioDelEmail = await resolveUserIdByEmail(orgEmailTarget);
      const elPushLoAlcanza = !input.overrideRecipientEmail && orgRecipient.pushUserIds.length > 0;

      const result = await sendTransactionalEmail({
        to: orgEmailTarget,
        subject: brandedSubject(subject),
        html: renderHtml(),
        text: primaryText,
        senderName: FIXED_SENDER_NAME,
        notification: {
          source: "qbo_weekly_invoice_report",
          organizationId: input.organizationId,
          userId: elPushLoAlcanza
            ? userIdParaEmailSinDuplicarCampanita(usuarioDelEmail, orgRecipient.pushUserIds)
            : usuarioDelEmail,
          title: orgSubjectBase,
        },
      });
      if (result.ok) {
        if (deliveryClaim) await finishReportDelivery(deliveryClaim, "sent");
        orgEmailsSent = 1;
        if (!input.overrideRecipientEmail) {
          await sendInternalOwnerCopies({
            primaryRecipient: orgEmailTarget,
            organizationId: input.organizationId,
            subject: orgSubjectBase,
            text: `${orgReport.text}\n\n${reportRecurrenceNotice}`,
            renderHtml: (originalRecipient) => renderHtml(originalRecipient),
          });
        }

        if (!input.overrideRecipientEmail && orgRecipient.pushUserIds.length) {
          await sendPushToUsers(
            orgRecipient.pushUserIds,
            { title: orgSubjectBase, body: `Your ${cadence} document delivery summary is ready.`, url: "/app/integrations/quickbooks" },
            { source: "qbo_weekly_invoice_report", organizationId: input.organizationId },
          );
        }
      } else {
        if (deliveryClaim) await finishReportDelivery(deliveryClaim, "failed", result.error);
        deliveryFailures += 1;
      }
      }
    }
  }

  // Branch emails: one independent report per branch, never grouped/corporate.
  const branchPlatformUrl = `${appBase}/integrations/qbo-r365`;
  let branchEmailsSent = 0;
  let skippedBranches = 0;

  if (sendTo === "all" || sendTo === "branches") {
    for (const group of data.groups) {
      for (const branch of group.branches) {
        // Subscription creation deliberately follows these activity/contact
        // checks so a never-active branch remains untouched.
        if (!branch.hasDeliveredInvoices) {
          skippedBranches += 1;
          continue;
        }
        const target = input.overrideRecipientEmail ?? branch.resolvedEmail;
        if (!target) {
          skippedBranches += 1;
          continue;
        }

        let preferencesUrl: string | null = null;
        if (!input.overrideRecipientEmail) {
          const subscription = await getOrCreateQboReportSubscription({
            organizationId: input.organizationId,
            targetType: "branch",
            targetId: branch.syncConfigCustomerId,
            recipientEmail: branch.resolvedEmail!,
            defaultFrequency: "weekly",
          });
          if (!shouldSendQboReport(subscription.frequency, cadence)) {
            skippedBranches += 1;
            continue;
          }
          const token = createQboReportPreferenceToken(subscription);
          preferencesUrl = `${appBase}/email/preferences?token=${encodeURIComponent(token)}&unsub=1`;
        }

        const deliveryClaim = runId ? await claimReportDelivery({
          runId,
          targetType: "branch",
          targetId: branch.syncConfigCustomerId,
          recipientEmail: target,
        }) : null;
        if (runId && !deliveryClaim) continue;

        const referralToken = createReferralToken(input.organizationId, branch.syncConfigCustomerId);
        const referralUrl = `${appBase}/refer/${referralToken}`;
        const branchReport = buildBranchReportText(data, branch, cadence);
        const subject = input.overrideRecipientEmail
          ? `[test] ${branchReport.subject}`
          : branchReport.subject;

        const renderHtml = (internalCopyRecipient?: string) => buildWeeklyReportHtml({
          recipientName: branch.branchName,
          periodLabel: pLabel,
          invoiceLines: branch.invoices,
          vendorCompany: vendorDisplay.vendorCompany,
          vendorLogoUrl: vendorDisplay.vendorLogoUrl,
          vendorPhone: vendorDisplay.vendorPhone,
          vendorEmail: vendorDisplay.vendorEmail,
          showReferralCta: true,
          referralUrl,
          platformUrl: branchPlatformUrl,
          recurrenceNotice: reportRecurrenceNotice,
          isFirstReport: data.isHistorical,
          cadence,
          preferencesUrl: internalCopyRecipient ? null : preferencesUrl,
          internalCopyRecipient,
        });
        const primaryText = `${branchReport.text}\n\n${reportRecurrenceNotice}${preferencesUrl ? `\n\nUnsubscribe: ${preferencesUrl}` : ""}`;
        const result = await sendTransactionalEmail({
          to: target,
          subject: brandedSubject(subject),
          html: renderHtml(),
          text: primaryText,
          senderName: FIXED_SENDER_NAME,
          notification: {
            source: "qbo_weekly_invoice_report",
            organizationId: input.organizationId,
            title: branchReport.subject,
          },
        });
        if (!result.ok) {
          if (deliveryClaim) await finishReportDelivery(deliveryClaim, "failed", result.error);
          deliveryFailures += 1;
          continue;
        }

        if (deliveryClaim) await finishReportDelivery(deliveryClaim, "sent");
        branchEmailsSent += 1;
        if (!input.overrideRecipientEmail) {
          await sendInternalOwnerCopies({
            primaryRecipient: target,
            organizationId: input.organizationId,
            subject: branchReport.subject,
            text: `${branchReport.text}\n\n${reportRecurrenceNotice}`,
            renderHtml: (originalRecipient) => renderHtml(originalRecipient),
          });
        }
      }
    }
  }

    if (runClaim) {
      await finishReportRun(
        runClaim,
        deliveryFailures === 0 ? "completed" : "failed",
        deliveryFailures === 0 ? undefined : `${deliveryFailures} primary report delivery failure(s)`,
      );
    }

    return { orgEmailsSent, branchEmailsSent, skippedBranches, deliveryFailures };
  } catch (error) {
    if (runClaim) {
      await finishReportRun(runClaim, "failed", error instanceof Error ? error.message : "Report delivery failed");
    }
    throw error;
  }
}

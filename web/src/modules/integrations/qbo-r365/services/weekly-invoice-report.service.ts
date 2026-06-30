import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { buildWeeklyReportHtml } from "./weekly-report-template";
import { createReferralToken } from "./referral-token";

// These emails are GetBackplate's own operational communication about the
// integration it runs — the brand must always read "GetBackplate", never the
// recipient organization's own custom branding.
const FIXED_SENDER_NAME = "GetBackplate";
function brandedSubject(subject: string): string {
  return `[${FIXED_SENDER_NAME}] ${subject}`;
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

export const FIRST_REPORT_NOTICE =
  "This is a one-time summary of everything delivered since your integration went live. " +
  "Starting next Monday, you'll receive this report weekly, covering just that week's invoices.";

function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.getbackplate.com").replace(/\/$/, "");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
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

  return orgs
    .filter((org) => qboPlanIds.has(org.integration_plan_id as string))
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
      .select("name, integration_vendor_profile")
      .eq("id", organizationId)
      .maybeSingle(),
    admin
      .from("organization_settings")
      .select("support_email, support_phone, company_logo_url")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  const profile = (orgRow?.integration_vendor_profile ?? {}) as Record<string, string | undefined>;
  const vendorCompany =
    (typeof profile.company === "string" && profile.company.trim()) ||
    (typeof orgRow?.name === "string" && orgRow.name.trim()) ||
    "Your Vendor";

  const vendorLogoUrl =
    (typeof settings?.company_logo_url === "string" && settings.company_logo_url.trim()) || null;

  const vendorPhone =
    (typeof profile.phone === "string" && profile.phone.trim()) ||
    (typeof settings?.support_phone === "string" && settings.support_phone.trim()) ||
    null;

  const vendorEmail =
    (typeof profile.email === "string" && profile.email.trim()) ||
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
}): Promise<OrgWeeklyReportData> {
  const admin = createSupabaseAdminClient();
  const ownEmails = await getOrgOwnEmailSet(input.organizationId);

  const { data: syncConfigs, error: syncConfigsError } = await admin
    .from("qbo_r365_sync_configs")
    .select("id, name")
    .eq("organization_id", input.organizationId);

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
        invoiceQuery = invoiceQuery.gte("sent_at", input.periodStart).lt("sent_at", input.periodEnd);
      }

      const { data: invoices, error: invoicesError } = await invoiceQuery;
      if (invoicesError) throw new Error(invoicesError.message);
      if (!invoices?.length) continue;

      const billEmailRaw = (invoices[0].raw_entity as Record<string, unknown> | null)?.["BillEmail"] as
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
          skipReason = "the email QuickBooks has on file matches your own email, not the client's";
        } else {
          skipReason = "QuickBooks has no email on file for this client and no backup email is configured";
        }
      }

      branches.push({
        syncConfigCustomerId: customer.id as string,
        branchName: customer.qbo_customer_name,
        invoices: invoices
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

export function buildOrgReportText(data: OrgWeeklyReportData): { subject: string; text: string } {
  const subject = data.isHistorical
    ? "Historical invoice delivery summary"
    : `Weekly invoice delivery summary — ${periodLabel(data)}`;

  const lines: string[] = [];
  lines.push(
    data.isHistorical
      ? "Hi! Here is your first report: a summary of all invoices your integration has delivered through today."
      : `Here is your weekly report: a summary of invoices your integration delivered ${periodLabel(data)}.`,
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
        lines.push(`${prefix} Invoice #${inv.docNumber} — ${formatDate(inv.sentAt)}`);
        total += 1;
      }
      if (branch.skipReason) {
        skipped.push(`${branch.branchName}: ${branch.skipReason}`);
      }
    }
    lines.push("");
  }

  lines.push(`Total: ${total} invoice${total === 1 ? "" : "s"} delivered.`);

  if (skipped.length) {
    lines.push("");
    lines.push("Could not notify these clients:");
    for (const reason of skipped) {
      lines.push(`  • ${reason}`);
    }
  }

  return { subject, text: lines.join("\n") };
}

export function buildBranchReportText(data: OrgWeeklyReportData, branch: BranchReport): { subject: string; text: string } {
  const subject = data.isHistorical
    ? "Historical invoice delivery summary"
    : `Weekly invoice delivery summary — ${periodLabel(data)}`;

  const lines: string[] = [];
  lines.push(`Hi ${branch.branchName},`);
  lines.push("");
  lines.push(
    data.isHistorical
      ? "Here is your first report: a summary of all invoices you received in your FTP through today."
      : `Here is your weekly report: a summary of invoices you received in your FTP ${periodLabel(data)}.`,
  );
  lines.push("");
  for (const inv of branch.invoices) {
    lines.push(`  • Invoice #${inv.docNumber} — ${formatDate(inv.sentAt)}`);
  }

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
  overrideRecipientEmail?: string;
  recordRun?: boolean;
}): Promise<{ orgEmailSent: boolean; branchEmailsSent: number; skippedBranches: number }> {
  const admin = createSupabaseAdminClient();
  const appBase = getAppBaseUrl();

  const { data: org } = await admin.from("organizations").select("name").eq("id", input.organizationId).single();
  const organizationName = org?.name ?? "Your Company";

  const [data, vendorDisplay] = await Promise.all([
    buildOrgWeeklyReportData({
      organizationId: input.organizationId,
      organizationName,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      isHistorical: input.isHistorical,
    }),
    getOrgVendorDisplayInfo(input.organizationId),
  ]);

  const pLabel = periodLabel(data);
  const orgReport = buildOrgReportText(data);
  const orgRecipient = await getOrgReportRecipient(input.organizationId);
  const orgEmailTarget = input.overrideRecipientEmail ?? orgRecipient.email;

  // Org email: no CTA de referido, link directo al dashboard de la integracion
  const orgPlatformUrl = `${appBase}/app/integrations/quickbooks`;

  // Recopilar todos los invoices de la org para el resumen total
  const allOrgInvoices = data.groups.flatMap((g) => g.branches.flatMap((b) => b.invoices));
  const recurrenceNotice = data.isHistorical ? FIRST_REPORT_NOTICE : WEEKLY_RECURRENCE_NOTICE;

  let orgEmailSent = false;
  if (orgEmailTarget) {
    const subject = input.overrideRecipientEmail
      ? `[TEST - would go to ${organizationName}] ${orgReport.subject}`
      : orgReport.subject;

    const html = buildWeeklyReportHtml({
      recipientName: organizationName,
      periodLabel: pLabel,
      invoiceLines: allOrgInvoices,
      vendorCompany: vendorDisplay.vendorCompany,
      vendorLogoUrl: vendorDisplay.vendorLogoUrl,
      vendorPhone: vendorDisplay.vendorPhone,
      vendorEmail: vendorDisplay.vendorEmail,
      showReferralCta: false,
      referralUrl: null,
      platformUrl: orgPlatformUrl,
      recurrenceNotice,
      isFirstReport: data.isHistorical,
    });

    await sendTransactionalEmail({
      to: orgEmailTarget,
      subject: brandedSubject(subject),
      html,
      text: `${orgReport.text}\n\n${recurrenceNotice}`,
      senderName: FIXED_SENDER_NAME,
      notification: {
        source: "qbo_weekly_invoice_report",
        organizationId: input.organizationId,
        title: orgReport.subject,
      },
    });
    orgEmailSent = true;

    if (!input.overrideRecipientEmail && orgRecipient.pushUserIds.length) {
      await sendPushToUsers(
        orgRecipient.pushUserIds,
        { title: orgReport.subject, body: "Your weekly invoice delivery summary is ready.", url: "/app/integrations/quickbooks" },
        { source: "qbo_weekly_invoice_report", organizationId: input.organizationId },
      );
    }
  }

  // Branch emails: con CTA de referido, link a la pagina publica de la integracion
  const branchPlatformUrl = `${appBase}/integrations/qbo-r365`;
  let branchEmailsSent = 0;
  let skippedBranches = 0;

  for (const group of data.groups) {
    for (const branch of group.branches) {
      const target = input.overrideRecipientEmail ?? branch.resolvedEmail;
      if (!target) {
        skippedBranches += 1;
        continue;
      }

      const referralToken = createReferralToken(input.organizationId, branch.syncConfigCustomerId);
      const referralUrl = `${appBase}/refer/${referralToken}`;

      const branchReport = buildBranchReportText(data, branch);
      const subject = input.overrideRecipientEmail
        ? `[TEST - would go to ${branch.branchName}] ${branchReport.subject}`
        : branchReport.subject;

      const html = buildWeeklyReportHtml({
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
        recurrenceNotice,
        isFirstReport: data.isHistorical,
      });

      await sendTransactionalEmail({
        to: target,
        subject: brandedSubject(subject),
        html,
        text: `${branchReport.text}\n\n${recurrenceNotice}`,
        senderName: FIXED_SENDER_NAME,
        notification: {
          source: "qbo_weekly_invoice_report",
          organizationId: input.organizationId,
          title: branchReport.subject,
        },
      });
      branchEmailsSent += 1;
    }
  }

  if (input.recordRun && !input.overrideRecipientEmail && input.periodStart && input.periodEnd) {
    await admin.from("qbo_weekly_invoice_report_runs").insert({
      organization_id: input.organizationId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
    });
  }

  return { orgEmailSent, branchEmailsSent, skippedBranches };
}

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { COMPANY_ADDRESS } from "@/shared/lib/company-addresses";
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

function ownerReportCopies(primaryRecipient: string, isPreview: boolean): string[] | undefined {
  if (isPreview) return undefined;

  const primary = primaryRecipient.trim().toLowerCase();
  const recipients = (process.env.OWNER_WEEKLY_REPORT_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter((email, index, all) =>
      Boolean(email) &&
      email.toLowerCase() !== primary &&
      all.findIndex((candidate) => candidate.toLowerCase() === email.toLowerCase()) === index,
    );

  return recipients.length ? recipients : undefined;
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

export const MONTHLY_RECURRENCE_NOTICE =
  "You'll receive this report at the close of each billing cycle, when your subscription renews.";

export const FIRST_REPORT_NOTICE =
  "This is a one-time summary of everything delivered since your integration went live. " +
  "Starting next Monday, you'll receive this report weekly, covering just that week's invoices.";

export const FIRST_ORG_REPORT_NOTICE =
  "This is a summary of everything delivered since your integration went live. " +
  "Going forward, you'll receive this report at the end of each monthly reporting cycle, " +
  "covering all invoices delivered during that period.";

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
        invoiceQuery = invoiceQuery.gte("sent_at", input.periodStart).lt("sent_at", nextUtcDate(input.periodEnd));
      }

      const { data: invoices, error: invoicesError } = await invoiceQuery;
      if (invoicesError) throw new Error(invoicesError.message);

      // Sin facturas en esta ventana: igual se incluye la sucursal (para poder
      // mandarle el correo de "sin facturas esta semana"), resolviendo el email
      // de contacto a partir de su factura mas reciente en cualquier momento.
      let emailSourceRawEntity: unknown = invoices?.[0]?.raw_entity ?? null;
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

  lines.push("", COMPANY_ADDRESS.inline);

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
  if (!data.isHistorical && branch.invoices.length === 0) {
    lines.push(`No invoices this week. Your integration is active and monitoring — nothing was issued between ${periodLabel(data)}.`);
  } else {
    for (const inv of branch.invoices) {
      lines.push(`  • Invoice #${inv.docNumber} — ${formatDate(inv.sentAt)}`);
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
  overrideRecipientEmail?: string;
  recordRun?: boolean;
  sendTo?: "all" | "org" | "branches";
}): Promise<{ orgEmailsSent: number; branchEmailsSent: number; skippedBranches: number }> {
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

  // Org email: link a la landing pública de la integración
  const orgPlatformUrl = `${appBase}/integrations/qbo-r365`;

  const sendTo = input.sendTo ?? "all";
  const orgRecurrenceNotice = data.isHistorical ? FIRST_ORG_REPORT_NOTICE : MONTHLY_RECURRENCE_NOTICE;
  const branchRecurrenceNotice = data.isHistorical ? FIRST_REPORT_NOTICE : WEEKLY_RECURRENCE_NOTICE;

  // Org email: un solo mail agregado con todas las facturas, solo si sendTo incluye "org"
  let orgEmailsSent = 0;
  if ((sendTo === "all" || sendTo === "org") && orgEmailTarget) {
    const allOrgInvoices = data.groups.flatMap((g) =>
      g.branches.flatMap((b) => b.invoices.map((inv) => ({ ...inv, clientName: b.branchName }))),
    );
    const orgSubjectBase = data.isHistorical
      ? `Historical invoice delivery summary — ${pLabel}`
      : sendTo === "org"
        ? `Monthly invoice delivery summary — ${pLabel}`
        : `Weekly invoice delivery summary — ${pLabel}`;
    const subject = input.overrideRecipientEmail
      ? `[test] ${orgSubjectBase}`
      : orgSubjectBase;

    const html = buildWeeklyReportHtml({
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
      recurrenceNotice: orgRecurrenceNotice,
      isFirstReport: data.isHistorical,
    });

    await sendTransactionalEmail({
      to: orgEmailTarget,
      bcc: ownerReportCopies(orgEmailTarget, Boolean(input.overrideRecipientEmail)),
      subject: brandedSubject(subject),
      html,
      text: `${orgReport.text}\n\n${orgRecurrenceNotice}`,
      senderName: FIXED_SENDER_NAME,
      notification: {
        source: "qbo_weekly_invoice_report",
        organizationId: input.organizationId,
        title: orgSubjectBase,
      },
    });
    orgEmailsSent = 1;

    if (!input.overrideRecipientEmail && orgRecipient.pushUserIds.length) {
      await sendPushToUsers(
        orgRecipient.pushUserIds,
        { title: orgSubjectBase, body: "Your monthly invoice delivery summary is ready.", url: "/app/integrations/quickbooks" },
        { source: "qbo_weekly_invoice_report", organizationId: input.organizationId },
      );
    }
  }

  // Branch emails: con CTA de referido, solo si sendTo incluye "branches"
  const branchPlatformUrl = `${appBase}/integrations/qbo-r365`;
  let branchEmailsSent = 0;
  let skippedBranches = 0;

  if (sendTo === "all" || sendTo === "branches") {
    for (const group of data.groups) {
      for (const branch of group.branches) {
        // Primer envio historico de una sucursal que nunca tuvo ninguna factura:
        // no hay nada que reportar todavia, se omite (no aplica el estado "sin
        // facturas esta semana", que es solo para la cadencia semanal normal).
        if (branch.invoices.length === 0 && data.isHistorical) {
          skippedBranches += 1;
          continue;
        }
        // Sucursal que nunca tuvo ninguna factura y no tiene ningun contacto
        // resuelto: nunca fue parte activa de la integracion, no se le manda
        // nada ni siquiera en modo de prueba (--override), para no generar
        // ruido con sucursales configuradas pero jamas activadas.
        if (branch.invoices.length === 0 && !branch.resolvedEmail) {
          skippedBranches += 1;
          continue;
        }
        const target = input.overrideRecipientEmail ?? branch.resolvedEmail;
        if (!target) {
          skippedBranches += 1;
          continue;
        }

        const referralToken = createReferralToken(input.organizationId, branch.syncConfigCustomerId);
        const referralUrl = `${appBase}/refer/${referralToken}`;

        const branchReport = buildBranchReportText(data, branch);
        const subject = input.overrideRecipientEmail
          ? `[test] ${branchReport.subject}`
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
          recurrenceNotice: branchRecurrenceNotice,
          isFirstReport: data.isHistorical,
        });

        await sendTransactionalEmail({
          to: target,
          bcc: ownerReportCopies(target, Boolean(input.overrideRecipientEmail)),
          subject: brandedSubject(subject),
          html,
          text: `${branchReport.text}\n\n${branchRecurrenceNotice}`,
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
  }

  if (input.recordRun && !input.overrideRecipientEmail && input.periodStart && input.periodEnd) {
    await admin.from("qbo_weekly_invoice_report_runs").insert({
      organization_id: input.organizationId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
    });
  }

  return { orgEmailsSent, branchEmailsSent, skippedBranches };
}

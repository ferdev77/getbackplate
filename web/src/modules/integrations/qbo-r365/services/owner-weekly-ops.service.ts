import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { listQboIntegrationOrganizations } from "./weekly-invoice-report.service";
import {
  buildOwnerWeeklyOpsHtml,
  type OwnerBranchStatus,
  type OwnerOrgSection,
} from "./owner-weekly-ops-template";

const QUIET_THRESHOLD_DAYS = 14;
const FIXED_SENDER_NAME = "GetBackplate";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function nextUtcDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type BranchAggregate = OwnerBranchStatus & {
  invoicesThisWeek: number;
};

async function buildOrgSection(input: {
  organizationId: string;
  organizationName: string;
  periodStart: string;
  periodEnd: string;
}): Promise<{ section: OwnerOrgSection; quiet: OwnerBranchStatus[] }> {
  const admin = createSupabaseAdminClient();
  const now = Date.now();

  const { data: syncConfigs, error: syncConfigsError } = await admin
    .from("qbo_r365_sync_configs")
    .select("id, name")
    .eq("organization_id", input.organizationId);
  if (syncConfigsError) throw new Error(syncConfigsError.message);

  const groups: OwnerOrgSection["groups"] = [];
  const allQuiet: OwnerBranchStatus[] = [];
  let orgDelivered = 0;

  for (const config of syncConfigs ?? []) {
    const { data: customers, error: customersError } = await admin
      .from("qbo_r365_sync_config_customers")
      .select("id, qbo_customer_id, qbo_customer_name")
      .eq("sync_config_id", config.id);
    if (customersError) throw new Error(customersError.message);
    if (!customers?.length) continue;

    const branches: BranchAggregate[] = [];

    for (const customer of customers) {
      const { count: invoicesThisWeek, error: weekError } = await admin
        .from("qbo_unified_invoices")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", input.organizationId)
        .eq("sync_config_id", config.id)
        .ilike("customer_name", customer.qbo_customer_name)
        .eq("pipeline_status", "enviada")
        .gte("sent_at", input.periodStart)
        .lt("sent_at", nextUtcDate(input.periodEnd));
      if (weekError) throw new Error(weekError.message);

      const { data: lastEver, error: lastEverError } = await admin
        .from("qbo_unified_invoices")
        .select("sent_at")
        .eq("organization_id", input.organizationId)
        .eq("sync_config_id", config.id)
        .ilike("customer_name", customer.qbo_customer_name)
        .eq("pipeline_status", "enviada")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastEverError) throw new Error(lastEverError.message);

      const lastInvoiceSentAt = (lastEver?.sent_at as string | null) ?? null;
      const thisWeekCount = invoicesThisWeek ?? 0;
      const daysSinceLast = lastInvoiceSentAt ? (now - new Date(lastInvoiceSentAt).getTime()) / 86_400_000 : null;
      const isQuiet = thisWeekCount === 0 && daysSinceLast !== null && daysSinceLast >= QUIET_THRESHOLD_DAYS;

      const isSingleBranchGroup = customers.length === 1 && config.name === customer.qbo_customer_name;
      const branchLabel = isSingleBranchGroup
        ? customer.qbo_customer_name
        : `${config.name} — ${customer.qbo_customer_name}`;

      branches.push({
        branchLabel,
        qboCustomerId: customer.qbo_customer_id,
        lastInvoiceSentAt,
        quietWeeks: isQuiet ? Math.floor((daysSinceLast as number) / 7) : null,
        invoicesThisWeek: thisWeekCount,
      });
    }

    const totalLocations = branches.length;
    const activeLocations = branches.filter((b) => b.invoicesThisWeek > 0).length;
    const quietBranches = branches.filter((b) => b.quietWeeks !== null);
    const invoicesThisWeek = branches.reduce((sum, b) => sum + b.invoicesThisWeek, 0);

    groups.push({
      syncConfigName: config.name,
      totalLocations,
      activeLocations,
      quietLocations: quietBranches.length,
      invoicesThisWeek,
    });

    orgDelivered += invoicesThisWeek;
    allQuiet.push(...quietBranches);
  }

  return {
    section: { organizationName: input.organizationName, groups, totalDelivered: orgDelivered },
    quiet: allQuiet,
  };
}

export async function sendOwnerWeeklyOpsReport(input: {
  periodStart: string;
  periodEnd: string;
  overrideRecipientEmail?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const recipients = input.overrideRecipientEmail
    ? [input.overrideRecipientEmail]
    : (process.env.OWNER_WEEKLY_REPORT_EMAIL ?? "")
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);
  if (!recipients.length) {
    return { sent: false, reason: "OWNER_WEEKLY_REPORT_EMAIL no configurada" };
  }

  const admin = createSupabaseAdminClient();
  const orgs = await listQboIntegrationOrganizations();

  const orgSections: OwnerOrgSection[] = [];
  const quietList: OwnerBranchStatus[] = [];
  let totalDelivered = 0;
  let totalLocations = 0;
  let activeLocations = 0;

  for (const org of orgs) {
    const { section, quiet } = await buildOrgSection({
      organizationId: org.id,
      organizationName: org.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    if (!section.groups.length) continue;

    orgSections.push(section);
    quietList.push(...quiet);
    totalDelivered += section.totalDelivered;
    for (const g of section.groups) {
      totalLocations += g.totalLocations;
      activeLocations += g.activeLocations;
    }
  }

  const quietLocations = quietList.length;
  const inNormalGapLocations = totalLocations - activeLocations - quietLocations;

  const { data: recoveryRuns, error: recoveryError } = await admin
    .from("qbo_recovery_run_log")
    .select("completed")
    .gte("ran_at", input.periodStart)
    .lt("ran_at", nextUtcDate(input.periodEnd));
  if (recoveryError) throw new Error(recoveryError.message);

  const recovered = (recoveryRuns ?? []).reduce((sum, r) => sum + (r.completed ?? 0), 0);
  let failed = 0;
  if (orgs.length) {
    const { count, error: stuckError } = await admin
      .from("qbo_unified_invoices")
      .select("id", { count: "exact", head: true })
      .in("organization_id", orgs.map((org) => org.id))
      .in("pipeline_status", ["en_cola", "capturada", "mapeada"])
      .eq("import_source", "webhook");
    if (stuckError) throw new Error(stuckError.message);
    failed = count ?? 0;
  }

  quietList.sort((a, b) => (b.quietWeeks ?? 0) - (a.quietWeeks ?? 0));

  const periodLabel = `${formatDate(input.periodStart)} – ${formatDate(input.periodEnd)}`;
  const generatedAtLabel = new Date().toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  });

  const html = buildOwnerWeeklyOpsHtml({
    periodLabel,
    generatedAtLabel,
    totalDelivered,
    activeLocations,
    totalLocations,
    quietLocations,
    inNormalGapLocations: Math.max(inNormalGapLocations, 0),
    recovered,
    failed,
    orgSections,
    quietList: quietList.slice(0, 15),
  });

  const subjectBase = `Weekly Operations — ${periodLabel}`;
  const subject = input.overrideRecipientEmail ? `[test] ${subjectBase}` : subjectBase;

  for (const recipient of recipients) {
    if (!input.overrideRecipientEmail) {
      const { data: existingRun } = await admin
        .from("qbo_owner_weekly_report_runs")
        .select("id")
        .eq("period_start", input.periodStart)
        .eq("recipient_email", recipient)
        .maybeSingle();
      if (existingRun) continue;
    }

    const result = await sendTransactionalEmail({
      to: recipient,
      subject: `[${FIXED_SENDER_NAME}] ${subject}`,
      html,
      text: `Weekly Operations ${periodLabel}: ${totalDelivered} invoices delivered, ${activeLocations}/${totalLocations} active locations, ${quietLocations} quiet, ${failed} failed after retries.`,
      senderName: FIXED_SENDER_NAME,
      notification: {
        source: "qbo_owner_weekly_ops_report",
        title: subject,
      },
    });

    if (result.ok && !input.overrideRecipientEmail) {
      await admin.from("qbo_owner_weekly_report_runs").insert({
        period_start: input.periodStart,
        period_end: input.periodEnd,
        recipient_email: recipient,
      });
    }
  }

  return { sent: true };
}

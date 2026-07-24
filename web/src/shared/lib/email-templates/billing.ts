import { COMPANY_ADDRESS } from "@/shared/lib/company-addresses";

export const BILLING_SENDER_NAME = "GetBackplate Billing";

export function buildBillingSubject(subject: string) {
  return `[GetBackplate Billing] ${subject}`;
}

const GETBACKPLATE_LOGO_URL = "https://www.getbackplate.com/getbackplate-logo-light.svg";

function escapeHtml(value: string | number) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? escapeHtml(url.toString()) : "#";
  } catch {
    return "#";
  }
}

function renderSummaryCard(rows: Array<{ label: string; value: string }>) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-collapse:separate;border-radius:10px;overflow:hidden;">
    ${rows.map((row, index) => `<tr><td style="${index ? "border-top:1px solid #e5e7eb;" : ""}color:#6b7280;font-family:Arial,sans-serif;font-size:13px;padding:13px 15px;">${escapeHtml(row.label)}</td><td align="right" style="${index ? "border-top:1px solid #e5e7eb;" : ""}color:#171311;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:13px 15px;">${escapeHtml(row.value)}</td></tr>`).join("")}
  </table>`;
}

function renderBillingEmail(params: { eyebrow: string; title: string; intro: string; accent: string; body: string; action?: { label: string; url: string }; note?: string }) {
  const action = params.action
    ? `<tr><td style="padding:24px 40px 0;"><a href="${escapeHttpUrl(params.action.url)}" style="display:inline-block;background:#171311;border-radius:9px;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;padding:13px 20px;text-decoration:none;">${escapeHtml(params.action.label)}</a></td></tr>`
    : "";
  const note = params.note
    ? `<p style="margin:18px 0 0;color:#6b7280;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;">${params.note}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><body style="margin:0;padding:0;background:#f5f6f8;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 0 20px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;"><img src="${GETBACKPLATE_LOGO_URL}" alt="GetBackplate" style="display:block;height:auto;max-height:34px;width:auto;"></td><td style="color:#6b7280;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;padding-left:10px;text-transform:uppercase;">Billing</td></tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;"><div style="background:${params.accent};height:6px;line-height:6px;font-size:1px;">&nbsp;</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0">
<tr><td style="padding:36px 40px 0;"><p style="color:${params.accent};font-family:Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:.1em;margin:0;text-transform:uppercase;">${escapeHtml(params.eyebrow)}</p><h1 style="color:#171311;font-family:Arial,sans-serif;font-size:27px;letter-spacing:-.5px;line-height:1.2;margin:10px 0 0;">${escapeHtml(params.title)}</h1><p style="color:#4b5563;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;margin:14px 0 0;">${params.intro}</p></td></tr>
<tr><td style="padding:24px 40px 0;">${params.body}</td></tr>${action}<tr><td style="padding:26px 40px 36px;">${note}</td></tr>
</table></td></tr>
<tr><td style="padding:20px 10px 0;color:#8a8c95;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;text-align:center;"><strong style="color:#6b7280;">Backplate Technologies LLC, d/b/a GetBackplate</strong><br>${COMPANY_ADDRESS.inline}<br><a href="mailto:support@getbackplate.com" style="color:#8a8c95;">support@getbackplate.com</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function planRenewalReminderTemplate({ orgName, renewalDate, amount, lineItems, usageNote }: { orgName: string; renewalDate: string; amount: string; lineItems?: Array<{ description: string; amount: string }>; usageNote?: string }) {
  const itemRows = lineItems && lineItems.length
    ? lineItems.map((item) => `<tr><td style="border-top:1px solid #e5e7eb;color:#374151;font-family:Arial,sans-serif;font-size:13px;padding:11px 0;">${escapeHtml(item.description)}</td><td align="right" style="border-top:1px solid #e5e7eb;color:#171311;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:11px 0;">${escapeHtml(item.amount)}</td></tr>`).join("")
    : `<tr><td style="border-top:1px solid #e5e7eb;color:#374151;font-family:Arial,sans-serif;font-size:13px;padding:11px 0;">Subscription renewal</td><td align="right" style="border-top:1px solid #e5e7eb;color:#171311;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:11px 0;">${escapeHtml(amount)}</td></tr>`;
  const usageNoteBlock = usageNote
    ? `<p style="color:#6b7280;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;margin:14px 0 0;">${escapeHtml(usageNote)}</p>`
    : "";
  return renderBillingEmail({
    eyebrow: "Upcoming renewal", title: "Your plan renews soon", accent: "#c24a1e",
    intro: `Hello <strong>${escapeHtml(orgName)}</strong>, this is a reminder that your GetBackplate subscription will renew soon.`,
    body: `${renderSummaryCard([{ label: "Renewal date", value: renewalDate }])}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:18px;"><tbody>${itemRows}<tr><td style="border-top:1px solid #171311;color:#171311;font-family:Arial,sans-serif;font-size:14px;font-weight:800;padding:14px 0 0;">Renewal amount</td><td align="right" style="border-top:1px solid #171311;color:#171311;font-family:Arial,sans-serif;font-size:15px;font-weight:800;padding:14px 0 0;">${escapeHtml(amount)}</td></tr></tbody></table>${usageNoteBlock}`,
    action: { label: "Manage billing", url: "https://app.getbackplate.com/app/billing/portal-launch" },
    note: "If you need to make a change, please review your subscription before the renewal date.",
  });
}

export function paymentFailedTemplate({ orgName, retryLink }: { orgName: string; retryLink: string }) {
  return renderBillingEmail({
    eyebrow: "Action required", title: "We could not process your payment", accent: "#b42318",
    intro: `Hello <strong>${escapeHtml(orgName)}</strong>, Stripe was unable to process your latest GetBackplate subscription payment.`,
    body: `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;color:#7f1d1d;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;padding:14px 16px;">Update the payment method on file to avoid an interruption to your service.</div>`,
    action: { label: "Update payment method", url: retryLink },
    note: "If you have already updated your payment method, you can ignore this message.",
  });
}

export function planChangedTemplate({ orgName, planName }: { orgName: string; planName: string }) {
  return renderBillingEmail({
    eyebrow: "Subscription updated", title: "Your plan has been updated", accent: "#059669",
    intro: `Hello <strong>${escapeHtml(orgName)}</strong>, your GetBackplate subscription is now on the plan below.`,
    body: renderSummaryCard([{ label: "Active plan", value: planName }]),
    action: { label: "View billing", url: "https://app.getbackplate.com/app/billing/portal-launch" },
  });
}

export function subscriptionActivatedTemplate({ orgName, planName, trialDays, dashboardUrl }: { orgName: string; planName: string; trialDays: number; dashboardUrl?: string }) {
  return renderBillingEmail({
    eyebrow: "Subscription confirmed", title: "Your subscription is active", accent: "#059669",
    intro: `Hello <strong>${escapeHtml(orgName)}</strong>, Stripe confirmed your payment and your GetBackplate workspace is ready.`,
    body: renderSummaryCard([{ label: "Active plan", value: planName }, { label: "Status", value: trialDays > 0 ? `${trialDays}-day trial active` : "Subscription active" }]),
    action: { label: "Open your workspace", url: dashboardUrl ?? "https://app.getbackplate.com/app/dashboard" },
  });
}

export function successfulPaymentTemplate(params: { orgName: string; paymentDate: string; amount: string; invoiceNumber: string; lineItems: Array<{ description: string; amount: string }>; extraR365Connections?: number; invoiceUrl?: string; billingPortalUrl: string }) {
  const itemRows = params.lineItems.length
    ? params.lineItems.map((item) => `<tr><td style="border-top:1px solid #e5e7eb;color:#374151;font-family:Arial,sans-serif;font-size:13px;padding:11px 0;">${escapeHtml(item.description)}</td><td align="right" style="border-top:1px solid #e5e7eb;color:#171311;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:11px 0;">${escapeHtml(item.amount)}</td></tr>`).join("")
    : `<tr><td style="border-top:1px solid #e5e7eb;color:#374151;font-family:Arial,sans-serif;font-size:13px;padding:11px 0;">Subscription payment</td><td align="right" style="border-top:1px solid #e5e7eb;color:#171311;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:11px 0;">${escapeHtml(params.amount)}</td></tr>`;
  const extraConnections = params.extraR365Connections
    ? `<p style="color:#047857;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;margin:14px 0 0;">${escapeHtml(params.extraR365Connections)} additional R365 connection${params.extraR365Connections === 1 ? "" : "s"} added to your subscription.</p>` : "";
  return renderBillingEmail({
    eyebrow: "Payment received", title: "Your payment was successful", accent: "#059669",
    intro: `Hello <strong>${escapeHtml(params.orgName)}</strong>, Stripe confirmed your GetBackplate payment.`,
    body: `${renderSummaryCard([{ label: "Payment date", value: params.paymentDate }, { label: "Invoice / reference", value: params.invoiceNumber }])}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:18px;"><tbody>${itemRows}<tr><td style="border-top:1px solid #171311;color:#171311;font-family:Arial,sans-serif;font-size:14px;font-weight:800;padding:14px 0 0;">Total paid</td><td align="right" style="border-top:1px solid #171311;color:#171311;font-family:Arial,sans-serif;font-size:15px;font-weight:800;padding:14px 0 0;">${escapeHtml(params.amount)}</td></tr></tbody></table>${extraConnections}`,
    action: { label: params.invoiceUrl ? "View invoice in Stripe" : "Manage billing", url: params.invoiceUrl ?? params.billingPortalUrl },
    note: "Keep this email for your records. For billing questions, contact GetBackplate Support.",
  });
}

type PlanChangeTemplateProps = { orgName: string; actorName: string; actorEmail: string; previousPlanName: string; targetPlanName: string; targetPlanPrice: string; targetPlanLimits: Array<{ label: string; value: string }>; modulesToEnable: string[]; modulesToDisable: string[]; direction: "upgrade" | "downgrade"; changedAt: string; applied: boolean };

function planChangeTemplate(params: PlanChangeTemplateProps) {
  const changes = [...params.modulesToEnable.map((module) => `+ ${module}`), ...params.modulesToDisable.map((module) => `- ${module}`)];
  const action = params.applied ? "has been applied" : "was requested";
  return renderBillingEmail({
    eyebrow: params.direction === "downgrade" ? "Plan downgrade" : "Plan upgrade", title: `Your plan change ${action}`, accent: params.direction === "downgrade" ? "#d97706" : "#059669",
    intro: `Hello <strong>${escapeHtml(params.orgName)}</strong>, a GetBackplate plan change ${action} by <strong>${escapeHtml(params.actorName)}</strong>.`,
    body: `${renderSummaryCard([{ label: "Previous plan", value: params.previousPlanName }, { label: "New plan", value: params.targetPlanName }, { label: "New price", value: params.targetPlanPrice }, { label: params.applied ? "Applied" : "Requested", value: params.changedAt }])}<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;color:#374151;font-family:Arial,sans-serif;font-size:12px;line-height:1.7;margin-top:18px;padding:14px 16px;"><strong style="color:#171311;">New plan limits</strong><br>${params.targetPlanLimits.map((limit) => `${escapeHtml(limit.label)}: ${escapeHtml(limit.value)}`).join("<br>")}</div>${changes.length ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;color:#374151;font-family:Arial,sans-serif;font-size:12px;line-height:1.7;margin-top:18px;padding:14px 16px;"><strong style="color:#171311;">Module changes</strong><br>${changes.map(escapeHtml).join("<br>")}</div>` : ""}`,
    action: { label: "View billing", url: "https://app.getbackplate.com/app/billing/portal-launch" },
    note: `If you do not recognize this action from ${escapeHtml(params.actorEmail)}, contact GetBackplate Support immediately.`,
  });
}

export function planChangeDecisionTemplate(params: Omit<PlanChangeTemplateProps, "changedAt" | "applied"> & { happenedAt: string }) {
  return planChangeTemplate({ ...params, changedAt: params.happenedAt, applied: false });
}

export function planChangeAppliedTemplate(params: Omit<PlanChangeTemplateProps, "changedAt" | "applied"> & { appliedAt: string }) {
  return planChangeTemplate({ ...params, changedAt: params.appliedAt, applied: true });
}

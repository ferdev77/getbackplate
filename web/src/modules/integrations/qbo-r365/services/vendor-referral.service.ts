import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createLead } from "@/modules/leads/leads.service";
import { COMPANY_ADDRESS } from "@/shared/lib/company-addresses";

export type VendorReferralInput = {
  organizationId: string;
  syncConfigCustomerId: string;
  referrerBranchName: string;
  vendorCompany: string;
  vendorContactName: string;
  vendorEmail: string;
  vendorPhone: string;
};

function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.getbackplate.com").replace(/\/$/, "");
}

function buildOutreachEmailHtml(referrerName: string, recipientName = "there"): string {
  const appBase = getAppBaseUrl();
  const integrationUrl = `${appBase}/integrations/qbo-r365`;

  const LINK_PLACEHOLDER = "%%INTEGRATION_LINK%%";

  const body = `Hi ${recipientName},

I'm Angelo Ramos, founder of GetBackplate.

${referrerName} uses our platform to automate invoice delivery from one of their vendors directly into their Restaurant365 — no manual entry, no PDFs, no reconciliation errors. They mentioned you as another vendor who might benefit from the same setup.

What we do: we connect your QuickBooks® Online to your restaurant customers' Restaurant365 via SFTP. Your invoices land in their system automatically, in the exact format R365 expects. We operate within the Restaurant365 ecosystem, delivering in production to multiple restaurant brands today.

For your team, this means zero manual entry on your customers' side, zero PDF exports on yours, cleaner reconciliation, and positioning as a tech-forward vendor that R365 restaurants prefer.

Onboarding takes a few days, no long-term contracts.

Worth a 15-minute call to see if it fits your operation? Reply with a few times that work for you and I'll send a calendar invite.

Best,

Angelo Ramos
Founder, GetBackplate
angelo@getbackplate.com · (956) 802-9639
${LINK_PLACEHOLDER}`;

  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      LINK_PLACEHOLDER,
      `<a href="${integrationUrl}" style="color:#14151A;text-decoration:none;">getbackplate.com/integrations/qbo-r365</a>`,
    );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Invoice automation for Restaurant365</title>
<style>
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  body { margin:0 !important; padding:0 !important; width:100% !important; }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F7F8FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F7F8FC;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600"
        style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(20,21,26,.04);">

        <tr>
          <td style="padding:24px 32px 0 32px;">
            <a href="https://app.getbackplate.com" style="text-decoration:none;">
              <span style="color:#D4531A;font-size:22px;font-weight:700;line-height:1;vertical-align:middle;">[</span><span style="color:#14151A;font-size:18px;font-weight:700;letter-spacing:-0.01em;vertical-align:middle;padding:0 4px;">GetBackplate</span><span style="color:#D4531A;font-size:22px;font-weight:700;line-height:1;vertical-align:middle;">]</span>
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px 0 32px;">
            <div style="height:3px;background-color:#D4531A;line-height:3px;font-size:0;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <pre style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;white-space:pre-wrap;margin:0;font-size:14px;line-height:1.65;color:#14151A;">${escaped}</pre>
          </td>
        </tr>

      </table>

      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="margin-top:16px;">
        <tr>
          <td style="background-color:#14151A;border-radius:12px;padding:36px 32px;">

            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom:14px;">
                  <a href="https://app.getbackplate.com" style="text-decoration:none;"><span style="color:#D4531A;font-size:22px;font-weight:700;line-height:1;vertical-align:middle;">[</span><span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:-0.01em;vertical-align:middle;padding:0 4px;">GetBackplate</span><span style="color:#D4531A;font-size:22px;font-weight:700;line-height:1;vertical-align:middle;">]</span></a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 20px 0;font-size:13px;color:#8A8C95;line-height:1.6;text-align:center;">
              GetBackplate automates the delivery of invoices and credit memos from QuickBooks® Online
              to your Restaurant365 &mdash; no manual entry, no errors.
            </p>

            <div style="height:1px;background-color:#2A2B33;line-height:1px;font-size:0;margin-bottom:18px;">&nbsp;</div>

            <p style="margin:0;font-size:12px;color:#595B66;line-height:1.6;text-align:center;">
              <a href="${integrationUrl}" style="color:#8A8C95;text-decoration:none;font-weight:500;">www.getbackplate.com/integrations</a>
              <span style="color:#595B66;padding:0 8px;">&middot;</span>
              <a href="mailto:angelo@getbackplate.com" style="color:#8A8C95;text-decoration:none;font-weight:500;">angelo@getbackplate.com</a>
            </p>

            <p style="margin:14px 0 0 0;font-size:11px;color:#595B66;line-height:1.5;text-align:center;">
              Backplate Technologies LLC, d/b/a GetBackplate<br>
              ${COMPANY_ADDRESS.inline}
            </p>

          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

function buildOutreachSubject(referrerName: string): string {
  return `${referrerName} thought of you for Restaurant365 invoice automation`;
}

export type PublicVendorReferralInput = {
  referrerName: string;
  referrerEmail: string;
  vendorCompany: string;
  vendorContactName: string;
  vendorEmail: string;
  visitorIp?: string | null;
  userAgent?: string | null;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export async function sendPublicReferralOwnerNotification(input: {
  referrerName: string;
  referrerEmail?: string;
  vendorCompany: string;
  vendorContactName: string;
  vendorEmail: string;
}, overrideRecipientEmail?: string): Promise<void> {
  const recipients = (overrideRecipientEmail ?? process.env.OWNER_WEEKLY_REPORT_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  if (!recipients.length) return;

  const subject = `Integration referred by ${input.referrerName}`;
  const referrerEmail = input.referrerEmail ? ` (${input.referrerEmail})` : "";
  const referrerEmailHtml = input.referrerEmail ? `<br><a href="mailto:${escapeHtml(input.referrerEmail)}" style="font-size:13px;font-weight:400;color:#d4531a;text-decoration:none;">${escapeHtml(input.referrerEmail)}</a>` : "";
  const text = `A GetBackplate integration was referred by ${input.referrerName}${referrerEmail}. Vendor: ${input.vendorCompany}. Contact: ${input.vendorContactName} (${input.vendorEmail}).\n\n${COMPANY_ADDRESS.inline}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;color:#14151a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6fa;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#14151a;padding:24px 32px;">
          <span style="font-size:19px;font-weight:700;color:#ffffff;letter-spacing:-.3px;">GetBackplate</span>
          <span style="float:right;color:#ff6b35;font-size:11px;font-weight:700;letter-spacing:1.4px;">NEW REFERRAL</span>
        </td></tr>
        <tr><td style="padding:32px 32px 12px;">
          <div style="display:inline-block;background:#fff0e9;color:#c94b16;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:700;letter-spacing:.8px;">INTEGRATION REFERRAL</div>
          <h1 style="margin:18px 0 10px;font-size:27px;line-height:1.18;letter-spacing:-.7px;">A new vendor was referred.</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#595b66;">${escapeHtml(input.referrerName)} referred an integration opportunity. The vendor outreach email has been sent.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e6e8ee;border-radius:10px;overflow:hidden;">
            <tr><td style="padding:14px 16px;background:#f8f9fc;border-bottom:1px solid #e6e8ee;font-size:11px;font-weight:700;letter-spacing:1px;color:#8a8c95;">REFERRER</td></tr>
            <tr><td style="padding:15px 16px;font-size:15px;font-weight:700;">${escapeHtml(input.referrerName)}${referrerEmailHtml}</td></tr>
            <tr><td style="padding:14px 16px;background:#f8f9fc;border-top:1px solid #e6e8ee;border-bottom:1px solid #e6e8ee;font-size:11px;font-weight:700;letter-spacing:1px;color:#8a8c95;">VENDOR</td></tr>
            <tr><td style="padding:15px 16px;font-size:15px;font-weight:700;">${escapeHtml(input.vendorCompany)}<br><span style="font-size:13px;font-weight:400;color:#595b66;">${escapeHtml(input.vendorContactName)} · </span><a href="mailto:${escapeHtml(input.vendorEmail)}" style="font-size:13px;font-weight:400;color:#d4531a;text-decoration:none;">${escapeHtml(input.vendorEmail)}</a></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8f9fc;border-top:1px solid #e6e8ee;font-size:12px;line-height:1.5;color:#8a8c95;text-align:center;">GetBackplate · Restaurant365 invoice automation<br>${COMPANY_ADDRESS.inline}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await Promise.all(recipients.map((to) => sendTransactionalEmail({
    to,
    subject,
    html,
    text,
    senderName: "GetBackplate",
    notification: { source: "qbo_public_vendor_referral_owner", title: subject },
  })));
}

export async function sendPublicVendorReferral(input: PublicVendorReferralInput): Promise<void> {
  const admin = createSupabaseAdminClient();

  const subject = buildOutreachSubject(input.referrerName);
  const html = buildOutreachEmailHtml(input.referrerName, input.vendorContactName);
  const appBase = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.getbackplate.com").replace(/\/$/, "");
  const text = `Hi ${input.vendorContactName},

I'm Angelo Ramos, founder of GetBackplate.

${input.referrerName} uses our platform to automate invoice delivery from one of their vendors directly into their Restaurant365 — no manual entry, no PDFs, no reconciliation errors. They mentioned you as another vendor who might benefit from the same setup.

What we do: we connect your QuickBooks® Online to your restaurant customers' Restaurant365 via SFTP. Your invoices land in their system automatically, in the exact format R365 expects. We operate within the Restaurant365 ecosystem, delivering in production to multiple restaurant brands today.

For your team, this means zero manual entry on your customers' side, zero PDF exports on yours, cleaner reconciliation, and positioning as a tech-forward vendor that R365 restaurants prefer.

Onboarding takes a few days, no long-term contracts.

Worth a 15-minute call to see if it fits your operation? Reply with a few times that work for you and I'll send a calendar invite.

Best,

Angelo Ramos
Founder, GetBackplate
angelo@getbackplate.com · (956) 802-9639
${COMPANY_ADDRESS.inline}
${appBase}/integrations/qbo-r365`;

  await sendTransactionalEmail({
    to: input.vendorEmail,
    subject,
    html,
    text,
    senderName: "Angelo at GetBackplate",
    notification: {
      source: "qbo_public_vendor_referral",
      organizationId: null,
      title: subject,
    },
  });

  const { data: referral } = await admin.from("qbo_public_vendor_referrals").insert({
    referrer_name: input.referrerName,
    referrer_email: input.referrerEmail,
    vendor_company: input.vendorCompany,
    vendor_contact_name: input.vendorContactName,
    vendor_email: input.vendorEmail,
    visitor_ip: input.visitorIp ?? null,
    user_agent: input.userAgent ?? null,
    outreach_sent_at: new Date().toISOString(),
  }).select("id").single();

  if (referral) {
    try {
      await createLead({
        source: "public_referral",
        sourceRecordId: referral.id,
        contactName: input.vendorContactName,
        contactEmail: input.vendorEmail,
        companyName: input.vendorCompany,
        metadata: { referrerName: input.referrerName, referrerEmail: input.referrerEmail },
      });
    } catch (error) {
      console.error("Failed to persist public referral lead", error);
    }
  }

  // Internal delivery failures must not affect the vendor outreach already sent.
  try {
    await sendPublicReferralOwnerNotification(input);
  } catch (error) {
    console.error("Failed to notify integration owners of public referral", error);
  }
}

export async function sendVendorReferral(input: VendorReferralInput): Promise<void> {
  const admin = createSupabaseAdminClient();

  const subject = buildOutreachSubject(input.referrerBranchName);
  const html = buildOutreachEmailHtml(input.referrerBranchName);
  const appBase = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.getbackplate.com").replace(/\/$/, "");
  const text = `Hi there,

I'm Angelo Ramos, founder of GetBackplate.

${input.referrerBranchName} uses our platform to automate invoice delivery from one of their vendors directly into their Restaurant365 — no manual entry, no PDFs, no reconciliation errors. They mentioned you as another vendor who might benefit from the same setup.

What we do: we connect your QuickBooks® Online to your restaurant customers' Restaurant365 via SFTP. Your invoices land in their system automatically, in the exact format R365 expects. We operate within the Restaurant365 ecosystem, delivering in production to multiple restaurant brands today.

For your team, this means zero manual entry on your customers' side, zero PDF exports on yours, cleaner reconciliation, and positioning as a tech-forward vendor that R365 restaurants prefer.

Onboarding takes a few days, no long-term contracts.

Worth a 15-minute call to see if it fits your operation? Reply with a few times that work for you and I'll send a calendar invite.

Best,

Angelo Ramos
Founder, GetBackplate
angelo@getbackplate.com · (956) 802-9639
${COMPANY_ADDRESS.inline}
${appBase}/integrations/qbo-r365`;

  await sendTransactionalEmail({
    to: input.vendorEmail,
    subject,
    html,
    text,
    senderName: "Angelo at GetBackplate",
    notification: {
      source: "qbo_vendor_referral",
      organizationId: input.organizationId,
      title: subject,
    },
  });

  const { data: referral } = await admin.from("qbo_vendor_referrals").insert({
    organization_id: input.organizationId,
    sync_config_customer_id: input.syncConfigCustomerId,
    referrer_branch_name: input.referrerBranchName,
    vendor_company: input.vendorCompany,
    vendor_contact_name: input.vendorContactName,
    vendor_email: input.vendorEmail,
    vendor_phone: input.vendorPhone,
    outreach_sent_at: new Date().toISOString(),
  }).select("id").single();

  if (referral) {
    try {
      await createLead({
        source: "private_referral",
        sourceRecordId: referral.id,
        contactName: input.vendorContactName,
        contactEmail: input.vendorEmail,
        contactPhone: input.vendorPhone,
        companyName: input.vendorCompany,
        metadata: {
          organizationId: input.organizationId,
          syncConfigCustomerId: input.syncConfigCustomerId,
          referrerBranchName: input.referrerBranchName,
        },
      });
    } catch (error) {
      console.error("Failed to persist private referral lead", error);
    }
  }

  try {
    await sendPublicReferralOwnerNotification({
      referrerName: input.referrerBranchName,
      vendorCompany: input.vendorCompany,
      vendorContactName: input.vendorContactName,
      vendorEmail: input.vendorEmail,
    });
  } catch (error) {
    console.error("Failed to notify integration owners of token referral", error);
  }
}

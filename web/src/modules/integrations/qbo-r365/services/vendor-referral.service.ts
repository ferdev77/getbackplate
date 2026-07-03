import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendTransactionalEmail } from "@/infrastructure/email/client";

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

function buildOutreachEmailHtml(referrerName: string, vendorName: string): string {
  const appBase = getAppBaseUrl();
  const integrationUrl = `${appBase}/integrations/qbo-r365`;

  const LINK_PLACEHOLDER = "%%INTEGRATION_LINK%%";

  const body = `Hi there,

I'm Angelo Ramos, founder of GetBackplate.

${referrerName} uses our platform to automate invoice delivery from one of their vendors directly into their Restaurant365 — no manual entry, no PDFs, no reconciliation errors. They mentioned you as another vendor who might benefit from the same setup.

What we do: we connect your QuickBooks Online to your restaurant customers' Restaurant365 via SFTP. Your invoices land in their system automatically, in the exact format R365 expects. We operate within the Restaurant365 ecosystem, delivering in production to multiple restaurant brands today.

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
              GetBackplate automates the delivery of invoices and credit memos from QuickBooks Online
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
              1321 Upland Dr., Suite 9894, Houston, TX 77043
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

export async function sendVendorReferral(input: VendorReferralInput): Promise<void> {
  const admin = createSupabaseAdminClient();

  const subject = buildOutreachSubject(input.referrerBranchName);
  const html = buildOutreachEmailHtml(input.referrerBranchName, input.vendorCompany);
  const appBase = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.getbackplate.com").replace(/\/$/, "");
  const text = `Hi there,

I'm Angelo Ramos, founder of GetBackplate.

${input.referrerBranchName} uses our platform to automate invoice delivery from one of their vendors directly into their Restaurant365 — no manual entry, no PDFs, no reconciliation errors. They mentioned you as another vendor who might benefit from the same setup.

What we do: we connect your QuickBooks Online to your restaurant customers' Restaurant365 via SFTP. Your invoices land in their system automatically, in the exact format R365 expects. We operate within the Restaurant365 ecosystem, delivering in production to multiple restaurant brands today.

For your team, this means zero manual entry on your customers' side, zero PDF exports on yours, cleaner reconciliation, and positioning as a tech-forward vendor that R365 restaurants prefer.

Onboarding takes a few days, no long-term contracts.

Worth a 15-minute call to see if it fits your operation? Reply with a few times that work for you and I'll send a calendar invite.

Best,

Angelo Ramos
Founder, GetBackplate
angelo@getbackplate.com · (956) 802-9639
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

  await admin.from("qbo_vendor_referrals").insert({
    organization_id: input.organizationId,
    sync_config_customer_id: input.syncConfigCustomerId,
    referrer_branch_name: input.referrerBranchName,
    vendor_company: input.vendorCompany,
    vendor_contact_name: input.vendorContactName,
    vendor_email: input.vendorEmail,
    vendor_phone: input.vendorPhone,
    outreach_sent_at: new Date().toISOString(),
  });
}

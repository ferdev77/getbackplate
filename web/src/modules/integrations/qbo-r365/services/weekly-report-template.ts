export type WeeklyReportInvoiceLine = {
  docNumber: string;
  sentAt: string;
  totalAmount: number | null;
};

export type WeeklyReportTemplateInput = {
  recipientName: string;
  periodLabel: string;
  invoiceLines: WeeklyReportInvoiceLine[];
  vendorCompany: string;
  vendorLogoUrl: string | null;
  vendorPhone: string | null;
  vendorEmail: string | null;
  showReferralCta: boolean;
  referralUrl: string | null;
  platformUrl: string;
  recurrenceNotice: string;
  isFirstReport: boolean;
};

function fmt(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function vendorHeaderBlock(vendorCompany: string, vendorLogoUrl: string | null): string {
  const inner = vendorLogoUrl
    ? `<img src="${vendorLogoUrl}" alt="${vendorCompany}" width="140" style="display:block;max-width:140px;height:auto;">`
    : `<span style="font-size:15px;font-weight:700;color:#14151A;letter-spacing:-0.01em;">${vendorCompany}</span>`;

  return `
    <tr>
      <td style="padding:32px 32px 0 32px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
          style="background-color:#F7F8FC;border-radius:8px;">
          <tr>
            <td style="padding:20px;text-align:left;">${inner}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function invoiceRows(lines: WeeklyReportInvoiceLine[]): string {
  return lines
    .map(
      (inv) => `
      <tr>
        <td style="padding:14px 0;font-size:14px;color:#14151A;font-weight:600;border-bottom:1px solid #E6E8EE;width:40%;">
          Invoice #${inv.docNumber}
        </td>
        <td style="padding:14px 0;font-size:14px;color:#595B66;border-bottom:1px solid #E6E8EE;width:30%;text-align:center;">
          ${fmtDate(inv.sentAt)}
        </td>
        <td style="padding:14px 0;font-size:14px;color:#14151A;font-weight:600;border-bottom:1px solid #E6E8EE;width:30%;text-align:right;">
          ${inv.totalAmount != null ? fmt(inv.totalAmount) : "—"}
        </td>
      </tr>`,
    )
    .join("");
}

function referralCtaBlock(referralUrl: string): string {
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="background-color:#F7F8FC;border-radius:12px;padding:24px;">
          <p style="margin:0 0 8px 0;font-size:16px;color:#14151A;font-weight:700;letter-spacing:-0.01em;">
            Other vendors still sending you PDFs?
          </p>
          <p style="margin:0 0 18px 0;font-size:14px;color:#595B66;line-height:1.55;">
            If they're typing invoices into spreadsheets, we can automate them too.
          </p>
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#D4531A;border-radius:6px;">
                <a href="${referralUrl}"
                  style="display:inline-block;padding:11px 20px;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.01em;">
                  Refer a vendor &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

function supportBlock(vendorCompany: string, vendorPhone: string | null, vendorEmail: string | null): string {
  let contact = "";
  if (vendorPhone) {
    contact = `<a href="tel:${vendorPhone.replace(/\s/g, "")}"
      style="color:#D4531A;text-decoration:none;font-weight:600;white-space:nowrap;">${vendorPhone}</a>`;
  } else if (vendorEmail) {
    contact = `<a href="mailto:${vendorEmail}"
      style="color:#D4531A;text-decoration:none;font-weight:600;">${vendorEmail}</a>`;
  }

  if (!contact) return "";

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
      style="margin:0 0 28px 0;">
      <tr>
        <td style="border-top:1px solid #E6E8EE;padding-top:20px;">
          <p style="margin:0;font-size:13px;color:#595B66;line-height:1.55;">
            <strong style="color:#14151A;font-weight:600;">Questions or reconciliations?</strong>
            Reach out to ${vendorCompany} at ${contact}
          </p>
        </td>
      </tr>
    </table>`;
}

export function buildWeeklyReportHtml(input: WeeklyReportTemplateInput): string {
  const {
    recipientName,
    periodLabel,
    invoiceLines,
    vendorCompany,
    vendorLogoUrl,
    vendorPhone,
    vendorEmail,
    showReferralCta,
    referralUrl,
    platformUrl,
    recurrenceNotice,
    isFirstReport,
  } = input;

  const heroSubtitle = isFirstReport
    ? "Here's a summary of every invoice your integration has delivered automatically to your Restaurant365 so far."
    : "Here's your weekly summary of invoices delivered automatically to your Restaurant365.";
  const metricEyebrow = isFirstReport ? "Delivered so far" : "This week";

  const totalCount = invoiceLines.length;
  const totalAmount = invoiceLines.reduce((sum, inv) => sum + (inv.totalAmount ?? 0), 0);
  const hasAmounts = invoiceLines.some((inv) => inv.totalAmount != null);
  const metricValue = hasAmounts
    ? `${totalCount} invoice${totalCount === 1 ? "" : "s"} &middot; ${fmt(totalAmount)}`
    : `${totalCount} invoice${totalCount === 1 ? "" : "s"}`;

  const lastInvoiceRow = invoiceLines.length
    ? `
      <tr>
        <td style="padding:14px 0;font-size:14px;color:#14151A;font-weight:600;width:40%;">
          Invoice #${invoiceLines[invoiceLines.length - 1].docNumber}
        </td>
        <td style="padding:14px 0;font-size:14px;color:#595B66;width:30%;text-align:center;">
          ${fmtDate(invoiceLines[invoiceLines.length - 1].sentAt)}
        </td>
        <td style="padding:14px 0;font-size:14px;color:#14151A;font-weight:600;width:30%;text-align:right;">
          ${invoiceLines[invoiceLines.length - 1].totalAmount != null ? fmt(invoiceLines[invoiceLines.length - 1].totalAmount!) : "—"}
        </td>
      </tr>`
    : "";

  // Build invoice rows without last one (it has no border-bottom)
  const middleRows = invoiceLines.length > 1 ? invoiceRows(invoiceLines.slice(0, -1)) : "";
  const allRows = invoiceLines.length === 1 ? lastInvoiceRow : middleRows + lastInvoiceRow;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Weekly delivery report &middot; GetBackplate</title>
<style>
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  a[x-apple-data-detectors] {
    color:inherit !important; text-decoration:none !important; font-size:inherit !important;
    font-family:inherit !important; font-weight:inherit !important; line-height:inherit !important;
  }
  @media screen and (max-width:640px) {
    .container { width:100% !important; max-width:100% !important; }
    .stack-padding { padding:24px !important; }
    .invoice-cell { display:block !important; width:100% !important; padding:4px 0 !important; text-align:left !important; }
    .invoice-amount { text-align:left !important; padding-top:0 !important; padding-bottom:12px !important; border-bottom:1px solid #E6E8EE; }
    .metric-value { font-size:22px !important; }
    .hero-title { font-size:16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F7F8FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
  ${isFirstReport
    ? `Everything delivered to Restaurant365 so far — ${totalCount} invoice${totalCount === 1 ? "" : "s"}.`
    : `Your weekly summary of invoices delivered to Restaurant365 — ${totalCount} invoice${totalCount === 1 ? "" : "s"} this week.`}
</div>

<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F7F8FC;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" class="container" border="0" cellpadding="0" cellspacing="0" width="600"
        style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(20,21,26,.04);">

        ${vendorHeaderBlock(vendorCompany, vendorLogoUrl)}

        <tr>
          <td style="padding:24px 32px 0 32px;">
            <div style="height:3px;background-color:#D4531A;line-height:3px;font-size:0;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td class="stack-padding" style="padding:32px;">

            <p class="hero-title"
              style="margin:0 0 12px 0;font-size:18px;color:#14151A;font-weight:700;letter-spacing:-0.01em;line-height:1.3;">
              Hi ${recipientName},
            </p>

            <p style="margin:0 0 24px 0;font-size:15px;color:#595B66;line-height:1.6;">
              ${heroSubtitle}
            </p>

            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
              style="margin:0 0 28px 0;">
              <tr>
                <td style="background-color:#FCE9DF;border-left:3px solid #D4531A;border-radius:8px;padding:20px 24px;">
                  <p style="margin:0 0 6px 0;font-size:11px;color:#A23E12;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">
                    ${metricEyebrow}
                  </p>
                  <p class="metric-value"
                    style="margin:0 0 4px 0;font-size:26px;color:#14151A;font-weight:700;letter-spacing:-0.02em;line-height:1.1;">
                    ${metricValue}
                  </p>
                  <p style="margin:0;font-size:13px;color:#595B66;line-height:1.4;">
                    Delivered without manual entry — ${periodLabel}
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 10px 0;font-size:11px;color:#8A8C95;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">
              Details
            </p>

            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
              style="margin:0 0 28px 0;border-top:1px solid #E6E8EE;">
              ${allRows}
            </table>

            <p style="margin:0 0 28px 0;font-size:13px;color:#8A8C95;line-height:1.5;">
              ${recurrenceNotice}
            </p>

            ${supportBlock(vendorCompany, vendorPhone, vendorEmail)}

            ${showReferralCta && referralUrl ? referralCtaBlock(referralUrl) : ""}

          </td>
        </tr>

      </table>

      <table role="presentation" class="container" border="0" cellpadding="0" cellspacing="0" width="600"
        style="margin-top:16px;">
        <tr>
          <td style="background-color:#14151A;border-radius:12px;padding:36px 32px;">

            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom:14px;">
                  <span style="color:#D4531A;font-size:22px;font-weight:700;line-height:1;vertical-align:middle;">[</span><span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:-0.01em;vertical-align:middle;padding:0 4px;">GetBackplate</span><span style="color:#D4531A;font-size:22px;font-weight:700;line-height:1;vertical-align:middle;">]</span>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 20px 0;font-size:13px;color:#8A8C95;line-height:1.6;text-align:center;">
              GetBackplate automates the delivery of invoices and credit memos from QuickBooks Online
              to your Restaurant365 &mdash; no manual entry, no errors.
            </p>

            <div style="height:1px;background-color:#2A2B33;line-height:1px;font-size:0;margin-bottom:18px;">&nbsp;</div>

            <p style="margin:0;font-size:12px;color:#595B66;line-height:1.6;text-align:center;">
              <a href="${platformUrl}" style="color:#8A8C95;text-decoration:none;font-weight:500;">${platformUrl.replace(/^https?:\/\//, "")}</a>
              <span style="color:#595B66;padding:0 8px;">&middot;</span>
              <a href="mailto:support@getbackplate.com" style="color:#8A8C95;text-decoration:none;font-weight:500;">support@getbackplate.com</a>
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

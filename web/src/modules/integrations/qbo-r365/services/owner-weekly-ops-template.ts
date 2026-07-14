export type OwnerBranchStatus = {
  branchLabel: string;
  qboCustomerId: string;
  lastInvoiceSentAt: string | null;
  quietWeeks: number | null;
};

export type OwnerClientGroup = {
  syncConfigName: string;
  totalLocations: number;
  activeLocations: number;
  quietLocations: number;
  invoicesThisWeek: number;
};

export type OwnerOrgSection = {
  organizationName: string;
  groups: OwnerClientGroup[];
  totalDelivered: number;
};

export type OwnerWeeklyOpsTemplateInput = {
  periodLabel: string;
  generatedAtLabel: string;
  totalDelivered: number;
  activeLocations: number;
  totalLocations: number;
  quietLocations: number;
  inNormalGapLocations: number;
  recovered: number;
  failed: number;
  orgSections: OwnerOrgSection[];
  quietList: OwnerBranchStatus[];
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function attentionBlock(input: OwnerWeeklyOpsTemplateInput): string {
  const lines: string[] = [];

  if (input.quietLocations > 0) {
    lines.push(`
      <tr>
        <td style="padding:3px 0;font-size:14.5px;line-height:1.5;color:#14151A;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:#D4531A;margin-right:8px;"></span>
          <b>${input.quietLocations} location${input.quietLocations === 1 ? "" : "s"} ${input.quietLocations === 1 ? "has" : "have"} gone quiet.</b>
          No invoices for 2+ weeks — see the list below.
        </td>
      </tr>`);
  }

  if (input.failed > 0) {
    lines.push(`
      <tr>
        <td style="padding:3px 0;font-size:14.5px;line-height:1.5;color:#14151A;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:#B42318;margin-right:8px;"></span>
          <b>${input.failed} invoice${input.failed === 1 ? "" : "s"} still stuck</b> after automatic retries — needs manual review.
        </td>
      </tr>`);
  } else {
    lines.push(`
      <tr>
        <td style="padding:3px 0;font-size:14.5px;line-height:1.5;color:#14151A;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:#15803D;margin-right:8px;"></span>
          All deliveries succeeded.
          <span style="color:#595B66;font-family:'Courier New',monospace;font-size:12.5px;">${input.recovered} auto-retr${input.recovered === 1 ? "y" : "ies"} recovered, 0 failed.</span>
        </td>
      </tr>`);
  }

  const isClear = input.quietLocations === 0 && input.failed === 0;

  return `
    <tr>
      <td style="padding:0 0 8px 0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
          style="background-color:${isClear ? "#E7F5EC" : "#FCE9DF"};border-left:3px solid ${isClear ? "#15803D" : "#D4531A"};border-radius:8px;">
          <tr>
            <td style="padding:16px 18px;">
              <p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#8A8C95;">
                ${isClear ? "All clear" : "Needs your attention"}
              </p>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                ${lines.join("")}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function kpiTile(value: string, label: string, colorClass?: "ok" | "warn"): string {
  const color = colorClass === "ok" ? "#15803D" : colorClass === "warn" ? "#D4531A" : "#14151A";
  return `
    <td style="padding:15px 8px;text-align:center;border-right:1px solid #E6E8EE;width:25%;">
      <div style="font-family:'Courier New',monospace;font-size:19px;font-weight:600;color:${color};">${value}</div>
      <div style="margin-top:4px;font-size:10.5px;letter-spacing:0.05em;text-transform:uppercase;color:#8A8C95;font-weight:600;">${label}</div>
    </td>`;
}

function kpiRow(input: OwnerWeeklyOpsTemplateInput): string {
  return `
    <tr>
      <td style="padding:0 0 4px 0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
          style="border:1px solid #E6E8EE;border-radius:8px;">
          <tr>
            ${kpiTile(String(input.totalDelivered), "Delivered")}
            ${kpiTile(`${input.activeLocations}/${input.totalLocations}`, "Active loc.")}
            ${kpiTile(String(input.quietLocations), "Quiet", input.quietLocations > 0 ? "warn" : undefined)}
            <td style="padding:15px 8px;text-align:center;width:25%;">
              <div style="font-family:'Courier New',monospace;font-size:19px;font-weight:600;color:${input.failed > 0 ? "#B42318" : "#15803D"};">${input.failed}</div>
              <div style="margin-top:4px;font-size:10.5px;letter-spacing:0.05em;text-transform:uppercase;color:#8A8C95;font-weight:600;">Failed</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function orgSection(org: OwnerOrgSection): string {
  const clientRows = org.groups
    .map((g) => {
      const pill =
        g.quietLocations > 0
          ? `<span style="font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;background-color:#FEF3D7;color:#B45309;">${g.quietLocations} quiet</span>`
          : `<span style="font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;background-color:#E7F5EC;color:#15803D;">On track</span>`;
      return `
        <tr>
          <td style="padding:15px 0;border-top:1px solid #E6E8EE;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="font-weight:700;font-size:15.5px;letter-spacing:-0.01em;">${g.syncConfigName}</td>
                <td align="right">${pill}</td>
              </tr>
            </table>
            <p style="margin:5px 0 0 0;font-size:13px;color:#595B66;">
              <span style="font-family:'Courier New',monospace;">${g.activeLocations}/${g.totalLocations}</span> locations active &middot;
              <span style="font-family:'Courier New',monospace;">${g.invoicesThisWeek}</span> invoice${g.invoicesThisWeek === 1 ? "" : "s"} this week
            </p>
          </td>
        </tr>`;
    })
    .join("");

  return `
    <tr>
      <td style="padding:22px 0 4px 0;">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8C95;">
          By client &mdash; ${org.organizationName}
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          ${clientRows}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:13px 16px;background-color:#EEF0F4;border-radius:8px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="font-size:11px;font-weight:700;color:#525866;letter-spacing:0.06em;text-transform:uppercase;">${org.organizationName} total</td>
            <td align="right" style="font-family:'Courier New',monospace;font-size:13.5px;font-weight:600;color:#14151A;">
              ${org.totalDelivered} invoice${org.totalDelivered === 1 ? "" : "s"} delivered
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function quietListBlock(quietList: OwnerBranchStatus[]): string {
  if (!quietList.length) return "";
  const rows = quietList
    .map(
      (b, i) => `
      <tr>
        <td style="padding:12px 0;${i > 0 ? "border-top:1px solid #E6E8EE;" : ""}">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <div style="font-weight:600;font-size:14.5px;letter-spacing:-0.01em;color:#14151A;">${b.branchLabel}</div>
                <div style="font-family:'Courier New',monospace;font-size:11.5px;color:#8A8C95;margin-top:1px;">
                  Acct #${b.qboCustomerId}${b.lastInvoiceSentAt ? ` &middot; last delivery ${fmtDate(b.lastInvoiceSentAt)}` : ""}
                </div>
              </td>
              <td align="right" style="font-family:'Courier New',monospace;font-size:12.5px;color:#B45309;font-weight:600;white-space:nowrap;">
                quiet ${b.quietWeeks} wk${b.quietWeeks === 1 ? "" : "s"}
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
    )
    .join("");

  return `
    <tr>
      <td style="padding:22px 0 4px 0;">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#8A8C95;">
          Locations to look at
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          ${rows}
        </table>
      </td>
    </tr>`;
}

export function buildOwnerWeeklyOpsHtml(input: OwnerWeeklyOpsTemplateInput): string {
  const orgSections = input.orgSections.map(orgSection).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Weekly Operations &middot; GetBackplate</title>
<style>
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  @media screen and (max-width:460px) {
    .container { width:100% !important; max-width:100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#F7F8FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#F7F8FC;">
  <tr>
    <td align="center" style="padding:28px 16px 44px;">

      <table role="presentation" class="container" border="0" cellpadding="0" cellspacing="0" width="640"
        style="background-color:#FFFFFF;border:1px solid #E6E8EE;border-radius:16px;overflow:hidden;">

        <tr>
          <td style="padding:26px 28px 0;">
            <div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;color:#14151A;">
              GetBackplate<span style="color:#D4531A;">.</span>
            </div>
            <div style="margin-top:2px;font-size:13px;color:#595B66;font-weight:500;">Weekly Operations &mdash; internal delivery report</div>
            <div style="height:3px;background-color:#D4531A;border-radius:3px;margin:18px 0 0;line-height:3px;font-size:0;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td style="padding:12px 28px 22px;font-family:'Courier New',monospace;font-size:12.5px;color:#8A8C95;">
            ${input.periodLabel} &middot; QuickBooks &rarr; R365
          </td>
        </tr>

        <tr>
          <td style="padding:0 28px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              ${attentionBlock(input)}
              ${kpiRow(input)}
              ${orgSections}
              ${quietListBlock(input.quietList)}
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 28px 24px;color:#8A8C95;font-size:12px;line-height:1.65;border-top:1px solid #E6E8EE;margin-top:20px;">
            Generated <span style="font-family:'Courier New',monospace;">${input.generatedAtLabel}</span> &middot; internal use only.<br>
            ${
              input.inNormalGapLocations > 0
                ? `${input.inNormalGapLocations} other location${input.inNormalGapLocations === 1 ? "" : "s"} had no activity this week but ${input.inNormalGapLocations === 1 ? "is" : "are"} within a normal gap &mdash; not flagged yet.`
                : ""
            }
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}

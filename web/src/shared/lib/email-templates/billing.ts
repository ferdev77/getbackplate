import type { TenantEmailBranding } from "@/shared/lib/email-branding";

type RenewalReminderProps = { orgName: string; renewalDate: string; amount: string; branding?: TenantEmailBranding };
export function planRenewalReminderTemplate({ orgName, renewalDate, amount, branding }: RenewalReminderProps) {
  const brandName = resolveBillingBrandName(branding);
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311;">
      ${renderBrandingHeader(branding)}
      <h2>Hello ${orgName},</h2>
      <p>This is a reminder that your current plan will renew soon, on <strong>${renewalDate}</strong>.</p>
      <p>The renewal amount will be <strong>${amount}</strong>.</p>
      <br />
      <p>If you would like to make changes to your subscription, you can do so from your admin dashboard.</p>
      <br />
      <p>Thank you for choosing ${brandName}.</p>
      <p style="color: #666; font-size: 12px;">The ${brandName} team</p>
    </div>
  `;
}

type PlanChangeDecisionProps = {
  orgName: string;
  actorName: string;
  actorEmail: string;
  previousPlanName: string;
  targetPlanName: string;
  targetPlanPrice: string;
  targetPlanLimits: Array<{ label: string; value: string }>;
  modulesToEnable: string[];
  modulesToDisable: string[];
  direction: "upgrade" | "downgrade";
  happenedAt: string;
  branding?: TenantEmailBranding;
};

export function renderBrandingHeader(branding?: TenantEmailBranding) {
  const defaultLogo = `${(process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://getbackplate.com").replace(/\/$/, "")}/getbackplate-logo-light.svg`;

  if (!branding?.isCustom) {
    return `
      <div style="margin:0 0 10px 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;display:inline-block;">
        <img src="${escapeHtml(defaultLogo)}" alt="GetBackplate" style="max-height:42px;width:auto;display:block;" />
      </div>
    `;
  }

  const logo = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="Logo ${escapeHtml(branding.companyName)}" style="max-height:42px;width:auto;display:block;" />`
    : `<p style="margin:0;font-size:12px;font-weight:700;color:#374151;">${escapeHtml(branding.companyName)}</p>`;

  return `
    <div style="margin:0 0 10px 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;display:inline-block;">
      ${logo}
    </div>
  `;
}

function resolveBillingBrandName(branding?: TenantEmailBranding) {
  return branding?.isCustom ? branding.companyName : "GetBackplate";
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? escapeHtml(url.toString()) : "#";
  } catch {
    return "#";
  }
}

function renderModuleList(items: string[], emptyLabel: string, accentColor: string, bgColor: string) {
  if (!items.length) {
    return `<p style="margin:0;color:#6b7280;font-size:12px;">${emptyLabel}</p>`;
  }

  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${items
        .map(
          (item) =>
            `<span style="display:inline-block;border:1px solid ${accentColor};background:${bgColor};color:${accentColor};padding:5px 10px;border-radius:999px;font-size:11px;font-weight:700;">${item}</span>`,
        )
        .join("")}
    </div>
  `;
}

export function planChangeDecisionTemplate({
  orgName,
  actorName,
  actorEmail,
  previousPlanName,
  targetPlanName,
  targetPlanPrice,
  targetPlanLimits,
  modulesToEnable,
  modulesToDisable,
  direction,
  happenedAt,
  branding,
}: PlanChangeDecisionProps) {
  const isDowngrade = direction === "downgrade";
  const title = isDowngrade ? "Plan downgrade requested" : "Plan upgrade requested";
  const subtitle = isDowngrade
    ? "Review the modules that may be disabled under the new plan."
    : "Your organization unlocks new capabilities with the new plan.";
  const accent = isDowngrade ? "#d97706" : "#059669";
  const accentSoft = isDowngrade ? "#fff7ed" : "#ecfdf5";

  const limitsHtml = targetPlanLimits
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:12px;">${item.label}</td>
          <td style="padding:8px 0;color:#111827;font-size:12px;font-weight:700;text-align:right;">${item.value}</td>
        </tr>
      `,
    )
    .join("");

  const brandName = resolveBillingBrandName(branding);

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f5f6f8;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <div style="height:6px;background:${accent};"></div>

        <div style="padding:24px 24px 8px 24px;">
          ${renderBrandingHeader(branding)}
          <h2 style="margin:0;font-size:24px;line-height:1.2;color:#111827;">${title}</h2>
          <p style="margin:10px 0 0 0;color:#4b5563;font-size:14px;line-height:1.5;">${subtitle}</p>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fafafa;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Change summary</p>
            <p style="margin:0;color:#111827;font-size:14px;"><strong>${previousPlanName}</strong> -> <strong>${targetPlanName}</strong></p>
            <p style="margin:6px 0 0 0;color:#111827;font-size:14px;">New cost: <strong>${targetPlanPrice}</strong></p>
          </div>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
            <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Requested by</p>
            <p style="margin:0;color:#111827;font-size:14px;"><strong>${actorName}</strong> (${actorEmail})</p>
            <p style="margin:6px 0 0 0;color:#6b7280;font-size:12px;">Date: ${happenedAt}</p>
          </div>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:${accentSoft};">
            <p style="margin:0 0 10px 0;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Modules being enabled</p>
            ${renderModuleList(modulesToEnable, "No new modules were detected for this change.", "#047857", "#d1fae5")}
            <div style="height:12px;"></div>
            <p style="margin:0 0 10px 0;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Modules being disabled</p>
            ${renderModuleList(modulesToDisable, "No modules were detected to disable.", "#b45309", "#ffedd5")}
          </div>
        </div>

        <div style="padding:16px 24px 8px 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">New plan limits</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tbody>
                ${limitsHtml}
              </tbody>
            </table>
          </div>
        </div>

        <div style="padding:12px 24px 24px 24px;">
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
            This notification confirms that the plan change was requested from the administrator account for <strong>${orgName}</strong>.
            If you do not recognize this action, review access to your dashboard immediately.
          </p>
          <p style="margin:10px 0 0 0;color:#9ca3af;font-size:11px;">${brandName} Billing</p>
        </div>
      </div>
    </div>
  `;
}

type PlanChangeAppliedProps = {
  orgName: string;
  actorName: string;
  actorEmail: string;
  previousPlanName: string;
  targetPlanName: string;
  targetPlanPrice: string;
  targetPlanLimits: Array<{ label: string; value: string }>;
  modulesToEnable: string[];
  modulesToDisable: string[];
  direction: "upgrade" | "downgrade";
  appliedAt: string;
  branding?: TenantEmailBranding;
};

export function planChangeAppliedTemplate({
  orgName,
  actorName,
  actorEmail,
  previousPlanName,
  targetPlanName,
  targetPlanPrice,
  targetPlanLimits,
  modulesToEnable,
  modulesToDisable,
  direction,
  appliedAt,
  branding,
}: PlanChangeAppliedProps) {
  const isDowngrade = direction === "downgrade";
  const title = isDowngrade ? "Plan change applied: downgrade completed" : "Plan change applied: upgrade completed";
  const accent = isDowngrade ? "#d97706" : "#059669";
  const accentSoft = isDowngrade ? "#fff7ed" : "#ecfdf5";

  const limitsHtml = targetPlanLimits
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:12px;">${item.label}</td>
          <td style="padding:8px 0;color:#111827;font-size:12px;font-weight:700;text-align:right;">${item.value}</td>
        </tr>
      `,
    )
    .join("");

  const brandName = resolveBillingBrandName(branding);

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f5f6f8;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <div style="height:6px;background:${accent};"></div>

        <div style="padding:24px 24px 8px 24px;">
          ${renderBrandingHeader(branding)}
          <h2 style="margin:0;font-size:24px;line-height:1.2;color:#111827;">${title}</h2>
          <p style="margin:10px 0 0 0;color:#4b5563;font-size:14px;line-height:1.5;">The change was confirmed by Stripe and is now active for ${orgName}.</p>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fafafa;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Final result</p>
            <p style="margin:0;color:#111827;font-size:14px;"><strong>${previousPlanName}</strong> -> <strong>${targetPlanName}</strong></p>
            <p style="margin:6px 0 0 0;color:#111827;font-size:14px;">Current cost: <strong>${targetPlanPrice}</strong></p>
          </div>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
            <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Responsible administrator</p>
            <p style="margin:0;color:#111827;font-size:14px;"><strong>${actorName}</strong> (${actorEmail})</p>
            <p style="margin:6px 0 0 0;color:#6b7280;font-size:12px;">Applied: ${appliedAt}</p>
          </div>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:${accentSoft};">
            <p style="margin:0 0 10px 0;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Enabled modules</p>
            ${renderModuleList(modulesToEnable, "No new module activations.", "#047857", "#d1fae5")}
            <div style="height:12px;"></div>
            <p style="margin:0 0 10px 0;font-size:12px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Disabled modules</p>
            ${renderModuleList(modulesToDisable, "No module deactivations.", "#b45309", "#ffedd5")}
          </div>
        </div>

        <div style="padding:16px 24px 8px 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Current plan limits</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tbody>
                ${limitsHtml}
              </tbody>
            </table>
          </div>
        </div>

        <div style="padding:12px 24px 24px 24px;">
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">This email confirms that the plan has been synchronized in the platform. You can verify its current status from the company dashboard.</p>
          <p style="margin:10px 0 0 0;color:#9ca3af;font-size:11px;">${brandName} Billing</p>
        </div>
      </div>
    </div>
  `;
}

type PlanChangedProps = { orgName: string; planName: string };
export function planChangedTemplate({ orgName, planName, branding }: PlanChangedProps & { branding?: TenantEmailBranding }) {
  const brandName = resolveBillingBrandName(branding);
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311;">
      ${renderBrandingHeader(branding)}
      <h2>Hello ${orgName},</h2>
      <p>Your subscription has been updated successfully.</p>
      <p>Your active plan is now: <strong>${planName}</strong>.</p>
      <br />
      <p>You can now immediately enjoy all platform benefits and new limits.</p>
      <br />
      <p>Thank you for choosing ${brandName}.</p>
      <p style="color: #666; font-size: 12px;">The ${brandName} team</p>
    </div>
  `;
}

type PaymentFailedProps = { orgName: string; retryLink: string };
export function paymentFailedTemplate({ orgName, retryLink, branding }: PaymentFailedProps & { branding?: TenantEmailBranding }) {
  const brandName = resolveBillingBrandName(branding);
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311;">
      ${renderBrandingHeader(branding)}
      <h2>Hello ${orgName},</h2>
      <p style="color: #b91c1c;">We detected an issue while processing your latest subscription payment.</p>
      <p>To avoid interruptions to your service, please update your payment method.</p>
      <br />
      <a href="${retryLink}" style="display: inline-block; background-color: #171311; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">
         Update Payment Method
      </a>
      <br />
      <br />
      <p>If you have already resolved this issue, please ignore this message.</p>
      <p style="color: #666; font-size: 12px;">The ${brandName} team</p>
    </div>
  `;
}

type SubscriptionActivatedProps = {
  orgName: string;
  planName: string;
  trialDays: number;
  dashboardUrl?: string;
};

export function subscriptionActivatedTemplate({ orgName, planName, trialDays, dashboardUrl, branding }: SubscriptionActivatedProps & { branding?: TenantEmailBranding }) {
  const brandName = resolveBillingBrandName(branding);
  const appUrl = dashboardUrl ?? `${(process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://getbackplate.com").replace(/\/$/, "")}/app/dashboard`;
  const trialCopy =
    trialDays > 0
      ? `Your <strong>${trialDays}-day free trial</strong> is now active. Before your first charge, we will send reminders so you can manage your plan with confidence.`
      : "Your plan is now active and your team can use the platform with full access.";

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f5f6f8;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <div style="height:6px;background:#c74b1e;"></div>

        <div style="padding:24px 24px 8px 24px;">
          ${renderBrandingHeader(branding)}
          <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;">Subscription confirmation</p>
          <h2 style="margin:10px 0 0 0;font-size:24px;line-height:1.2;color:#111827;">Your company is now active on ${brandName}</h2>
          <p style="margin:10px 0 0 0;color:#4b5563;font-size:14px;line-height:1.6;">Hello <strong>${orgName}</strong>, we successfully validated your Stripe payment and enabled your workspace.</p>
        </div>

        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fafafa;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Summary</p>
            <p style="margin:0;color:#111827;font-size:14px;">Active plan: <strong>${planName}</strong></p>
            <p style="margin:8px 0 0 0;color:#374151;font-size:13px;line-height:1.6;">${trialCopy}</p>
          </div>
        </div>

        <div style="padding:18px 24px 0 24px;">
          <a href="${appUrl}" style="display:inline-block;background:#171311;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:700;">Go to the company dashboard</a>
        </div>

        <div style="padding:18px 24px 24px 24px;">
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">If you do not recognize this transaction, reply to this email so our support team can assist you immediately.</p>
          <p style="margin:10px 0 0 0;color:#9ca3af;font-size:11px;">${brandName} Billing</p>
        </div>
      </div>
    </div>
  `;
}

type SuccessfulPaymentProps = {
  orgName: string;
  paymentDate: string;
  amount: string;
  invoiceNumber: string;
  lineItems: Array<{ description: string; amount: string }>;
  extraR365Connections?: number;
  invoiceUrl?: string;
  billingPortalUrl: string;
  branding?: TenantEmailBranding;
};

export function successfulPaymentTemplate({
  orgName,
  paymentDate,
  amount,
  invoiceNumber,
  lineItems,
  extraR365Connections,
  invoiceUrl,
  billingPortalUrl,
  branding,
}: SuccessfulPaymentProps) {
  const brandName = resolveBillingBrandName(branding);
  const ctaUrl = invoiceUrl || billingPortalUrl;
  const ctaHref = escapeHttpUrl(ctaUrl);
  const ctaLabel = invoiceUrl ? "View invoice in Stripe" : "Manage billing";
  const itemRows = lineItems.length
    ? lineItems
      .map(
        (item) => `
          <tr>
            <td style="padding:10px 0;color:#374151;font-size:13px;line-height:1.45;">${escapeHtml(item.description)}</td>
            <td style="padding:10px 0;color:#111827;font-size:13px;font-weight:700;text-align:right;white-space:nowrap;">${escapeHtml(item.amount)}</td>
          </tr>
        `,
      )
      .join("")
    : `
      <tr>
        <td style="padding:10px 0;color:#374151;font-size:13px;">Subscription payment</td>
        <td style="padding:10px 0;color:#111827;font-size:13px;font-weight:700;text-align:right;">${escapeHtml(amount)}</td>
      </tr>
    `;
  const extraConnectionsHtml = extraR365Connections && extraR365Connections > 0
    ? `<p style="margin:10px 0 0 0;color:#065f46;font-size:13px;line-height:1.5;"><strong>${escapeHtml(extraR365Connections)}</strong> additional R365 connection${extraR365Connections === 1 ? "" : "s"} added to your subscription.</p>`
    : "";

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f5f6f8;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <div style="height:6px;background:#059669;"></div>
        <div style="padding:24px 24px 8px 24px;">
          ${renderBrandingHeader(branding)}
          <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#059669;">Payment received</p>
          <h2 style="margin:10px 0 0 0;font-size:24px;line-height:1.2;color:#111827;">Your payment was successful</h2>
          <p style="margin:10px 0 0 0;color:#4b5563;font-size:14px;line-height:1.6;">Hello <strong>${escapeHtml(orgName)}</strong>, Stripe has confirmed your payment. Your services remain active.</p>
        </div>
        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #a7f3d0;border-radius:12px;padding:14px 16px;background:#ecfdf5;">
            <p style="margin:0;color:#065f46;font-size:13px;font-weight:700;">Paid successfully</p>
            <p style="margin:6px 0 0 0;color:#374151;font-size:13px;">Payment date: ${escapeHtml(paymentDate)}</p>
          </div>
        </div>
        <div style="padding:16px 24px 0 24px;">
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Receipt details</p>
            <p style="margin:0;color:#374151;font-size:13px;">Invoice / reference: <strong style="color:#111827;">${escapeHtml(invoiceNumber)}</strong></p>
            ${extraConnectionsHtml}
          </div>
        </div>
        <div style="padding:16px 24px 0 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tbody>
              ${itemRows}
              <tr><td colspan="2" style="border-top:1px solid #e5e7eb;padding-top:12px;"></td></tr>
              <tr>
                <td style="color:#111827;font-size:14px;font-weight:800;">Total paid</td>
                <td style="color:#111827;font-size:16px;font-weight:800;text-align:right;">${escapeHtml(amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="padding:20px 24px 0 24px;">
          <a href="${ctaHref}" style="display:inline-block;background:#171311;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:700;">${ctaLabel}</a>
        </div>
        <div style="padding:18px 24px 24px 24px;">
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">Keep this email for your records. For billing questions, please contact your account administrator or reply to this email.</p>
          <p style="margin:10px 0 0 0;color:#9ca3af;font-size:11px;">${escapeHtml(brandName)} Billing</p>
        </div>
      </div>
    </div>
  `;
}

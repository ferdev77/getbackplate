/**
 * Emails sent from SuperAdmin > Cobros when sharing a payment/subscription
 * link directly with a customer. Always in English, always with the
 * GetBackplate logo and signature — these are sent by the GetBackplate team
 * to a customer, never branded as the tenant's own organization.
 */
function renderLogoHeader() {
  const logoUrl = `${(process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://getbackplate.com").replace(/\/$/, "")}/getbackplate-logo-light.svg`;
  return `
    <div style="margin:0 0 10px 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;display:inline-block;">
      <img src="${logoUrl}" alt="GetBackplate" style="max-height:42px;width:auto;display:block;" />
    </div>
  `;
}

function renderShell(accent: string, innerHtml: string) {
  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;background:#f5f6f8;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.06);">
        <div style="height:6px;background:${accent};"></div>
        <div style="padding:24px 24px 8px 24px;">
          ${renderLogoHeader()}
        </div>
        ${innerHtml}
        <div style="padding:18px 24px 24px 24px;">
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">This link was generated and sent by the GetBackplate team. If you weren't expecting this email, you can safely ignore it.</p>
          <p style="margin:10px 0 0 0;color:#9ca3af;font-size:11px;">The GetBackplate Team</p>
        </div>
      </div>
    </div>
  `;
}

type PaymentLinkEmailProps = {
  description: string;
  amountFormatted: string;
  checkoutUrl: string;
};

export function paymentLinkEmailTemplate({ description, amountFormatted, checkoutUrl }: PaymentLinkEmailProps) {
  const inner = `
    <div style="padding:8px 24px 0 24px;">
      <h2 style="margin:0;font-size:24px;line-height:1.2;color:#111827;">You have a pending payment request</h2>
      <p style="margin:10px 0 0 0;color:#4b5563;font-size:14px;line-height:1.6;">GetBackplate has prepared a secure payment link for you. Please review the details below.</p>
    </div>

    <div style="padding:16px 24px 0 24px;">
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fafafa;">
        <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Summary</p>
        <p style="margin:0;color:#111827;font-size:14px;">${description}</p>
        <p style="margin:8px 0 0 0;color:#111827;font-size:20px;font-weight:800;">${amountFormatted}</p>
      </div>
    </div>

    <div style="padding:20px 24px 0 24px;">
      <a href="${checkoutUrl}" style="display:inline-block;background:#171311;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:10px;font-size:14px;font-weight:700;">Complete Payment</a>
    </div>

    <div style="padding:14px 24px 0 24px;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">This link expires in 24 hours.</p>
    </div>
  `;

  return renderShell("#171311", inner);
}

type SubscriptionLinkEmailProps = {
  planName: string;
  billingPeriodLabel: string;
  checkoutUrl: string;
  extraCharge?: { description: string; amountFormatted: string } | null;
};

export function subscriptionLinkEmailTemplate({ planName, billingPeriodLabel, checkoutUrl, extraCharge }: SubscriptionLinkEmailProps) {
  const extraChargeHtml = extraCharge
    ? `
      <div style="padding:16px 24px 0 24px;">
        <div style="border:1px solid #fde68a;border-radius:12px;padding:14px 16px;background:#fffbeb;">
          <p style="margin:0 0 8px 0;font-size:12px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">One-time charge included</p>
          <p style="margin:0;color:#111827;font-size:14px;">${extraCharge.description}</p>
          <p style="margin:8px 0 0 0;color:#111827;font-size:18px;font-weight:800;">${extraCharge.amountFormatted}</p>
          <p style="margin:8px 0 0 0;color:#92400e;font-size:12px;">Charged once, together with your first subscription payment.</p>
        </div>
      </div>
    `
    : "";

  const inner = `
    <div style="padding:8px 24px 0 24px;">
      <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;">Subscription invitation</p>
      <h2 style="margin:10px 0 0 0;font-size:24px;line-height:1.2;color:#111827;">Activate your GetBackplate subscription</h2>
      <p style="margin:10px 0 0 0;color:#4b5563;font-size:14px;line-height:1.6;">You've been invited to start your subscription. No account login is required to complete this step.</p>
    </div>

    <div style="padding:16px 24px 0 24px;">
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fafafa;">
        <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">Plan</p>
        <p style="margin:0;color:#111827;font-size:18px;font-weight:800;">${planName}</p>
        <p style="margin:6px 0 0 0;color:#374151;font-size:13px;">Billed ${billingPeriodLabel}</p>
      </div>
    </div>

    ${extraChargeHtml}

    <div style="padding:20px 24px 0 24px;">
      <a href="${checkoutUrl}" style="display:inline-block;background:#171311;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:10px;font-size:14px;font-weight:700;">Activate Subscription</a>
    </div>

    <div style="padding:14px 24px 0 24px;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">This link expires in 24 hours. Your subscription will renew automatically afterwards.</p>
    </div>
  `;

  return renderShell("#c74b1e", inner);
}

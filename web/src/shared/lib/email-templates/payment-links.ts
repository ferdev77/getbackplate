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
  organizationName: string;
  planKind: "platform" | "integration";
  planName: string;
  periodSuffix: "mo" | "yr";
  basePriceFormatted: string;
  includedConnectionsLabel?: string | null;
  extraConnections?: { count: number; totalFormatted: string } | null;
  extraCharge?: { description: string; amountFormatted: string } | null;
  setupFee: { included: boolean; amountFormatted?: string | null };
  checkoutUrl: string;
  usageBillingNote?: string | null;
};

function legalLinksFor(kind: "platform" | "integration") {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.getbackplate.com").replace(/\/$/, "");
  const terms = { label: "Terms of Service", url: `${base}/legal/${kind}/terms` };
  const privacy = { label: "Privacy Policy", url: `${base}/legal/${kind}/privacy` };
  if (kind === "platform") return [terms, privacy];
  return [terms, privacy, { label: "Master Services Agreement", url: `${base}/legal/integration/msa` }];
}

function joinWithAnd(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function subscriptionLinkEmailTemplate({
  organizationName,
  planKind,
  planName,
  periodSuffix,
  basePriceFormatted,
  includedConnectionsLabel,
  extraConnections,
  extraCharge,
  setupFee,
  checkoutUrl,
  usageBillingNote,
}: SubscriptionLinkEmailProps) {
  const legalLinks = legalLinksFor(planKind);
  const legalLinksHtml = joinWithAnd(
    legalLinks.map((l) => `<a href="${l.url}" style="color:#C24A1E;text-decoration:underline;">${l.label}</a>`),
  );
  const legalLabelsJoined = joinWithAnd(legalLinks.map((l) => l.label));

  const additionalConnectionsRow = extraConnections
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-bottom:1px solid #E5E7F0;">
        <tr>
          <td class="pricing-row" style="padding:14px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; color:#1a1a1a; vertical-align:top;">
            <strong style="font-weight:600;">Additional connections &times; ${extraConnections.count}</strong>
          </td>
          <td class="pricing-amount" align="right" style="padding:14px 0 14px 16px; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; font-weight:600; color:#1a1a1a; white-space:nowrap; vertical-align:top;">
            +${extraConnections.totalFormatted} / mo
          </td>
        </tr>
      </table>
    `
    : "";

  const extraChargeRow = extraCharge
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-bottom:1px solid #E5E7F0;">
        <tr>
          <td class="pricing-row" style="padding:14px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; color:#1a1a1a; vertical-align:top;">
            <strong style="font-weight:600;">${extraCharge.description}</strong>
          </td>
          <td class="pricing-amount" align="right" style="padding:14px 0 14px 16px; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; font-weight:600; color:#1a1a1a; white-space:nowrap; vertical-align:top;">
            ${extraCharge.amountFormatted}
          </td>
        </tr>
      </table>
    `
    : "";

  const setupFeeAmountCell = setupFee.included
    ? `<td class="pricing-amount" align="right" style="padding:14px 0 0 16px; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; font-weight:600; color:#067648; white-space:nowrap; vertical-align:top;">Included</td>`
    : `<td class="pricing-amount" align="right" style="padding:14px 0 0 16px; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; font-weight:600; color:#1a1a1a; white-space:nowrap; vertical-align:top;">${setupFee.amountFormatted ?? ""}</td>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <title>Activate your subscription</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style type="text/css">
    body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: #C24A1E; text-decoration: underline; }
    @media screen and (max-width: 640px) {
      .container { width: 100% !important; max-width: 100% !important; }
      .px-mobile { padding-left: 24px !important; padding-right: 24px !important; }
      .py-mobile { padding-top: 28px !important; padding-bottom: 28px !important; }
      .h1-mobile { font-size: 26px !important; line-height: 1.25 !important; }
      .pricing-row { display: block !important; width: 100% !important; }
      .pricing-amount { display: block !important; padding-top: 4px !important; padding-left: 0 !important; }
      .button-mobile a { display: block !important; padding: 18px 16px !important; }
    }
  </style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#FAFAFB; font-family:'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#FAFAFB;">
    Move to recurring ${periodSuffix === "yr" ? "annual" : "monthly"} billing for ${planName}.
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#FAFAFB;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" class="container" style="max-width:600px; width:100%;">

          <tr>
            <td align="left" style="padding:0 0 24px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:22px; font-weight:700; letter-spacing:-0.01em; color:#1a1a1a;">
                    <span style="color:#1a1a1a;">[Get</span><span style="color:#C24A1E;">Backplate</span><span style="color:#1a1a1a;">]</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:#ffffff; border-radius:14px; padding:48px 40px;" class="px-mobile py-mobile">
              <p style="margin:0 0 12px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:12px; font-weight:600; color:#C24A1E; text-transform:uppercase; letter-spacing:0.08em;">
                Subscription activation
              </p>
              <h1 class="h1-mobile" style="margin:0 0 16px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:32px; line-height:1.2; font-weight:700; letter-spacing:-0.02em; color:#1a1a1a;">
                Activate your ${periodSuffix === "yr" ? "annual" : "monthly"} subscription
              </h1>
              <p style="margin:0 0 14px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:16px; line-height:1.6; color:#1a1a1a;">
                Hi ${organizationName},
              </p>
              <p style="margin:0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:16px; line-height:1.6; color:#1a1a1a;">
                Time to move ${organizationName} to a recurring ${periodSuffix === "yr" ? "annual" : "monthly"} subscription for the <strong>${planName}</strong> plan. This locks in your pricing and automates billing going forward.
              </p>
            </td>
          </tr>

          <tr><td style="height:16px; line-height:16px; font-size:1px;">&nbsp;</td></tr>

          <tr>
            <td style="background-color:#ffffff; border-radius:14px; padding:40px;" class="px-mobile py-mobile">
              <p style="margin:0 0 8px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:12px; font-weight:600; color:#C24A1E; text-transform:uppercase; letter-spacing:0.08em;">
                Your subscription
              </p>
              <h2 style="margin:0 0 24px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:22px; line-height:1.3; font-weight:600; color:#1a1a1a; letter-spacing:-0.01em;">
                Subscription pricing
              </h2>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-bottom:1px solid #E5E7F0;">
                <tr>
                  <td class="pricing-row" style="padding:14px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; color:#1a1a1a; vertical-align:top;">
                    <strong style="font-weight:600;">${planName}</strong>${includedConnectionsLabel ? `<br><span style="color:#6b7280; font-size:14px;">${includedConnectionsLabel}</span>` : ""}
                  </td>
                  <td class="pricing-amount" align="right" style="padding:14px 0 14px 16px; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; font-weight:600; color:#1a1a1a; white-space:nowrap; vertical-align:top;">
                    ${basePriceFormatted} / ${periodSuffix}
                  </td>
                </tr>
              </table>

              ${additionalConnectionsRow}
              ${extraChargeRow}

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="pricing-row" style="padding:14px 0 0 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; color:#1a1a1a; vertical-align:top;">
                    <strong style="font-weight:600;">Setup &amp; onboarding</strong>
                  </td>
                  ${setupFeeAmountCell}
                </tr>
              </table>

              <p style="margin:24px 0 0 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:13px; color:#6b7280; line-height:1.5;">
                All prices in USD. Sales tax calculated automatically by Stripe. ${periodSuffix === "yr" ? "Billed annually, cancel anytime." : "Month-to-month, cancel anytime with 30 days notice."}
              </p>
              ${usageBillingNote ? `<p style="margin:10px 0 0 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:13px; color:#6b7280; line-height:1.5;">${usageBillingNote}</p>` : ""}
            </td>
          </tr>

          <tr><td style="height:16px; line-height:16px; font-size:1px;">&nbsp;</td></tr>

          <tr>
            <td style="background-color:#ffffff; border-radius:14px; padding:40px;" class="px-mobile py-mobile">
              <h2 style="margin:0 0 12px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:22px; line-height:1.3; font-weight:600; color:#1a1a1a; letter-spacing:-0.01em; text-align:center;">
                Activate recurring subscription
              </h2>
              <p style="margin:0 0 28px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; line-height:1.55; color:#6b7280; text-align:center;">
                Click below to review subscription details and confirm via Stripe&rsquo;s secure checkout.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" class="button-mobile">
                <tr>
                  <td align="center" bgcolor="#C24A1E" style="border-radius:8px; mso-padding-alt:18px 36px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${checkoutUrl}" style="height:54px;v-text-anchor:middle;width:280px;" arcsize="15%" stroke="f" fillcolor="#C24A1E">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Activate subscription</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${checkoutUrl}" target="_blank"
                       style="display:inline-block; padding:18px 36px; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:16px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px; background-color:#C24A1E; mso-hide:all;">
                      Activate subscription &rarr;
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:13px; line-height:1.6; color:#6b7280; text-align:center;">
                By activating, you'll be asked to review and accept our ${legalLinksHtml}.
              </p>
            </td>
          </tr>

          <tr><td style="height:16px; line-height:16px; font-size:1px;">&nbsp;</td></tr>

          <tr>
            <td style="background-color:#ffffff; border-radius:14px; padding:40px;" class="px-mobile py-mobile">
              <p style="margin:0 0 8px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:12px; font-weight:600; color:#C24A1E; text-transform:uppercase; letter-spacing:0.08em;">
                What happens next
              </p>
              <h2 style="margin:0 0 28px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:22px; line-height:1.3; font-weight:600; color:#1a1a1a; letter-spacing:-0.01em;">
                Four steps to recurring billing
              </h2>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:18px;">
                <tr>
                  <td width="40" valign="top" style="padding:0 16px 0 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr><td width="32" height="32" align="center" valign="middle" style="background-color:#FEF7F2; border-radius:50%; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:14px; font-weight:700; color:#C24A1E; line-height:32px;">1</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding:6px 0 16px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; line-height:1.55; color:#1a1a1a; border-bottom:1px solid #E5E7F0;">
                    <strong style="font-weight:600;">Review on Stripe Checkout.</strong>
                    <span style="color:#6b7280;"> Confirm your subscription pricing and tax calculation.</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:18px;">
                <tr>
                  <td width="40" valign="top" style="padding:0 16px 0 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr><td width="32" height="32" align="center" valign="middle" style="background-color:#FEF7F2; border-radius:50%; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:14px; font-weight:700; color:#C24A1E; line-height:32px;">2</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding:6px 0 16px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; line-height:1.55; color:#1a1a1a; border-bottom:1px solid #E5E7F0;">
                    <strong style="font-weight:600;">Enter payment method.</strong>
                    <span style="color:#6b7280;"> Card or ACH via Stripe&rsquo;s PCI-compliant form.</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:18px;">
                <tr>
                  <td width="40" valign="top" style="padding:0 16px 0 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr><td width="32" height="32" align="center" valign="middle" style="background-color:#FEF7F2; border-radius:50%; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:14px; font-weight:700; color:#C24A1E; line-height:32px;">3</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding:6px 0 16px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; line-height:1.55; color:#1a1a1a; border-bottom:1px solid #E5E7F0;">
                    <strong style="font-weight:600;">Accept the terms.</strong>
                    <span style="color:#6b7280;"> Single checkbox covers ${legalLinks.length === 3 ? "all three legal documents" : "both legal documents"} (${legalLabelsJoined}).</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td width="40" valign="top" style="padding:0 16px 0 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr><td width="32" height="32" align="center" valign="middle" style="background-color:#FEF7F2; border-radius:50%; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:14px; font-weight:700; color:#C24A1E; line-height:32px;">4</td></tr>
                    </table>
                  </td>
                  <td valign="top" style="padding:6px 0 0 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; line-height:1.55; color:#1a1a1a;">
                    <strong style="font-weight:600;">Subscription becomes recurring.</strong>
                    <span style="color:#6b7280;"> Automatic billing going forward.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="height:24px; line-height:24px; font-size:1px;">&nbsp;</td></tr>

          <tr>
            <td style="padding:0 40px;" class="px-mobile">
              <p style="margin:0 0 8px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; line-height:1.6; color:#1a1a1a;">
                Questions before you activate? Reply to this email or call <a href="tel:+19568029639" style="color:#C24A1E; text-decoration:none;">(956)&nbsp;802-9639</a>. You know where to find me.
              </p>
              <p style="margin:24px 0 0 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:15px; line-height:1.6; color:#1a1a1a;">
                &mdash; Angelo<br>
                <span style="color:#6b7280; font-size:14px;">Founder, GetBackplate</span>
              </p>
            </td>
          </tr>

          <tr><td style="height:48px; line-height:48px; font-size:1px;">&nbsp;</td></tr>

          <tr>
            <td style="padding:24px 40px; border-top:1px solid #E5E7F0;" class="px-mobile">
              <p style="margin:0 0 8px 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:12px; line-height:1.55; color:#9ca3af;">
                <strong style="color:#6b7280; font-weight:600;">Backplate Technologies LLC</strong>, d/b/a GetBackplate<br>
                1321 Upland Dr., Suite 9894 &middot; Houston, TX 77043 &middot; United States<br>
                <a href="mailto:angelo@getbackplate.com" style="color:#9ca3af; text-decoration:underline;">angelo@getbackplate.com</a> &middot; <a href="tel:+19568029639" style="color:#9ca3af; text-decoration:underline;">(956) 802-9639</a>
              </p>
              <p style="margin:16px 0 0 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:12px; line-height:1.6; color:#9ca3af;">
                ${legalLinks.map((l) => `<a href="${l.url}" style="color:#9ca3af; text-decoration:underline;">${l.label}</a>`).join(" &nbsp;&middot;&nbsp; ")}
              </p>
              <p style="margin:14px 0 0 0; font-family:'Plus Jakarta Sans', Arial, sans-serif; font-size:11px; line-height:1.5; color:#9ca3af;">
                You&rsquo;re receiving this email as the account owner of your GetBackplate subscription.
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

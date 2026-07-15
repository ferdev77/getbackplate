import type { TenantEmailBranding } from "@/shared/lib/email-branding";

/** Escapes HTML special characters to prevent layout breakage via user-controlled values. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type ReminderProps = {
  fullName: string;
  loginUrl: string;
  recoveryUrl: string;
  branding?: TenantEmailBranding;
};

type InitialInviteProps = {
  fullName: string;
  loginEmail: string;
  loginPassword?: string;
  loginUrl: string;
  organizationName?: string;
  branding?: TenantEmailBranding;
};

function renderEmailBrandingHeader(branding: TenantEmailBranding | undefined) {
  const safeCompany = escapeHtml(branding?.companyName || "GetBackplate");
  const defaultLogo = `${(process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://getbackplate.com").replace(/\/$/, "")}/getbackplate-logo-light.svg`;
  const safeLogo = branding?.logoUrl
    ? escapeHtml(branding.logoUrl)
    : (branding?.isCustom ? "" : defaultLogo);

  const brandBlock = safeLogo
    ? `<img src="${safeLogo}" alt="Logo ${safeCompany}" style="max-height:44px;width:auto;display:block;" />`
    : `<p style="margin:0;font-size:12px;font-weight:700;color:#374151;">${safeCompany}</p>`;

  return `
    <div style="margin:0 0 18px 0;padding:12px 14px;border:1px solid #e8e8e8;border-radius:10px;background:#fafafa;">
      ${brandBlock}
    </div>
  `;
}

export function initialInviteTemplate({ fullName, loginEmail, loginPassword, loginUrl, organizationName, branding }: InitialInviteProps) {
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(loginEmail);
  const safePassword = loginPassword ? escapeHtml(loginPassword) : null;
  const safeOrg = organizationName ? escapeHtml(organizationName) : null;
  const brandName = branding?.isCustom ? escapeHtml(branding.companyName) : "GetBackplate";
  const platformName = safeOrg ?? brandName;

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311; line-height: 1.6;">
      ${renderEmailBrandingHeader(branding)}
      <h2>Hello ${safeName},</h2>
      <p>You have been invited to access the <strong>${platformName}</strong> platform.</p>
      
      <p>Your account is ready. Below are your temporary login credentials. For your security, you will be asked to change your password the first time you sign in:</p>
      
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0;"><strong>Username / Email:</strong> ${safeEmail}</p>
        ${safePassword ? `<p style="margin: 0;"><strong>Temporary Password:</strong> ${safePassword}</p>` : `<p style="margin: 0;"><strong>Password:</strong> (You already have one set, or use password recovery if you forgot it)</p>`}
      </div>
      
      <div style="margin: 32px 0;">
        <a href="${loginUrl}" style="display: block; width: max-content; background-color: #171311; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-align: center;">
          Sign in with your credentials
        </a>
      </div>

      <p style="font-size: 14px; color: #555;">
        If you have trouble accessing your account, please contact your company administrator.
      </p>

      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      <p style="color: #888; font-size: 12px;">The ${brandName} team</p>
    </div>
  `;
}


export function resendReminderTemplate({ fullName, loginUrl, recoveryUrl, branding }: ReminderProps) {
  const safeName = escapeHtml(fullName);
  const brandName = branding?.isCustom ? escapeHtml(branding.companyName) : "GetBackplate";
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311; line-height: 1.6;">
      ${renderEmailBrandingHeader(branding)}
      <h2>Hello ${safeName},</h2>
      <p>This is a reminder that your access to the <strong>${brandName}</strong> platform is enabled.</p>
      
      <p>You can sign in to your account directly or, if you do not remember or have not set your password, easily reset it using the links below:</p>
      
      <div style="margin: 32px 0;">
        <a href="${loginUrl}" style="display: block; width: max-content; margin-bottom: 12px; background-color: #171311; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-align: center;">
          Sign in with your credentials
        </a>
        <a href="${recoveryUrl}" style="display: block; width: max-content; background-color: #e5e7eb; color: #171311; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-align: center;">
          I forgot my password
        </a>
      </div>

      <p style="font-size: 14px; color: #555;">
        If you have trouble accessing your account, please contact your company administrator.
      </p>

      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      <p style="color: #888; font-size: 12px;">The ${brandName} team</p>
    </div>
  `;
}

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
  const safeLogo = branding?.logoUrl ? escapeHtml(branding.logoUrl) : defaultLogo;

  return `
    <div style="margin:0 0 18px 0;padding:12px 14px;border:1px solid #e8e8e8;border-radius:10px;background:#fafafa;">
      <img src="${safeLogo}" alt="Logo ${safeCompany}" style="max-height:44px;width:auto;display:block;" />
    </div>
  `;
}

export function initialInviteTemplate({ fullName, loginEmail, loginPassword, loginUrl, organizationName, branding }: InitialInviteProps) {
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(loginEmail);
  const safePassword = loginPassword ? escapeHtml(loginPassword) : null;
  const safeOrg = organizationName ? escapeHtml(organizationName) : null;
  const orgText = safeOrg ? ` a <strong>${safeOrg}</strong>` : "";
  const brandName = branding?.isCustom ? escapeHtml(branding.companyName) : "GetBackplate";

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311; line-height: 1.6;">
      ${renderEmailBrandingHeader(branding)}
      <h2>Hola ${safeName},</h2>
      <p>Has sido invitado${orgText} en la plataforma <strong>${brandName}</strong>.</p>
      
      <p>Tu cuenta ya está lista. A continuación te detallamos tus credenciales de acceso temporal. Por tu seguridad, te solicitaremos que cambies la contraseña la primera vez que ingreses:</p>
      
      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 24px 0;">
        <p style="margin: 0 0 8px 0;"><strong>Usuario / Email:</strong> ${safeEmail}</p>
        ${safePassword ? `<p style="margin: 0;"><strong>Contraseña Temporal:</strong> ${safePassword}</p>` : `<p style="margin: 0;"><strong>Contraseña:</strong> (Ya la tienes configurada o usa la recuperación si la olvidaste)</p>`}
      </div>
      
      <div style="margin: 32px 0;">
        <a href="${loginUrl}" style="display: block; width: max-content; background-color: #171311; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-align: center;">
          Ingresá con tus credenciales
        </a>
      </div>

      <p style="font-size: 14px; color: #555;">
        Si tienes problemas para acceder, por favor contacta al administrador de tu empresa.
      </p>

      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      <p style="color: #888; font-size: 12px;">El equipo de ${brandName}</p>
    </div>
  `;
}


export function resendReminderTemplate({ fullName, loginUrl, recoveryUrl, branding }: ReminderProps) {
  const safeName = escapeHtml(fullName);
  const brandName = branding?.isCustom ? escapeHtml(branding.companyName) : "GetBackplate";
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #171311; line-height: 1.6;">
      ${renderEmailBrandingHeader(branding)}
      <h2>Hola ${safeName},</h2>
      <p>Este es un mensaje recordatorio de que tu acceso a la plataforma <strong>${brandName}</strong> ya está habilitado.</p>
      
      <p>Puedes ingresar directamente a tu cuenta o, si no recuerdas tu clave o no la configuraste, puedes restablecerla fácilmente mediante los siguientes accesos directos:</p>
      
      <div style="margin: 32px 0;">
        <a href="${loginUrl}" style="display: block; width: max-content; margin-bottom: 12px; background-color: #171311; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-align: center;">
          Ingresá con tus credenciales
        </a>
        <a href="${recoveryUrl}" style="display: block; width: max-content; background-color: #e5e7eb; color: #171311; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-align: center;">
          Olvidé mi contraseña
        </a>
      </div>

      <p style="font-size: 14px; color: #555;">
        Si tienes problemas para acceder, por favor contacta al administrador de tu empresa.
      </p>

      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      <p style="color: #888; font-size: 12px;">El equipo de ${brandName}</p>
    </div>
  `;
}

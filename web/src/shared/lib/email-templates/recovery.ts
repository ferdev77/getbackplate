import type { TenantEmailBranding } from "@/shared/lib/email-branding";

type PasswordRecoveryTemplateProps = {
  recoveryUrl: string;
  branding: TenantEmailBranding;
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function brandingHeader(branding: TenantEmailBranding) {
  const company = escapeHtml(branding.companyName || "GetBackplate");
  const logo = branding.logoUrl ? escapeHtml(branding.logoUrl) : "";

  if (logo) {
    return `<div style="margin:0 0 14px 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;display:inline-block;"><img src="${logo}" alt="${company}" style="max-height:42px;width:auto;display:block;" /></div>`;
  }

  return `<p style="margin:0 0 12px 0;font-size:12px;font-weight:700;color:#111827;">${company}</p>`;
}

export function passwordRecoveryTemplate({ recoveryUrl, branding }: PasswordRecoveryTemplateProps) {
  const brandName = escapeHtml(branding.companyName || "GetBackplate");

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;background:#f5f6f8;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:24px;">
        ${brandingHeader(branding)}
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:24px;line-height:1.2;">Restablecer contrasena</h2>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.6;">Recibimos una solicitud para cambiar la contrasena de tu acceso en <strong>${brandName}</strong>.</p>
        <p style="margin:10px 0 0 0;color:#4b5563;font-size:14px;line-height:1.6;">Haz clic en el boton para continuar. Este enlace expira automaticamente por seguridad.</p>

        <div style="margin:24px 0;">
          <a href="${recoveryUrl}" style="display:inline-block;background:#171311;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;font-size:14px;">Restablecer contrasena</a>
        </div>

        <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">Si no solicitaste este cambio, puedes ignorar este correo.</p>
      </div>
    </div>
  `;
}

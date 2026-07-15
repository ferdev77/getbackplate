import type { TenantEmailBranding } from "@/shared/lib/email-branding";

type MfaCodeTemplateProps = {
  code: string;
  ttlMinutes: number;
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

export function mfaCodeTemplate({ code, ttlMinutes, branding }: MfaCodeTemplateProps) {
  const brandName = escapeHtml(branding.companyName || "GetBackplate");
  const safeCode = escapeHtml(code);

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;background:#f5f6f8;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:24px;">
        ${brandingHeader(branding)}
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:24px;line-height:1.2;">Your verification code</h2>
        <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.6;">Someone is trying to sign in to your <strong>${brandName}</strong> account. Use this code to complete your sign-in:</p>

        <div style="margin:24px 0;text-align:center;">
          <span style="display:inline-block;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 28px;font-size:32px;font-weight:800;letter-spacing:8px;color:#171311;">${safeCode}</span>
        </div>

        <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">This code expires in ${ttlMinutes} minutes. If you did not try to sign in, ignore this email and consider changing your password.</p>
      </div>
    </div>
  `;
}

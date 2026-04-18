"use client";

import { Settings2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type CompanyContactSettingsCardProps = {
  organizationName: string;
  supportEmail: string;
  supportPhone: string;
  feedbackWhatsapp: string;
  websiteUrl: string;
  companyLogoUrl: string;
  companyLogoDarkUrl: string;
  companyFaviconUrl: string;
  customBrandingEnabled: boolean;
};

export function CompanyContactSettingsCard({
  organizationName,
  supportEmail,
  supportPhone,
  feedbackWhatsapp,
  websiteUrl,
  companyLogoUrl,
  companyLogoDarkUrl,
  companyFaviconUrl,
  customBrandingEnabled,
}: CompanyContactSettingsCardProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPulse, setSavedPulse] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [emailValue, setEmailValue] = useState(supportEmail);
  const [phoneValue, setPhoneValue] = useState(supportPhone);
  const [whatsappValue, setWhatsappValue] = useState(feedbackWhatsapp);
  const [websiteValue, setWebsiteValue] = useState(websiteUrl);
  const [lightLogoUrl, setLightLogoUrl] = useState(companyLogoUrl);
  const [darkLogoUrl, setDarkLogoUrl] = useState(companyLogoDarkUrl);
  const [faviconUrl, setFaviconUrl] = useState(companyFaviconUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  async function handleSave() {
    if (!isEditing || isSaving) return;

    setNotice(null);
    setIsSaving(true);

    const response = await fetch("/api/company/settings/company-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supportEmail: emailValue,
        supportPhone: phoneValue,
        feedbackWhatsapp: whatsappValue,
        websiteUrl: websiteValue,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setIsSaving(false);

    if (!response.ok || !payload?.ok) {
      setNotice({ tone: "error", message: payload?.error ?? "No se pudieron guardar los datos" });
      return;
    }

    setSavedPulse(true);
    setNotice({ tone: "success", message: "Datos guardados con exito" });
    setIsEditing(false);
    setTimeout(() => setSavedPulse(false), 1400);
  }

  const buttonLabel = isSaving ? "Guardando..." : savedPulse ? "Datos guardados" : isEditing ? "Guardar" : "Editar";

  async function handleLogoUpload(file: File | null, variant: "light" | "dark" | "favicon") {
    if (!file || uploadingLogo) return;

    setUploadingLogo(true);
    setNotice(null);

    const formData = new FormData();
    formData.set("logo", file);
    formData.set("variant", variant);

    const response = await fetch("/api/company/settings/company-logo", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; logoUrl?: string } | null;
    setUploadingLogo(false);

    if (!response.ok || !payload?.ok || !payload.logoUrl) {
      setNotice({ tone: "error", message: payload?.error ?? "No se pudo cargar la imagen" });
      return;
    }

    if (variant === "dark") {
      setDarkLogoUrl(payload.logoUrl);
      setNotice({ tone: "success", message: "Logo dark actualizado correctamente" });
    } else if (variant === "favicon") {
      setFaviconUrl(payload.logoUrl);
      setNotice({ tone: "success", message: "Favicon actualizado correctamente" });
    } else {
      setLightLogoUrl(payload.logoUrl);
      setNotice({ tone: "success", message: "Logo claro actualizado correctamente" });
    }
    router.refresh();
  }

  return (
    <article className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5">
      <p className="mb-3 inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[var(--gbp-text2)] uppercase">
        <Settings2 className="h-3.5 w-3.5" /> Datos de la empresa
      </p>
      <p className="mb-1 text-base font-semibold text-[var(--gbp-text)]">{organizationName}</p>
      <p className="text-sm text-[var(--gbp-text2)]">Canales de contacto visibles para la operación diaria.</p>

      {customBrandingEnabled ? (
        <div className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Branding personalizado</p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3">
              <p className="mb-2 text-[11px] font-semibold text-[var(--gbp-text2)]">Logo claro</p>
              <div className="mb-2 grid min-h-[92px] w-full place-items-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] p-2">
                {lightLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lightLogoUrl} alt="Logo claro de empresa" className="block h-auto max-h-[76px] w-auto max-w-full object-contain" />
                ) : (
                  <span className="text-[10px] font-bold text-[var(--gbp-muted)]">Sin logo</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleLogoUpload(file, "light");
                    event.currentTarget.value = "";
                  }}
                  disabled={uploadingLogo}
                />
                {uploadingLogo ? "Subiendo..." : "Cargar logo claro"}
              </label>
            </div>
            <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg2)] p-3">
              <p className="mb-2 text-[11px] font-semibold text-[var(--gbp-text)]">Logo dark</p>
              <div className="mb-2 grid min-h-[92px] w-full place-items-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] p-2">
                {darkLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={darkLogoUrl} alt="Logo dark de empresa" className="block h-auto max-h-[76px] w-auto max-w-full object-contain" />
                ) : (
                  <span className="text-[10px] font-bold text-[var(--gbp-muted)]">Sin logo dark</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text)] hover:bg-[var(--gbp-surface2)]">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleLogoUpload(file, "dark");
                    event.currentTarget.value = "";
                  }}
                  disabled={uploadingLogo}
                />
                {uploadingLogo ? "Subiendo..." : "Cargar logo dark"}
              </label>
            </div>
            <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3">
              <p className="mb-2 text-[11px] font-semibold text-[var(--gbp-text2)]">Favicon (32x32)</p>
              <div className="mb-2 grid min-h-[92px] w-full place-items-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] p-2">
                {faviconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={faviconUrl} alt="Favicon de empresa" className="block h-8 w-8 object-contain" />
                ) : (
                  <span className="text-[10px] font-bold text-[var(--gbp-muted)]">Sin favicon</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]">
                <input
                  type="file"
                  accept="image/png, image/x-icon, image/svg+xml"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleLogoUpload(file, "favicon");
                    event.currentTarget.value = "";
                  }}
                  disabled={uploadingLogo}
                />
                {uploadingLogo ? "Subiendo..." : "Cargar favicon"}
              </label>
            </div>
            <p className="text-[11px] text-[var(--gbp-text2)] md:col-span-3">PNG/JPG/WebP/GIF/SVG · Max 5MB</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3 text-xs text-[var(--gbp-text2)]">
          El módulo <strong>Custom Branding</strong> está desactivado para esta empresa. Un superadmin puede activarlo desde el panel de módulos.
        </div>
      )}

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <label className="grid gap-1 text-xs font-semibold text-[var(--gbp-text2)]">
          Email
          <input
            name="support_email"
            type="email"
            value={emailValue}
            onChange={(event) => setEmailValue(event.target.value)}
            placeholder="empresa@dominio.com"
            disabled={!isEditing || isSaving}
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] disabled:cursor-not-allowed disabled:bg-[var(--gbp-bg)] disabled:text-[var(--gbp-muted)]"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[var(--gbp-text2)]">
          Teléfono
          <input
            name="support_phone"
            value={phoneValue}
            onChange={(event) => setPhoneValue(event.target.value)}
            placeholder="+54 11 ..."
            disabled={!isEditing || isSaving}
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] disabled:cursor-not-allowed disabled:bg-[var(--gbp-bg)] disabled:text-[var(--gbp-muted)]"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[var(--gbp-text2)]">
          WhatsApp
          <input
            name="feedback_whatsapp"
            value={whatsappValue}
            onChange={(event) => setWhatsappValue(event.target.value)}
            placeholder="+54 9 11 ..."
            disabled={!isEditing || isSaving}
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] disabled:cursor-not-allowed disabled:bg-[var(--gbp-bg)] disabled:text-[var(--gbp-muted)]"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[var(--gbp-text2)]">
          URL
          <input
            name="website_url"
            value={websiteValue}
            onChange={(event) => setWebsiteValue(event.target.value)}
            placeholder="https://tuempresa.com"
            disabled={!isEditing || isSaving}
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] disabled:cursor-not-allowed disabled:bg-[var(--gbp-bg)] disabled:text-[var(--gbp-muted)]"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            if (isEditing) {
              void handleSave();
              return;
            }
            setNotice(null);
            setSavedPulse(false);
            setIsEditing(true);
          }}
          disabled={isSaving}
          className="rounded-lg bg-[var(--gbp-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--gbp-accent-hover)] disabled:cursor-not-allowed disabled:opacity-80 sm:col-span-2 sm:w-fit"
        >
          {buttonLabel}
        </button>
        {notice ? (
          <p
            className={`sm:col-span-2 text-xs font-semibold ${
              notice.tone === "success" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {notice.message}
          </p>
        ) : null}
      </form>
    </article>
  );
}

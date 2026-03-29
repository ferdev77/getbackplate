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

  async function handleLogoUpload(file: File | null, variant: "light" | "dark") {
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
      setNotice({ tone: "error", message: payload?.error ?? "No se pudo cargar el logo" });
      return;
    }

    if (variant === "dark") {
      setDarkLogoUrl(payload.logoUrl);
      setNotice({ tone: "success", message: "Logo dark actualizado correctamente" });
    } else {
      setLightLogoUrl(payload.logoUrl);
      setNotice({ tone: "success", message: "Logo claro actualizado correctamente" });
    }
    router.refresh();
  }

  return (
    <article className="rounded-2xl border border-[#e7dfda] bg-white p-5 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]">
      <p className="mb-3 inline-flex items-center gap-1 text-xs font-semibold tracking-[0.1em] text-[#8d847f] uppercase [.theme-dark-pro_&]:text-[#9aabc3]">
        <Settings2 className="h-3.5 w-3.5" /> Datos de la empresa
      </p>
      <p className="mb-1 text-base font-semibold text-[#2a2420] [.theme-dark-pro_&]:text-[#e7edf7]">{organizationName}</p>
      <p className="text-sm text-[#7b726d] [.theme-dark-pro_&]:text-[#9aabc3]">Canales de contacto visibles para la operacion diaria.</p>

      {customBrandingEnabled ? (
        <div className="mt-4 rounded-xl border border-[#e7dfda] bg-[#fcfaf8] p-3 [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#111824]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#8d847f] [.theme-dark-pro_&]:text-[#9aabc3]">Branding personalizado</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-[#e7dfda] bg-white p-3 [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723]">
              <p className="mb-2 text-[11px] font-semibold text-[#5b5652] [.theme-dark-pro_&]:text-[#c8d3e5]">Logo claro</p>
              <div className="mb-2 grid h-14 w-full place-items-center overflow-hidden rounded-md border border-[#ddd3ce] bg-white [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0b111a]">
                {lightLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lightLogoUrl} alt="Logo claro de empresa" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] font-bold text-[#9a9a9a]">Sin logo</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#ddd3ce] bg-white px-3 py-2 text-xs font-semibold text-[#444] hover:bg-[#f7f3f1] [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#dde7f5] [.theme-dark-pro_&]:hover:bg-[#172131]">
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
            <div className="rounded-lg border border-[#e7dfda] bg-[#0e1724] p-3 [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#08101b]">
              <p className="mb-2 text-[11px] font-semibold text-[#d4deea]">Logo dark</p>
              <div className="mb-2 grid h-14 w-full place-items-center overflow-hidden rounded-md border border-[#334155] bg-[#02070f]">
                {darkLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={darkLogoUrl} alt="Logo dark de empresa" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] font-bold text-[#8ea0b8]">Sin logo dark</span>
                )}
              </div>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#334155] bg-[#0f1723] px-3 py-2 text-xs font-semibold text-[#dde7f5] hover:bg-[#172131]">
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
            <p className="text-[11px] text-[#7b726d] [.theme-dark-pro_&]:text-[#9aabc3] md:col-span-2">PNG/JPG/WebP/GIF/SVG · Max 2MB</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[#ece4df] bg-[#faf7f5] p-3 text-xs text-[#7b726d] [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#111824] [.theme-dark-pro_&]:text-[#9aabc3]">
          El modulo <strong>Custom Branding</strong> esta desactivado para esta empresa. Un superadmin puede activarlo desde el panel de modulos.
        </div>
      )}

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <label className="grid gap-1 text-xs font-semibold text-[#7b726d] [.theme-dark-pro_&]:text-[#9aabc3]">
          Email
          <input
            name="support_email"
            type="email"
            value={emailValue}
            onChange={(event) => setEmailValue(event.target.value)}
            placeholder="empresa@dominio.com"
            disabled={!isEditing || isSaving}
            className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-[#f8f4f2] disabled:text-[#7f7772] [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#dde7f5] [.theme-dark-pro_&]:placeholder:text-[#7f8ea3] [.theme-dark-pro_&]:disabled:bg-[#0b111a] [.theme-dark-pro_&]:disabled:text-[#91a3bc]"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[#7b726d] [.theme-dark-pro_&]:text-[#9aabc3]">
          Telefono
          <input
            name="support_phone"
            value={phoneValue}
            onChange={(event) => setPhoneValue(event.target.value)}
            placeholder="+54 11 ..."
            disabled={!isEditing || isSaving}
            className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-[#f8f4f2] disabled:text-[#7f7772] [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#dde7f5] [.theme-dark-pro_&]:placeholder:text-[#7f8ea3] [.theme-dark-pro_&]:disabled:bg-[#0b111a] [.theme-dark-pro_&]:disabled:text-[#91a3bc]"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[#7b726d] [.theme-dark-pro_&]:text-[#9aabc3]">
          WhatsApp
          <input
            name="feedback_whatsapp"
            value={whatsappValue}
            onChange={(event) => setWhatsappValue(event.target.value)}
            placeholder="+54 9 11 ..."
            disabled={!isEditing || isSaving}
            className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-[#f8f4f2] disabled:text-[#7f7772] [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#dde7f5] [.theme-dark-pro_&]:placeholder:text-[#7f8ea3] [.theme-dark-pro_&]:disabled:bg-[#0b111a] [.theme-dark-pro_&]:disabled:text-[#91a3bc]"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-[#7b726d] [.theme-dark-pro_&]:text-[#9aabc3]">
          URL
          <input
            name="website_url"
            value={websiteValue}
            onChange={(event) => setWebsiteValue(event.target.value)}
            placeholder="https://tuempresa.com"
            disabled={!isEditing || isSaving}
            className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-[#f8f4f2] disabled:text-[#7f7772] [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#dde7f5] [.theme-dark-pro_&]:placeholder:text-[#7f8ea3] [.theme-dark-pro_&]:disabled:bg-[#0b111a] [.theme-dark-pro_&]:disabled:text-[#91a3bc]"
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
          className="rounded-lg bg-[#111111] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2a2521] disabled:cursor-not-allowed disabled:opacity-80 sm:col-span-2 sm:w-fit [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]"
        >
          {buttonLabel}
        </button>
        {notice ? (
          <p
            className={`sm:col-span-2 text-xs font-semibold ${
              notice.tone === "success" ? "text-emerald-700 [.theme-dark-pro_&]:text-emerald-300" : "text-rose-700 [.theme-dark-pro_&]:text-rose-300"
            }`}
          >
            {notice.message}
          </p>
        ) : null}
      </form>
    </article>
  );
}

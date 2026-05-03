export const DARK_PANEL = "[.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[var(--gbp-border)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)]";
export const DARK_TEXT = "[.theme-dark-pro_&]:text-[var(--gbp-text)]";
export const DARK_MUTED = "[.theme-dark-pro_&]:text-[var(--gbp-text2)]";
export const DARK_GHOST = "[.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)] [.theme-dark-pro_&]:text-[var(--gbp-text2)] [.theme-dark-pro_&]:hover:bg-[var(--gbp-surface2)]";
export const FIELD_LABEL = "text-xs font-bold text-[var(--gbp-text2)]";
export const FIELD_INPUT = "w-full rounded-xl border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-4 py-3 text-sm text-[var(--gbp-text)] outline-none transition-all focus:border-[var(--gbp-accent)]";

export const APPROVAL_COMMENT_TEMPLATES = [
  "Documento validado y legible.",
  "Aprobado. Cumple con los requisitos solicitados.",
  "Datos verificados correctamente.",
];

export const REJECTION_COMMENT_TEMPLATES = [
  "La imagen no es legible. Subir nuevamente con mejor calidad.",
  "Documento vencido. Cargar una versión vigente.",
  "Datos incompletos o no coinciden con el perfil.",
];

export function formatDateForUi(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function getReminderSendDate(
  expiresAt: string | null | undefined,
  reminderDays: 15 | 30 | 45 | null | undefined,
): string | null {
  if (!expiresAt || !reminderDays) return null;
  const parsed = new Date(`${expiresAt}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() - reminderDays);
  return parsed.toISOString().slice(0, 10);
}

export function isDateExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const parsed = new Date(`${expiresAt}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return parsed.getTime() < todayUtc;
}

export function formatDateTimeForUi(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export async function postFormDataWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.max(1, Math.min(98, Math.round((event.loaded / event.total) * 100)));
      onProgress(percent);
    };

    xhr.onerror = () => reject(new Error("No se pudo subir el archivo"));
    xhr.onload = () => {
      const payload =
        xhr.response && typeof xhr.response === "object" ? (xhr.response as Record<string, unknown>) : {};
      resolve({ status: xhr.status, data: payload });
    };

    xhr.send(formData);
  });
}

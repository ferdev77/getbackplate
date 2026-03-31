function normalizeAppBaseUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString().replace(/\/$/, "");
}

export function getCanonicalAppUrl(): string {
  const publicUrl = normalizeAppBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (publicUrl) {
    return publicUrl;
  }

  const baseUrl = normalizeAppBaseUrl(process.env.APP_BASE_URL);
  if (baseUrl) {
    return baseUrl;
  }

  throw new Error(
    "Missing valid app base URL. Configure NEXT_PUBLIC_APP_URL or APP_BASE_URL with an absolute http(s) URL.",
  );
}

export function resolveCanonicalAppUrl(appUrl?: string | null): string {
  const resolved = normalizeAppBaseUrl(appUrl);
  if (resolved) {
    return resolved;
  }

  return getCanonicalAppUrl();
}

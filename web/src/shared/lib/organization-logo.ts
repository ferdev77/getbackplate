import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export const ORGANIZATION_LOGO_BUCKET = "organization-branding";
export const MAX_ORGANIZATION_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

export function validateOrganizationLogoFile(file: File | null) {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Selecciona una imagen para el logo" };
  }

  if (!file.type.startsWith("image/")) {
    return { ok: false as const, error: "El logo debe ser una imagen" };
  }

  if (file.size > MAX_ORGANIZATION_LOGO_SIZE_BYTES) {
    return { ok: false as const, error: "El logo supera el limite de 2MB" };
  }

  return { ok: true as const };
}

export function sanitizeOrganizationLogoFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function ensureOrganizationLogoBucketExists() {
  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(ORGANIZATION_LOGO_BUCKET);
  if (bucket) return;

  await admin.storage.createBucket(ORGANIZATION_LOGO_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_ORGANIZATION_LOGO_SIZE_BYTES}`,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"],
  });
}

export async function uploadOrganizationLogo(params: {
  organizationId: string;
  file: File;
  previousLogoPath?: string | null;
  variant?: "light" | "dark" | "favicon";
}) {
  const admin = createSupabaseAdminClient();
  const safeName = sanitizeOrganizationLogoFileName(params.file.name || "logo.png") || "logo.png";
  const variantFolder = params.variant === "dark" ? "dark" : params.variant === "favicon" ? "favicon" : "light";
  const path = `organizations/${params.organizationId}/${variantFolder}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await admin.storage.from(ORGANIZATION_LOGO_BUCKET).upload(path, params.file, {
    contentType: params.file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    return { ok: false as const, error: uploadError.message };
  }

  const { data: publicData } = admin.storage.from(ORGANIZATION_LOGO_BUCKET).getPublicUrl(path);
  const logoUrl = `${publicData.publicUrl}?v=${Date.now()}`;

  if (params.previousLogoPath) {
    await admin.storage.from(ORGANIZATION_LOGO_BUCKET).remove([params.previousLogoPath]);
  }

  return {
    ok: true as const,
    logoUrl,
    logoPath: path,
  };
}

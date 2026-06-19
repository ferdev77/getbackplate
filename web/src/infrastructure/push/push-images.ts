import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export const PUSH_IMAGES_BUCKET = "push-images";
export const MAX_PUSH_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

export async function ensurePushImagesBucketExists() {
  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(PUSH_IMAGES_BUCKET);
  const config = {
    public: true,
    fileSizeLimit: `${MAX_PUSH_IMAGE_SIZE_BYTES}`,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  };
  if (!bucket) {
    await admin.storage.createBucket(PUSH_IMAGES_BUCKET, config);
    return;
  }
  await admin.storage.updateBucket(PUSH_IMAGES_BUCKET, config);
}

export async function uploadPushImage(file: File): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "El archivo debe ser una imagen" };
  }
  if (file.size > MAX_PUSH_IMAGE_SIZE_BYTES) {
    return { ok: false, error: "La imagen supera el límite de 2MB" };
  }

  const admin = createSupabaseAdminClient();
  await ensurePushImagesBucketExists();

  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "image.jpg";
  const path = `superadmin/${Date.now()}-${safeName}`;

  const { error } = await admin.storage.from(PUSH_IMAGES_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) return { ok: false, error: error.message };

  const { data } = admin.storage.from(PUSH_IMAGES_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path };
}

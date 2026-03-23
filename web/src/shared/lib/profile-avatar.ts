import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export const AVATAR_BUCKET = "profile-avatars";
export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

export function sanitizeAvatarFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function validateAvatarFile(file: File | null) {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Selecciona una imagen" };
  }

  if (!file.type.startsWith("image/")) {
    return { ok: false as const, error: "El archivo debe ser una imagen" };
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return { ok: false as const, error: "La imagen supera el limite de 2MB" };
  }

  return { ok: true as const };
}

export async function ensureAvatarBucketExists() {
  const supabase = createSupabaseAdminClient();
  const { data: bucket } = await supabase.storage.getBucket(AVATAR_BUCKET);
  if (bucket) return;

  await supabase.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_AVATAR_SIZE_BYTES}`,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
}

export async function uploadAvatarAndUpdateUserMetadata(params: {
  userId: string;
  file: File;
  userMetadata: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const safeName = sanitizeAvatarFileName(params.file.name || "avatar.png") || "avatar.png";
  const path = `avatars/${params.userId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(path, params.file, {
    contentType: params.file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    return { ok: false as const, error: uploadError.message };
  }

  const previousAvatarPath =
    typeof params.userMetadata.avatar_path === "string" ? params.userMetadata.avatar_path : null;

  const { data: publicData } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;

  const { error: updateUserError } = await admin.auth.admin.updateUserById(params.userId, {
    user_metadata: {
      ...params.userMetadata,
      avatar_url: avatarUrl,
      avatar_path: path,
    },
  });

  if (updateUserError) {
    await admin.storage.from(AVATAR_BUCKET).remove([path]);
    return { ok: false as const, error: updateUserError.message };
  }

  if (previousAvatarPath) {
    await admin.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);
  }

  return {
    ok: true as const,
    avatarUrl,
    avatarPath: path,
  };
}

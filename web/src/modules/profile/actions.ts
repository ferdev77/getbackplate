"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireAuthenticatedUser } from "@/shared/lib/access";

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

function qs(message: string) {
  return encodeURIComponent(message);
}

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function ensureAvatarBucketExists() {
  const supabase = createSupabaseAdminClient();
  const { data: bucket } = await supabase.storage.getBucket(AVATAR_BUCKET);

  if (bucket) return;

  await supabase.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_AVATAR_SIZE_BYTES}`,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
}

export async function uploadProfileAvatarAction(formData: FormData) {
  await requireAuthenticatedUser();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/app/settings?status=error&message=" + qs("Selecciona una imagen"));
  }

  if (!file.type.startsWith("image/")) {
    redirect("/app/settings?status=error&message=" + qs("El archivo debe ser una imagen"));
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    redirect(
      "/app/settings?status=error&message=" +
        qs("La imagen supera el limite de 2MB"),
    );
  }

  await ensureAvatarBucketExists();

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    redirect("/auth/login");
  }

  const safeName = sanitizeFileName(file.name || "avatar.png") || "avatar.png";
  const path = `avatars/${user.id}/${Date.now()}-${safeName}`;

  const admin = createSupabaseAdminClient();

  const { error: uploadError } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    redirect(
      "/app/settings?status=error&message=" +
        qs(`No se pudo subir avatar: ${uploadError.message}`),
    );
  }

  const previousMetadata =
    typeof user.user_metadata === "object" && user.user_metadata
      ? user.user_metadata
      : {};
  const previousAvatarPath =
    typeof previousMetadata.avatar_path === "string"
      ? previousMetadata.avatar_path
      : null;

  const { data: publicData } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const nextMetadata = {
    ...previousMetadata,
    avatar_url: `${publicData.publicUrl}?v=${Date.now()}`,
    avatar_path: path,
  };

  const { error: updateUserError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  });

  if (updateUserError) {
    await admin.storage.from(AVATAR_BUCKET).remove([path]);
    redirect(
      "/app/settings?status=error&message=" +
        qs(`No se pudo actualizar perfil: ${updateUserError.message}`),
    );
  }

  if (previousAvatarPath) {
    await admin.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/dashboard");
  redirect("/app/settings?status=success&message=" + qs("Avatar actualizado"));
}

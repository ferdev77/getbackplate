"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireAuthenticatedUser } from "@/shared/lib/access";
import {
  ensureAvatarBucketExists,
  uploadAvatarAndUpdateUserMetadata,
  validateAvatarFile,
} from "@/shared/lib/profile-avatar";

function qs(message: string) {
  return encodeURIComponent(message);
}

export async function uploadProfileAvatarAction(formData: FormData) {
  await requireAuthenticatedUser();

  const file = formData.get("avatar");
  const validation = validateAvatarFile(file instanceof File ? file : null);
  if (!validation.ok) {
    redirect("/app/settings?status=error&message=" + qs(validation.error));
  }

  const avatarFile = file as File;

  await ensureAvatarBucketExists();

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    redirect("/auth/login");
  }

  const previousMetadata =
    typeof user.user_metadata === "object" && user.user_metadata
      ? user.user_metadata
      : {};

  const uploadResult = await uploadAvatarAndUpdateUserMetadata({
    userId: user.id,
    file: avatarFile,
    userMetadata: previousMetadata as Record<string, unknown>,
  });

  if (!uploadResult.ok) {
    redirect(
      "/app/settings?status=error&message=" +
        qs(`No se pudo subir avatar: ${uploadResult.error}`),
    );
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/dashboard");
  redirect("/app/settings?status=success&message=" + qs("Avatar actualizado"));
}

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { logAuditEvent } from "@/shared/lib/audit";

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

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

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    await logAuditEvent({
      action: "profile.avatar.update",
      entityType: "profile",
      entityId: user.id,
      eventDomain: "settings",
      outcome: "error",
      severity: "low",
      metadata: { actor_user_id: user.id, error: "Selecciona una imagen" },
    });
    return NextResponse.json({ error: "Selecciona una imagen" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    await logAuditEvent({
      action: "profile.avatar.update",
      entityType: "profile",
      entityId: user.id,
      eventDomain: "settings",
      outcome: "error",
      severity: "low",
      metadata: { actor_user_id: user.id, error: "El archivo debe ser una imagen" },
    });
    return NextResponse.json({ error: "El archivo debe ser una imagen" }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    await logAuditEvent({
      action: "profile.avatar.update",
      entityType: "profile",
      entityId: user.id,
      eventDomain: "settings",
      outcome: "error",
      severity: "low",
      metadata: { actor_user_id: user.id, error: "La imagen supera el limite de 2MB", size: file.size },
    });
    return NextResponse.json({ error: "La imagen supera el limite de 2MB" }, { status: 400 });
  }

  await ensureAvatarBucketExists();

  const admin = createSupabaseAdminClient();
  const safeName = sanitizeFileName(file.name || "avatar.png") || "avatar.png";
  const path = `avatars/${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    await logAuditEvent({
      action: "profile.avatar.update",
      entityType: "profile",
      entityId: user.id,
      eventDomain: "settings",
      outcome: "error",
      severity: "medium",
      metadata: { actor_user_id: user.id, error: uploadError.message },
    });
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const previousMetadata =
    typeof user.user_metadata === "object" && user.user_metadata ? user.user_metadata : {};
  const previousAvatarPath =
    typeof previousMetadata.avatar_path === "string" ? previousMetadata.avatar_path : null;

  const { data: publicData } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;

  const { error: updateUserError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...previousMetadata,
      avatar_url: avatarUrl,
      avatar_path: path,
    },
  });

  if (updateUserError) {
    await admin.storage.from(AVATAR_BUCKET).remove([path]);
    await logAuditEvent({
      action: "profile.avatar.update",
      entityType: "profile",
      entityId: user.id,
      eventDomain: "settings",
      outcome: "error",
      severity: "medium",
      metadata: { actor_user_id: user.id, error: updateUserError.message },
    });
    return NextResponse.json({ error: updateUserError.message }, { status: 400 });
  }

  if (previousAvatarPath) {
    await admin.storage.from(AVATAR_BUCKET).remove([previousAvatarPath]);
  }

  await logAuditEvent({
    action: "profile.avatar.update",
    entityType: "profile",
    entityId: user.id,
    eventDomain: "settings",
    outcome: "success",
    severity: "low",
    metadata: { actor_user_id: user.id, avatar_path: path },
  });

  return NextResponse.json({ ok: true, avatarUrl });
}

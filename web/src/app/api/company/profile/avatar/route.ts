import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  ensureAvatarBucketExists,
  uploadAvatarAndUpdateUserMetadata,
  validateAvatarFile,
} from "@/shared/lib/profile-avatar";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("avatar");
  const validation = validateAvatarFile(file instanceof File ? file : null);

  if (!validation.ok) {
    await logAuditEvent({
      action: "profile.avatar.update",
      entityType: "profile",
      entityId: user.id,
      eventDomain: "settings",
      outcome: "error",
      severity: "low",
      metadata: { actor_user_id: user.id, error: validation.error },
    });
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const avatarFile = file as File;

  await ensureAvatarBucketExists();

  const previousMetadata =
    typeof user.user_metadata === "object" && user.user_metadata ? user.user_metadata : {};

  const uploadResult = await uploadAvatarAndUpdateUserMetadata({
    userId: user.id,
    file: avatarFile,
    userMetadata: previousMetadata as Record<string, unknown>,
  });

  if (!uploadResult.ok) {
    await logAuditEvent({
      action: "profile.avatar.update",
      entityType: "profile",
      entityId: user.id,
      eventDomain: "settings",
      outcome: "error",
      severity: "medium",
      metadata: { actor_user_id: user.id, error: uploadResult.error },
    });
    return NextResponse.json({ error: uploadResult.error }, { status: 400 });
  }

  await logAuditEvent({
    action: "profile.avatar.update",
    entityType: "profile",
    entityId: user.id,
    eventDomain: "settings",
    outcome: "success",
    severity: "low",
    metadata: { actor_user_id: user.id, avatar_path: uploadResult.avatarPath },
  });

  return NextResponse.json({ ok: true, avatarUrl: uploadResult.avatarUrl });
}

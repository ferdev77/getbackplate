import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/shared/lib/access";
import { getCurrentUser } from "@/modules/memberships/queries";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { dispatchNotificationBroadcast } from "@/infrastructure/notifications/dispatch-broadcast";

const bodySchema = z
  .object({
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(500),
    channels: z.array(z.enum(["push", "email"])).min(1),
    orgIds: z.union([z.literal("all"), z.array(z.string().uuid()).min(1)]).optional(),
    userIds: z.array(z.string().uuid()).min(1).optional(),
    image: z.string().url().optional(),
    actionUrl: z.string().url().optional(),
    scheduledAt: z.string().datetime().optional(),
  })
  .refine((data) => (data.orgIds !== undefined) !== (data.userIds !== undefined), {
    message: "Debe especificar orgIds o userIds, no ambos",
  });

export async function POST(req: NextRequest) {
  try {
    await requireSuperadmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const currentUser = await getCurrentUser().catch(() => null);

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { title, body, channels, orgIds, userIds, image, actionUrl, scheduledAt } = parsed.data;
  const sentBy = currentUser?.email ?? "superadmin";

  if (scheduledAt) {
    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Fecha programada inválida" }, { status: 400 });
    }
    if (scheduledDate.getUTCMinutes() !== 0 || scheduledDate.getUTCSeconds() !== 0) {
      return NextResponse.json({ error: "La hora programada debe ser en punto" }, { status: 400 });
    }
    if (scheduledDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: "La hora programada debe ser futura" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("notification_broadcasts")
      .insert({
        created_by: sentBy,
        channels,
        title,
        body,
        image_url: image ?? null,
        action_url: actionUrl ?? null,
        target_type: userIds ? "users" : "orgs",
        target_all: userIds ? false : orgIds === "all",
        org_ids: userIds ? [] : orgIds === "all" ? [] : orgIds,
        user_ids: userIds ?? [],
        scheduled_at: scheduledDate.toISOString(),
        status: "pending",
      })
      .select("id, scheduled_at")
      .single();
    if (error) return NextResponse.json({ error: "Error programando el envío" }, { status: 500 });

    return NextResponse.json({ scheduled: true, id: data.id, scheduledAt: data.scheduled_at });
  }

  const result = userIds
    ? await dispatchNotificationBroadcast({ title, body, channels, imageUrl: image, actionUrl, createdBy: sentBy, targetType: "users", userIds })
    : await dispatchNotificationBroadcast({ title, body, channels, imageUrl: image, actionUrl, createdBy: sentBy, targetType: "orgs", orgIds: orgIds! });

  return NextResponse.json(result);
}

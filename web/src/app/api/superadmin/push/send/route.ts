import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/shared/lib/access";
import { getCurrentUser } from "@/modules/memberships/queries";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { dispatchSuperadminPushBroadcast } from "@/infrastructure/push/superadmin-broadcast";

const bodySchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  orgIds: z.union([z.literal("all"), z.array(z.string().uuid()).min(1)]),
  image: z.string().url().optional(),
  scheduledAt: z.string().datetime().optional(),
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

  const { title, body, orgIds, image, scheduledAt } = parsed.data;
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
      .from("push_scheduled_sends")
      .insert({
        created_by: sentBy,
        title,
        body,
        image_url: image ?? null,
        target_all: orgIds === "all",
        org_ids: orgIds === "all" ? [] : orgIds,
        scheduled_at: scheduledDate.toISOString(),
        status: "pending",
      })
      .select("id, scheduled_at")
      .single();
    if (error) return NextResponse.json({ error: "Error programando el envío" }, { status: 500 });

    return NextResponse.json({ scheduled: true, id: data.id, scheduledAt: data.scheduled_at });
  }

  const result = await dispatchSuperadminPushBroadcast({ title, body, orgIds, image, sentBy });
  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/shared/lib/access";
import { getCurrentUser } from "@/modules/memberships/queries";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToOrg } from "@/infrastructure/push/send-to-org";

const bodySchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  orgIds: z.union([z.literal("all"), z.array(z.string().uuid()).min(1)]),
  image: z.string().url().optional(),
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

  const { title, body, orgIds, image } = parsed.data;

  const supabase = createSupabaseAdminClient();

  let targetOrgIds: string[];
  if (orgIds === "all") {
    const { data, error } = await supabase
      .from("organizations")
      .select("id")
      .eq("status", "active");
    if (error) return NextResponse.json({ error: "Error leyendo organizaciones" }, { status: 500 });
    targetOrgIds = (data ?? []).map((o) => o.id);
  } else {
    targetOrgIds = orgIds;
  }

  if (targetOrgIds.length === 0) {
    return NextResponse.json({ sent: 0, expired: 0, failed: 0, orgs: 0 });
  }

  const results = await Promise.allSettled(
    targetOrgIds.map((orgId) => sendPushToOrg(orgId, { title, body, url: "/", ...(image ? { image } : {}) })),
  );

  let sent = 0;
  let expired = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      sent += result.value.sent;
      expired += result.value.expired;
      failed += result.value.failed;
    } else {
      failed++;
    }
  }

  void supabase.from("push_send_logs").insert({
    sent_by: currentUser?.email ?? "superadmin",
    title,
    body,
    image_url: image ?? null,
    org_ids: targetOrgIds,
    orgs_count: targetOrgIds.length,
    sent,
    expired,
    failed,
  });

  return NextResponse.json({ sent, expired, failed, orgs: targetOrgIds.length });
}

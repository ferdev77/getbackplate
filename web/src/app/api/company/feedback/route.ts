import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const feedbackSchema = z.object({
  feedbackType: z.enum(["bug", "idea", "other"]).default("idea"),
  title: z.string().trim().min(1).max(140),
  message: z.string().trim().min(1).max(5000),
  pagePath: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("settings");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const userId = moduleAccess.userId;
  const supabase = await createSupabaseServerClient();

  const rawBody = await request.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const normalizedType = parsed.data.feedbackType;
  const title = parsed.data.title;
  const message = parsed.data.message;
  const pagePath = parsed.data.pagePath || null;

  const { error } = await supabase.from("feedback_messages").insert({
    organization_id: tenant.organizationId,
    user_id: userId,
    feedback_type: normalizedType,
    title,
    message,
    page_path: pagePath,
  });

  if (error) {
    await logAuditEvent({
      action: "feedback.create",
      entityType: "feedback_message",
      organizationId: tenant.organizationId,
      eventDomain: "settings",
      outcome: "error",
      severity: "medium",
      metadata: {
        feedback_type: normalizedType,
        page_path: pagePath,
        error: error.message,
      },
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "feedback.create",
    entityType: "feedback_message",
    organizationId: tenant.organizationId,
    eventDomain: "settings",
    outcome: "success",
    severity: "low",
    actorId: userId,
    metadata: {
      feedback_type: normalizedType,
      page_path: pagePath,
    },
  });

  return NextResponse.json({ ok: true });
}

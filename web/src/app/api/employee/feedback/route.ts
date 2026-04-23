import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { logAuditEvent } from "@/shared/lib/audit";
import { getActiveOrganizationIdFromCookie } from "@/shared/lib/tenant-selection";

const feedbackSchema = z.object({
  feedbackType: z.enum(["bug", "idea", "other"]).default("idea"),
  title: z.string().trim().min(1).max(140),
  message: z.string().trim().min(1).max(5000),
  pagePath: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const organizationId = await getActiveOrganizationIdFromCookie();
  if (!organizationId) {
    return NextResponse.json({ error: "organization_selection_required" }, { status: 409 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership?.role_id) {
    return NextResponse.json({ error: "Sin acceso al portal de empleado" }, { status: 403 });
  }

  const { data: role } = await supabase
    .from("roles")
    .select("code")
    .eq("id", membership.role_id)
    .maybeSingle();

  if (role?.code !== "employee") {
    return NextResponse.json({ error: "Sin acceso al portal de empleado" }, { status: 403 });
  }

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
    organization_id: organizationId,
    user_id: userId,
    source_channel: "employee",
    feedback_type: normalizedType,
    title,
    message,
    page_path: pagePath,
  });

  if (error) {
    await logAuditEvent({
      action: "feedback.create",
      entityType: "feedback_message",
      organizationId,
      eventDomain: "employee_portal",
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
    organizationId,
    eventDomain: "employee_portal",
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

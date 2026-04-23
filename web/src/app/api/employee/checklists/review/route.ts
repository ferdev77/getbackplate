import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const requestSchema = z.object({
  submissionId: z.string().uuid(),
});

export async function POST(request: Request) {
  const moduleAccess = await assertEmployeeCapabilityApi("checklists", "create");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const submissionId = parsed.data.submissionId;
  const organizationId = moduleAccess.tenant.organizationId;

  const [{ data: employeeRow }, { data: membershipRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("branch_id")
      .eq("organization_id", organizationId)
      .eq("user_id", moduleAccess.userId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("branch_id")
      .eq("organization_id", organizationId)
      .eq("user_id", moduleAccess.userId)
      .eq("status", "active")
      .limit(20),
  ]);

  const activeLocationIds = [...new Set([
    moduleAccess.tenant.branchId,
    employeeRow?.branch_id,
    ...(membershipRows ?? []).map((row) => row.branch_id),
  ].filter((value): value is string => Boolean(value)))];

  const { data: submission } = await admin
    .from("checklist_submissions")
    .select("id, status, template_id, branch_id")
    .eq("organization_id", organizationId)
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  if (!submission.branch_id || !activeLocationIds.includes(submission.branch_id)) {
    return NextResponse.json({ error: "No puedes operar reportes fuera de tus locaciones activas" }, { status: 403 });
  }

  const { data: template } = await admin
    .from("checklist_templates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", submission.template_id)
    .eq("created_by", moduleAccess.userId)
    .maybeSingle();

  if (!template) {
    return NextResponse.json({ error: "No puedes operar este reporte" }, { status: 403 });
  }

  if (submission.status === "reviewed") {
    return NextResponse.json({ ok: true, status: "reviewed" });
  }

  const { error } = await admin
    .from("checklist_submissions")
    .update({
      status: "reviewed",
      reviewed_by: moduleAccess.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", submissionId);

  if (error) {
    await logAuditEvent({
      action: "checklist.submission.review",
      entityType: "checklist_submission",
      entityId: submissionId,
      organizationId,
      eventDomain: "checklists",
      outcome: "error",
      severity: "medium",
      metadata: {
        error: error.message,
        actor_role: "employee",
      },
    });

    return NextResponse.json({ error: `No se pudo marcar como revisado: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "checklist.submission.review",
    entityType: "checklist_submission",
    entityId: submissionId,
    organizationId,
    eventDomain: "checklists",
    outcome: "success",
    severity: "medium",
    metadata: {
      reviewed_by: moduleAccess.userId,
      actor_role: "employee",
    },
  });

  return NextResponse.json({ ok: true, status: "reviewed" });
}

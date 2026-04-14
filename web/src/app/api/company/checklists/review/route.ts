import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const requestSchema = z.object({
  submissionId: z.string().uuid(),
});

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("checklists");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const submissionId = parsed.data.submissionId;
  const organizationId = moduleAccess.tenant.organizationId;

  const { data: submission } = await supabase
    .from("checklist_submissions")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  if (submission.status === "reviewed") {
    return NextResponse.json({ ok: true, status: "reviewed" });
  }

  const { error } = await supabase
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
    },
  });

  return NextResponse.json({ ok: true, status: "reviewed" });
}

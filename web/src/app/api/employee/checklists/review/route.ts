import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { resolveEmployeeLocationScope } from "@/shared/lib/employee-location-scope";

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

  // Las locaciones salen del mismo resolvedor que usa la pantalla de reportes.
  // Antes esta ruta armaba la lista a mano con branch_id y se olvidaba de
  // location_scope_ids y all_locations: un empleado asignado a varias locaciones
  // veia el reporte en la lista y despues no podia marcarlo como revisado.
  const [{ data: employeeRow }, { data: membershipRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("branch_id, all_locations, location_scope_ids")
      .eq("organization_id", organizationId)
      .eq("user_id", moduleAccess.userId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("branch_id, all_locations, location_scope_ids")
      .eq("organization_id", organizationId)
      .eq("user_id", moduleAccess.userId)
      .eq("status", "active")
      .limit(20),
  ]);

  const locationScope = await resolveEmployeeLocationScope(supabase, organizationId, {
    tenantBranchId: moduleAccess.tenant.branchId,
    employeeBranchId: employeeRow?.branch_id ?? null,
    employeeLocationIds: employeeRow?.location_scope_ids ?? [],
    membershipRows: membershipRows ?? [],
    employeeAllLocations: employeeRow?.all_locations ?? false,
  });
  const activeLocationIds = locationScope.locationIds;

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

  // Sin plantilla no hay autoria que verificar: el permiso de este endpoint es
  // "soy quien creo el checklist", y la plantilla pudo haber sido eliminada.
  if (!submission.template_id) {
    return NextResponse.json(
      { error: "El checklist de este reporte fue eliminado" },
      { status: 409 },
    );
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

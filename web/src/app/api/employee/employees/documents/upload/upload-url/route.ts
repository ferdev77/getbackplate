import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { isEmployeeInScope, resolveHrScope } from "@/modules/employees/lib/api-scope";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import {
  assertUploadCandidate,
  buildStoragePath,
  createSignedUploadTarget,
  ensureDocumentsBucket,
} from "@/shared/lib/direct-upload";
import { EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS } from "@/shared/lib/employee-document-slots";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

/**
 * Primer paso de la subida directa al expediente desde el portal, para el
 * empleado con gestion de RRHH delegada. Equivalente de la version del panel de
 * empresa, con el gate delegado y el alcance de locaciones de quien sube.
 */
export async function POST(request: Request) {
  const access = await assertEmployeeCapabilityApi("employees", "edit");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { fileName?: string; fileSize?: number; slot?: string; employeeId?: string }
    | null;

  const fileName = String(body?.fileName ?? "").trim();
  const fileSize = Number(body?.fileSize ?? 0);
  const slot = String(body?.slot ?? "").trim();
  const employeeId = String(body?.employeeId ?? "").trim();

  const isValidSlot =
    slot.startsWith("custom_") || EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS.some((item) => item.slot === slot);

  if (!employeeId || !isValidSlot) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const candidate = assertUploadCandidate({ fileName, fileSize });
  if (!candidate.ok) {
    return NextResponse.json({ error: candidate.message }, { status: 400 });
  }

  const organizationId = access.tenant.organizationId;
  const admin = createSupabaseAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("id, branch_id, location_scope_ids, all_locations")
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee?.id) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const scopeIds = await resolveHrScope(organizationId, access.userId);
  if (!isEmployeeInScope(employee, scopeIds)) {
    return NextResponse.json({ error: "No tienes permisos para editar este empleado" }, { status: 403 });
  }

  try {
    await assertPlanLimitForStorage(organizationId, fileSize);
  } catch (error) {
    return NextResponse.json(
      { error: getPlanLimitErrorMessage(error, "Limite de almacenamiento alcanzado") },
      { status: 400 },
    );
  }

  const path = buildStoragePath(`${organizationId}/employees/${employee.id}/company/${slot}`, fileName);

  if (!isSafeTenantStoragePath(path, organizationId)) {
    return NextResponse.json({ error: "Ruta de almacenamiento invalida" }, { status: 400 });
  }

  await ensureDocumentsBucket(admin);
  const signed = await createSignedUploadTarget(admin, path);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...signed.target });
}

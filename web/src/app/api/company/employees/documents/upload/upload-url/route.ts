import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
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
 * Primer paso de la subida directa del expediente visto desde el panel de
 * empresa. Mismo contrato que el resto: ver shared/lib/direct-upload.ts.
 *
 * Los permisos se revisan aca con el mismo gate que el registro: si el admin no
 * tiene el modulo de empleados, no se firma nada.
 */
export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
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
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const candidate = assertUploadCandidate({ fileName, fileSize });
  if (!candidate.ok) {
    return NextResponse.json({ error: candidate.message }, { status: 400 });
  }

  const organizationId = moduleAccess.tenant.organizationId;
  const admin = createSupabaseAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee?.id) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  try {
    await assertPlanLimitForStorage(organizationId, fileSize);
  } catch (error) {
    return NextResponse.json(
      { error: getPlanLimitErrorMessage(error, "Límite de almacenamiento alcanzado") },
      { status: 400 },
    );
  }

  const path = buildStoragePath(`${organizationId}/employees/${employee.id}/company/${slot}`, fileName);

  if (!isSafeTenantStoragePath(path, organizationId)) {
    return NextResponse.json({ error: "Ruta de almacenamiento inválida" }, { status: 400 });
  }

  await ensureDocumentsBucket(admin);
  const signed = await createSignedUploadTarget(admin, path);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...signed.target });
}

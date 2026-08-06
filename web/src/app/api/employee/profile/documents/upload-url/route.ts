import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertTenantModuleApi } from "@/shared/lib/access";
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
 * Primer paso de la subida directa del expediente propio, desde el portal del
 * empleado. Mismo contrato que el resto: ver shared/lib/direct-upload.ts.
 *
 * El empleado solo puede firmar rutas de su propio legajo: el id sale de su
 * sesion, nunca del cuerpo del request.
 */
export async function POST(request: Request) {
  const moduleAccess = await assertTenantModuleApi("documents", { allowBillingBypass: true });
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  if (moduleAccess.tenant.roleCode !== "employee") {
    return NextResponse.json({ error: "Solo disponible para portal de empleado" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { fileName?: string; fileSize?: number; slot?: string }
    | null;

  const fileName = String(body?.fileName ?? "").trim();
  const fileSize = Number(body?.fileSize ?? 0);
  const slot = String(body?.slot ?? "").trim();

  const isValidSlot =
    slot.startsWith("custom_") || EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS.some((item) => item.slot === slot);

  if (!isValidSlot) {
    return NextResponse.json({ error: "Slot documental inválido" }, { status: 400 });
  }

  const candidate = assertUploadCandidate({ fileName, fileSize });
  if (!candidate.ok) {
    return NextResponse.json({ error: candidate.message }, { status: 400 });
  }

  const organizationId = moduleAccess.tenant.organizationId;
  const supabase = await createSupabaseServerClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", moduleAccess.userId)
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

  const path = buildStoragePath(`${organizationId}/employees/${employee.id}/self/${slot}`, fileName);

  if (!isSafeTenantStoragePath(path, organizationId)) {
    return NextResponse.json({ error: "Ruta de almacenamiento inválida" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  await ensureDocumentsBucket(admin);
  const signed = await createSignedUploadTarget(admin, path);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...signed.target });
}

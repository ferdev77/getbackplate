import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import {
  assertUploadCandidate,
  buildStoragePath,
  createSignedUploadTarget,
  ensureDocumentsBucket,
} from "@/shared/lib/direct-upload";
import { EMPLOYEE_UPLOAD_STAGING_PREFIX } from "@/modules/employees/lib/upload-staging";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

/**
 * Primer paso de la subida directa del alta de empleados.
 *
 * A diferencia del resto, aca el empleado todavia no existe cuando el navegador
 * manda los archivos, asi que la ruta final no se puede calcular: los bytes
 * aterrizan en una carpeta de paso y el POST de ../ los copia a su lugar
 * definitivo y borra el original. Lo que quede sin reclamar lo levanta el
 * barrido de huerfanos (modules/documents/services/orphan-uploads.service.ts).
 */
export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const body = (await request.json().catch(() => null)) as
    | { fileName?: string; fileSize?: number }
    | null;

  const fileName = String(body?.fileName ?? "").trim();
  const fileSize = Number(body?.fileSize ?? 0);

  const candidate = assertUploadCandidate({ fileName, fileSize });
  if (!candidate.ok) {
    return NextResponse.json({ error: candidate.message }, { status: 400 });
  }

  const organizationId = moduleAccess.tenant.organizationId;

  try {
    await assertPlanLimitForStorage(organizationId, fileSize);
  } catch (error) {
    return NextResponse.json(
      { error: getPlanLimitErrorMessage(error, "Límite de almacenamiento alcanzado") },
      { status: 400 },
    );
  }

  const path = buildStoragePath(`${organizationId}/${EMPLOYEE_UPLOAD_STAGING_PREFIX}`, fileName);

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

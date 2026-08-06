import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import {
  assertUploadCandidate,
  buildStoragePath,
  createSignedUploadTarget,
  ensureDocumentsBucket,
} from "@/shared/lib/direct-upload";
import { MAINTENANCE_UPLOAD_STAGING_PREFIX } from "@/modules/maintenance/lib/upload-staging";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

/**
 * Primer paso de la subida directa de adjuntos de mantenimiento, portal del
 * empleado. Ver la version de empresa y shared/lib/direct-upload.ts.
 *
 * Se firma con "create" o con "edit": el primero es el permiso de quien levanta
 * la solicitud con fotos, el segundo el de quien suma adjuntos a una que ya
 * existe. Quien no tenga ninguno de los dos no obtiene URL.
 */
export async function POST(request: Request) {
  const created = await assertEmployeeCapabilityApi("maintenance", "create");
  const access = created.ok ? created : await assertEmployeeCapabilityApi("maintenance", "edit");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
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

  const organizationId = access.tenant.organizationId;

  try {
    await assertPlanLimitForStorage(organizationId, fileSize);
  } catch (error) {
    return NextResponse.json(
      { error: getPlanLimitErrorMessage(error, "Limite de almacenamiento alcanzado") },
      { status: 400 },
    );
  }

  const path = buildStoragePath(`${organizationId}/${MAINTENANCE_UPLOAD_STAGING_PREFIX}`, fileName);

  if (!isSafeTenantStoragePath(path, organizationId)) {
    return NextResponse.json({ error: "Ruta de archivo invalida" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  await ensureDocumentsBucket(admin);
  const signed = await createSignedUploadTarget(admin, path);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...signed.target });
}

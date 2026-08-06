import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import {
  assertUploadCandidate,
  buildStoragePath,
  createSignedUploadTarget,
  ensureDocumentsBucket,
} from "@/shared/lib/direct-upload";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

/**
 * Primer paso de la subida directa: entrega una URL firmada para que el archivo
 * viaje del navegador a storage sin pasar por la funcion. El registro en la
 * base lo hace despues el POST de ../manage. Ver shared/lib/direct-upload.ts.
 *
 * Los permisos se revisan aca con el mismo gate que el registro: sin capacidad
 * "create" no se firma nada.
 */
export async function POST(request: Request) {
  const access = await assertEmployeeCapabilityApi("documents", "create", { allowBillingBypass: true });
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

  try {
    await assertPlanLimitForStorage(access.tenant.organizationId, fileSize);
  } catch (error) {
    return NextResponse.json(
      { error: getPlanLimitErrorMessage(error, "Limite de almacenamiento alcanzado") },
      { status: 400 },
    );
  }

  const path = buildStoragePath(
    `${access.tenant.organizationId}/employee-owned/${access.userId}`,
    fileName,
  );

  if (!isSafeTenantStoragePath(path, access.tenant.organizationId)) {
    return NextResponse.json({ error: "Ruta invalida" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  await ensureDocumentsBucket(admin);
  const signed = await createSignedUploadTarget(admin, path);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...signed.target });
}

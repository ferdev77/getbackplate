import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import {
  assertUploadCandidate,
  buildStoragePath,
  createSignedUploadTarget,
  ensureDocumentsBucket,
} from "@/shared/lib/direct-upload";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

/**
 * Primer paso de la subida directa del panel de empresa. Mismo motivo y mismo
 * contrato que la version del portal de empleado: ver shared/lib/direct-upload.ts.
 */
export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("documents");
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
      {
        error: getPlanLimitErrorMessage(
          error,
          "Limite de almacenamiento alcanzado. Actualiza tu plan para continuar.",
        ),
      },
      { status: 400 },
    );
  }

  const path = buildStoragePath(organizationId, fileName);

  if (!isSafeTenantStoragePath(path, organizationId)) {
    return NextResponse.json({ error: "Ruta de archivo inválida para esta empresa" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  await ensureDocumentsBucket(admin);
  const signed = await createSignedUploadTarget(admin, path);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...signed.target });
}

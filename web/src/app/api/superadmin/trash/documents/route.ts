import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertSuperadminApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

const BUCKET_NAME = "tenant-documents";

// RESTORE Document (Superadmin)
export async function PATCH(request: Request) {
  const access = await assertSuperadminApi();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const supabase = await createSupabaseServerClient();
  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const documentId = String(body?.documentId ?? "").trim();

  if (!documentId) {
    return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  }

  const { data: document } = await supabase
    .from("documents")
    .select("id, organization_id")
    .eq("id", documentId)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Documento no encontrado o no está en la papelera" }, { status: 404 });
  }

  const { error } = await supabase
    .from("documents")
    .update({ deleted_at: null })
    .eq("id", documentId);

  if (error) {
    await logAuditEvent({
      action: "superadmin.documents.trash.restore",
      entityType: "document",
      entityId: documentId,
      organizationId: document.organization_id,
      eventDomain: "documents",
      outcome: "error",
      severity: "high",
      metadata: { error: error.message, actor_user_id: access.userId },
    });
    return NextResponse.json({ error: `No se pudo restaurar el documento: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "superadmin.documents.trash.restore",
    entityType: "document",
    entityId: documentId,
    organizationId: document.organization_id,
    eventDomain: "documents",
    outcome: "success",
    severity: "low",
    metadata: { actor_user_id: access.userId },
  });

  return NextResponse.json({ ok: true, message: "Documento restaurado" });
}

// PERMANENT DELETE Document (Superadmin)
export async function DELETE(request: Request) {
  const access = await assertSuperadminApi();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const supabase = await createSupabaseServerClient();
  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const documentId = String(body?.documentId ?? "").trim();

  if (!documentId) {
    return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  }

  const { data: document } = await supabase
    .from("documents")
    .select("id, file_path, organization_id")
    .eq("id", documentId)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Documento no encontrado o no está en la papelera" }, { status: 404 });
  }

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (error) {
    await logAuditEvent({
      action: "superadmin.documents.trash.purge",
      entityType: "document",
      entityId: documentId,
      organizationId: document.organization_id,
      eventDomain: "documents",
      outcome: "error",
      severity: "high",
      metadata: { file_path: document.file_path, error: error.message, actor_user_id: access.userId },
    });
    return NextResponse.json({ error: `No se pudo eliminar definitivamente: ${error.message}` }, { status: 400 });
  }

  if (
    document.file_path &&
    isSafeTenantStoragePath(document.file_path, document.organization_id, { allowLegacySeedPrefix: true })
  ) {
    const admin = createSupabaseAdminClient();
    await admin.storage.from(BUCKET_NAME).remove([document.file_path]);
  }

  await logAuditEvent({
    action: "superadmin.documents.trash.purge",
    entityType: "document",
    entityId: documentId,
    organizationId: document.organization_id,
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
    metadata: { file_path: document.file_path, actor_user_id: access.userId },
  });

  return NextResponse.json({ ok: true });
}

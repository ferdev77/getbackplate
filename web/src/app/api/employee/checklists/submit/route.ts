import { NextResponse } from "next/server";


import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { assertTenantModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const EVIDENCE_BUCKET = "checklist-evidence";
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

async function ensureBucket() {
  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(EVIDENCE_BUCKET);
  if (bucket) {
    if (bucket.public) {
      await admin.storage.updateBucket(EVIDENCE_BUCKET, {
        public: false,
        fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
      });
    }
    return;
  }

  await admin.storage.createBucket(EVIDENCE_BUCKET, {
    public: false,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
  });
}

// Minimal best-effort rollback for storage only
async function rollbackStorage(uploadedEvidencePaths: string[]) {
  if (!uploadedEvidencePaths.length) return;
  const admin = createSupabaseAdminClient();
  try {
    await admin.storage.from(EVIDENCE_BUCKET).remove(uploadedEvidencePaths);
  } catch {
    // ignore
  }
}

type IncomingItem = {
  template_item_id: string;
  checked: boolean;
  flagged: boolean;
  comment: string;
};

type EvidenceAttachment = {
  file_path: string;
  mime_type: string | null;
  file_size_bytes: number;
};

type SubmissionItemPayload = {
  id: string;
  template_item_id: string;
  checked: boolean;
  flagged: boolean;
  comment: string;
  attachments: EvidenceAttachment[];
};

export async function POST(request: Request) {
  const moduleAccess = await assertTenantModuleApi("checklists");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  async function fail(message: string, status: number, metadata: Record<string, unknown> = {}) {
    await logAuditEvent({
      action: "checklists.submission.create",
      entityType: "checklist_submission",
      organizationId: tenant.organizationId,
      branchId: tenant.branchId ?? null,
      eventDomain: "checklists",
      outcome: "error",
      severity: "medium",
      actorId: userId,
      metadata: {
        error: message,
        ...metadata,
      },
    });

    return NextResponse.json({ error: message }, { status });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return fail("Solicitud invalida", 400);
  }

  const templateId = String(formData.get("template_id") ?? "").trim();
  const rawItems = String(formData.get("items") ?? "").trim();

  if (!templateId || !rawItems) {
    return fail("Checklist invalido", 400, { template_id: templateId || null });
  }

  let items: IncomingItem[] = [];
  try {
    const parsed = JSON.parse(rawItems) as IncomingItem[];
    items = (Array.isArray(parsed) ? parsed : []).map((item) => ({
      template_item_id: String(item.template_item_id ?? "").trim(),
      checked: Boolean(item.checked),
      flagged: Boolean(item.flagged),
      comment: String(item.comment ?? "").trim(),
    }));
  } catch {
    return fail("Payload de items invalido", 400, { template_id: templateId });
  }

  if (!items.length) {
    return fail("Sin items para enviar", 400, { template_id: templateId });
  }

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("department_id, position, branch_id")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  let employeePositionIds: string[] = [];
  if (employeeRow?.position) {
    const { data: positionRows } = await supabase
      .from("department_positions")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .eq("name", employeeRow.position)
      .limit(20);

    employeePositionIds = (positionRows ?? []).map((row) => row.id);
  }

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, branch_id, department_id, target_scope")
    .eq("organization_id", tenant.organizationId)
    .eq("id", templateId)
    .eq("is_active", true)
    .maybeSingle();

  if (!template) {
    return fail("Plantilla no encontrada", 404, { template_id: templateId });
  }

  const canUse = canUseChecklistTemplateInTenant({
    roleCode: tenant.roleCode,
    userId,
    branchId: tenant.branchId ?? employeeRow?.branch_id ?? null,
    departmentId: employeeRow?.department_id ?? null,
    positionIds: employeePositionIds,
    templateBranchId: template.branch_id,
    templateDepartmentId: template.department_id,
    targetScope: template.target_scope,
  });

  if (!canUse) {
    return fail("No tienes acceso a este checklist", 403, { template_id: templateId });
  }

  const admin = createSupabaseAdminClient();

  const { data: existingSubmission } = await admin
    .from("checklist_submissions")
    .select("id, status, submitted_at")
    .eq("organization_id", tenant.organizationId)
    .eq("template_id", templateId)
    .eq("submitted_by", userId)
    .in("status", ["submitted", "reviewed"])
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSubmission) {
    return fail("Este checklist ya fue enviado. Solo puedes visualizarlo.", 409, {
      template_id: templateId,
      existing_submission_id: existingSubmission.id,
      existing_submission_status: existingSubmission.status,
    });
  }

  const itemIds = Array.from(new Set(items.map((item) => item.template_item_id).filter(Boolean)));
  const { data: validItems } = await supabase
    .from("checklist_template_items")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .in("id", itemIds);

  const validSet = new Set((validItems ?? []).map((row) => row.id));
  if (itemIds.some((id) => !validSet.has(id))) {
    return fail("Items invalidos para esta plantilla", 400, { template_id: templateId });
  }

  const unresolvedFlags = items.filter((item) => item.flagged && !item.comment.trim());
  if (unresolvedFlags.length) {
    return fail("Los items marcados para atencion requieren comentario", 400, {
      template_id: templateId,
      unresolved_flags: unresolvedFlags.length,
    });
  }

  await ensureBucket();

  const submissionId = crypto.randomUUID();
  const branchId = tenant.branchId ?? template.branch_id;
  
  const uploadedEvidencePaths: string[] = [];
  const rpcItemsPayload: SubmissionItemPayload[] = [];

  for (const item of items) {
    const submissionItemId = crypto.randomUUID();
    const rpcItem = {
      id: submissionItemId,
      template_item_id: item.template_item_id,
      checked: item.checked,
      flagged: item.flagged,
      comment: item.comment,
      attachments: [] as EvidenceAttachment[]
    };

    const files = formData
      .getAll("photo_" + item.template_item_id)
      .filter((value): value is File => value instanceof File && value.size > 0);

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        await rollbackStorage(uploadedEvidencePaths);
        return fail(`La foto ${file.name} supera el limite`, 400, {
          template_id: templateId,
          submission_id: submissionId,
        });
      }

      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const objectPath = `${tenant.organizationId}/${submissionId}/${submissionItemId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await admin.storage.from(EVIDENCE_BUCKET).upload(objectPath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

      if (uploadError) {
        await rollbackStorage(uploadedEvidencePaths);
        return fail(`No se pudo subir evidencia: ${uploadError.message}`, 400, {
          template_id: templateId,
          submission_id: submissionId,
        });
      }

      uploadedEvidencePaths.push(objectPath);
      rpcItem.attachments.push({
        file_path: objectPath,
        mime_type: file.type || null,
        file_size_bytes: file.size,
      });
    }

    rpcItemsPayload.push(rpcItem);
  }

  // Execute the atomic transaction
  const { error: rpcError } = await supabase.rpc("submit_checklist_transaction", {
    p_submission_id: submissionId,
    p_organization_id: tenant.organizationId,
    p_branch_id: branchId,
    p_template_id: templateId,
    p_submitted_by: userId,
    p_items: rpcItemsPayload,
    p_submitted_at: new Date().toISOString()
  });

  if (rpcError) {
    await rollbackStorage(uploadedEvidencePaths);
    return fail(`Hubo un error al guardar tu reporte: ${rpcError.message}`, 400, {
      template_id: templateId,
      submission_id: submissionId,
    });
  }

  await logAuditEvent({
    action: "checklists.submission.create",
    entityType: "checklist_submission",
    entityId: submissionId,
    organizationId: tenant.organizationId,
    branchId: branchId ?? null,
    eventDomain: "checklists",
    outcome: "success",
    severity: "medium",
    actorId: userId,
    metadata: {
      template_id: templateId,
      items_count: items.length,
      evidence_files_count: uploadedEvidencePaths.length,
    },
  });

  return NextResponse.json({ ok: true, submissionId });
}

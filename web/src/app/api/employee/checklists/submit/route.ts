import { NextResponse, after } from "next/server";
import { notifyChecklistSubmitted } from "@/modules/checklists/services/checklist-events.service";


import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { assertTenantModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { resolveEmployeeAllowedLocationIds } from "@/shared/lib/employee-api-scope";
import {
  resolveChecklistSubmissionBranch,
  validateExactChecklistItemSet,
} from "@/modules/checklists/lib/submission-integrity";

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
    return fail("Solicitud inválida", 400);
  }

  const templateId = String(formData.get("template_id") ?? "").trim();
  const rawItems = String(formData.get("items") ?? "").trim();

  if (!templateId || !rawItems) {
    return fail("Checklist inválido", 400, { template_id: templateId || null });
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
    return fail("Payload de ítems inválido", 400, { template_id: templateId });
  }

  if (!items.length) {
    return fail("Sin items para enviar", 400, { template_id: templateId });
  }

  const [{ data: employeeRow }, allowedLocationIds] = await Promise.all([
    supabase
      .from("employees")
      .select("department_id, position, position_id, branch_id")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    resolveEmployeeAllowedLocationIds(tenant.organizationId, userId),
  ]);

  let employeePositionIds: string[] = [];
  // El puesto real manda sobre el texto libre (migracion 20260729000005).
  if (employeeRow?.position_id) {
    employeePositionIds = [employeeRow.position_id];
  } else if (employeeRow?.position) {
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
    .select("id, name, created_by, branch_id, department_id, target_scope")
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
    branchIds: allowedLocationIds,
    departmentId: employeeRow?.department_id ?? null,
    positionIds: employeePositionIds,
    templateBranchId: template.branch_id,
    targetScope: template.target_scope,
  });

  if (!canUse) {
    return fail("No tienes acceso a este checklist", 403, { template_id: templateId });
  }

  const admin = createSupabaseAdminClient();

  const [{ data: existingSubmission }, { data: scheduledJob }] = await Promise.all([
    admin
      .from("checklist_submissions")
      .select("id, status, submitted_at")
      .eq("organization_id", tenant.organizationId)
      .eq("template_id", templateId)
      .eq("submitted_by", userId)
      .in("status", ["submitted", "reviewed"])
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("scheduled_jobs")
      .select("last_run_at")
      .eq("organization_id", tenant.organizationId)
      .eq("job_type", "checklist_generator")
      .eq("target_id", templateId)
      .maybeSingle(),
  ]);

  if (existingSubmission) {
    const lastRunAt = scheduledJob?.last_run_at ? new Date(scheduledJob.last_run_at) : null;
    const submittedAt = existingSubmission.submitted_at ? new Date(existingSubmission.submitted_at) : null;

    // Para checklists recurrentes: solo bloquear si la submission es del período actual
    // (entregada DESPUÉS del último run del cron). Si es de un período anterior, permitir.
    // Para checklists sin recurrencia (lastRunAt = null): bloquear siempre.
    const isCurrentPeriod = !lastRunAt || (submittedAt !== null && submittedAt >= lastRunAt);

    if (isCurrentPeriod) {
      return fail("Este checklist ya fue enviado. Solo puedes visualizarlo.", 409, {
        template_id: templateId,
        existing_submission_id: existingSubmission.id,
        existing_submission_status: existingSubmission.status,
      });
    }
  }

  const submittedItemIds = items.map((item) => item.template_item_id).filter(Boolean);
  const { data: templateSections } = await supabase
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("template_id", templateId);
  const sectionIds = (templateSections ?? []).map((section) => section.id);
  const { data: expectedItems } = sectionIds.length
    ? await supabase
        .from("checklist_template_items")
        .select("id")
        .eq("organization_id", tenant.organizationId)
        .in("section_id", sectionIds)
    : { data: [] as Array<{ id: string }> };

  const itemSetValidation = validateExactChecklistItemSet(
    submittedItemIds,
    (expectedItems ?? []).map((row) => row.id),
  );
  if (!itemSetValidation.ok) {
    return fail("Ítems inválidos para esta plantilla", 400, { template_id: templateId });
  }

  const unresolvedFlags = items.filter((item) => item.flagged && !item.comment.trim());
  if (unresolvedFlags.length) {
    return fail("Los ítems marcados para atención requieren comentario", 400, {
      template_id: templateId,
      unresolved_flags: unresolvedFlags.length,
    });
  }

  await ensureBucket();

  const submissionId = crypto.randomUUID();
  const branchId = resolveChecklistSubmissionBranch({
    templateBranchId: template.branch_id,
    tenantBranchId: tenant.branchId ?? null,
    employeeBranchId: employeeRow?.branch_id ?? null,
  });
  
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
  const { error: rpcError } = await admin.rpc("submit_checklist_transaction", {
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

  // Avisar despues de responder: el empleado no espera por el envio del push.
  after(async () => {
    await notifyChecklistSubmitted({
      supabase: admin,
      organizationId: tenant.organizationId,
      templateId,
      templateName: template?.name ?? "Checklist",
      templateCreatedBy: template?.created_by ?? null,
      submittedByUserId: userId,
      itemsCount: items.length,
      flaggedCount: rpcItemsPayload.filter((item) => item.flagged).length,
    });
  });

  return NextResponse.json({ ok: true, submissionId });
}

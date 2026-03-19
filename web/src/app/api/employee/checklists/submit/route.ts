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
  if (bucket) return;

  await admin.storage.createBucket(EVIDENCE_BUCKET, {
    public: false,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
  });
}

async function rollbackChecklistSubmissionCreateFlow(input: {
  organizationId: string;
  submissionId: string;
  submissionItemIds: string[];
  uploadedEvidencePaths: string[];
}) {
  const admin = createSupabaseAdminClient();

  try {
    if (input.uploadedEvidencePaths.length) {
      await admin.storage.from(EVIDENCE_BUCKET).remove(input.uploadedEvidencePaths);
    }

    if (input.submissionItemIds.length) {
      await admin
        .from("checklist_item_attachments")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("submission_item_id", input.submissionItemIds);

      await admin
        .from("checklist_item_comments")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("submission_item_id", input.submissionItemIds);

      await admin
        .from("checklist_flags")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("submission_item_id", input.submissionItemIds);
    }

    await admin
      .from("checklist_submission_items")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("submission_id", input.submissionId);

    await admin
      .from("checklist_submissions")
      .delete()
      .eq("organization_id", input.organizationId)
      .eq("id", input.submissionId);
  } catch {
    // rollback best-effort
  }
}

type IncomingItem = {
  template_item_id: string;
  checked: boolean;
  flagged: boolean;
  comment: string;
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
      metadata: {
        actor_user_id: userId,
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

  const itemIds = [...new Set(items.map((item) => item.template_item_id).filter(Boolean))];
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

  const admin = createSupabaseAdminClient();

  const { data: submission, error: submissionError } = await admin
    .from("checklist_submissions")
    .insert({
      organization_id: tenant.organizationId,
      branch_id: tenant.branchId ?? template.branch_id,
      template_id: templateId,
      submitted_by: userId,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    return fail(`No se pudo crear envio: ${submissionError?.message ?? "error"}`, 400, { template_id: templateId });
  }

  const submissionItemIds: string[] = [];
  const uploadedEvidencePaths: string[] = [];

  for (const item of items) {
    const { data: submissionItem, error: submissionItemError } = await admin
      .from("checklist_submission_items")
      .insert({
        organization_id: tenant.organizationId,
        submission_id: submission.id,
        template_item_id: item.template_item_id,
        is_checked: item.checked,
        is_flagged: item.flagged,
      })
      .select("id")
      .single();

      if (submissionItemError || !submissionItem) {
      await rollbackChecklistSubmissionCreateFlow({
        organizationId: tenant.organizationId,
        submissionId: submission.id,
        submissionItemIds,
        uploadedEvidencePaths,
      });
      return fail(`Error guardando items: ${submissionItemError?.message ?? "error"}`, 400, {
        template_id: templateId,
        submission_id: submission.id,
      });
    }

    submissionItemIds.push(submissionItem.id);

    if (item.comment) {
      const { error } = await admin.from("checklist_item_comments").insert({
        organization_id: tenant.organizationId,
        submission_item_id: submissionItem.id,
        author_id: userId,
        comment: item.comment,
      });
      if (error) {
        await rollbackChecklistSubmissionCreateFlow({
          organizationId: tenant.organizationId,
          submissionId: submission.id,
          submissionItemIds,
          uploadedEvidencePaths,
        });
        return fail(`Error guardando comentario: ${error.message}`, 400, {
          template_id: templateId,
          submission_id: submission.id,
        });
      }
    }

    if (item.flagged) {
      const { error } = await admin.from("checklist_flags").insert({
        organization_id: tenant.organizationId,
        submission_item_id: submissionItem.id,
        reported_by: userId,
        reason: item.comment || "Marcado para atencion",
        status: "open",
      });
      if (error) {
        await rollbackChecklistSubmissionCreateFlow({
          organizationId: tenant.organizationId,
          submissionId: submission.id,
          submissionItemIds,
          uploadedEvidencePaths,
        });
        return fail(`Error guardando flag: ${error.message}`, 400, {
          template_id: templateId,
          submission_id: submission.id,
        });
      }
    }

    const files = formData
      .getAll(`photo_${item.template_item_id}`)
      .filter((value): value is File => value instanceof File && value.size > 0);

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        await rollbackChecklistSubmissionCreateFlow({
          organizationId: tenant.organizationId,
          submissionId: submission.id,
          submissionItemIds,
          uploadedEvidencePaths,
        });
        return fail(`La foto ${file.name} supera el limite`, 400, {
          template_id: templateId,
          submission_id: submission.id,
        });
      }

      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const objectPath = `${tenant.organizationId}/${submission.id}/${submissionItem.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await admin.storage.from(EVIDENCE_BUCKET).upload(objectPath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

      if (uploadError) {
        await rollbackChecklistSubmissionCreateFlow({
          organizationId: tenant.organizationId,
          submissionId: submission.id,
          submissionItemIds,
          uploadedEvidencePaths,
        });
        return fail(`No se pudo subir evidencia: ${uploadError.message}`, 400, {
          template_id: templateId,
          submission_id: submission.id,
        });
      }

      uploadedEvidencePaths.push(objectPath);

      const { error: attachmentError } = await admin.from("checklist_item_attachments").insert({
        organization_id: tenant.organizationId,
        submission_item_id: submissionItem.id,
        uploaded_by: userId,
        file_path: objectPath,
        mime_type: file.type || null,
        file_size_bytes: file.size,
      });
      if (attachmentError) {
        await rollbackChecklistSubmissionCreateFlow({
          organizationId: tenant.organizationId,
          submissionId: submission.id,
          submissionItemIds,
          uploadedEvidencePaths,
        });
        return fail(`No se pudo registrar evidencia: ${attachmentError.message}`, 400, {
          template_id: templateId,
          submission_id: submission.id,
        });
      }
    }
  }

  await logAuditEvent({
    action: "checklists.submission.create",
    entityType: "checklist_submission",
    entityId: submission.id,
    organizationId: tenant.organizationId,
    branchId: tenant.branchId ?? template.branch_id ?? null,
    eventDomain: "checklists",
    outcome: "success",
    severity: "medium",
    metadata: {
      actor_user_id: userId,
      template_id: templateId,
      items_count: items.length,
      evidence_files_count: uploadedEvidencePaths.length,
    },
  });

  return NextResponse.json({ ok: true, submissionId: submission.id });
}

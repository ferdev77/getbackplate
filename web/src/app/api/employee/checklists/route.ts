import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { assertTenantModuleApi } from "@/shared/lib/access";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";

export async function GET(request: Request) {
  const moduleAccess = await assertTenantModuleApi("checklists", { allowBillingBypass: true });
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const url = new URL(request.url);
  const previewTemplateId = url.searchParams.get("preview")?.trim() ?? "";
  if (!previewTemplateId) {
    return NextResponse.json({ error: "Template inválido" }, { status: 400 });
  }

  const tenant = moduleAccess.tenant;
  const userId = moduleAccess.userId;
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("department_id, branch_id, position")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  const employeeBranchId = tenant.branchId ?? employeeRow?.branch_id ?? null;
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
    .select("id, name, branch_id, department_id, checklist_type, shift, repeat_every, is_active, target_scope")
    .eq("organization_id", tenant.organizationId)
    .eq("id", previewTemplateId)
    .eq("is_active", true)
    .maybeSingle();

  if (!template) {
    return NextResponse.json({ error: "Checklist no encontrado" }, { status: 404 });
  }

  const canAccess = canUseChecklistTemplateInTenant({
    roleCode: tenant.roleCode,
    userId,
    branchId: employeeBranchId,
    departmentId: employeeRow?.department_id ?? null,
    positionIds: employeePositionIds,
    templateBranchId: template.branch_id,
    templateDepartmentId: template.department_id,
    targetScope: template.target_scope,
  });

  if (!canAccess) {
    return NextResponse.json({ error: "Checklist no disponible para tu perfil" }, { status: 403 });
  }

  const scope =
    typeof template.target_scope === "object" && template.target_scope !== null
      ? (template.target_scope as Record<string, unknown>)
      : {};

  const locationIds = Array.isArray(scope.locations) ? scope.locations.map(String).filter(Boolean) : [];
  const departmentIds = Array.isArray(scope.department_ids) ? scope.department_ids.map(String).filter(Boolean) : [];
  const positionIds = Array.isArray(scope.position_ids) ? scope.position_ids.map(String).filter(Boolean) : [];
  const userScopeIds = Array.isArray(scope.users) ? scope.users.map(String).filter(Boolean) : [];

  const [
    { data: customBrandingEnabled },
    { data: scopeBranches },
    { data: scopeDepartments },
    { data: scopePositions },
    scopeUsers,
  ] = await Promise.all([
    admin.rpc("is_module_enabled", { org_id: tenant.organizationId, module_code: "custom_branding" }),
    locationIds.length > 0
      ? admin
          .from("branches")
          .select("id, name, city")
          .eq("organization_id", tenant.organizationId)
          .in("id", locationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; city: string | null }> }),
    departmentIds.length > 0
      ? admin
          .from("organization_departments")
          .select("id, name")
          .eq("organization_id", tenant.organizationId)
          .in("id", departmentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    positionIds.length > 0
      ? admin
          .from("department_positions")
          .select("id, name")
          .eq("organization_id", tenant.organizationId)
          .in("id", positionIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    userScopeIds.length > 0
      ? buildScopeUsersCatalog(tenant.organizationId)
      : Promise.resolve([]),
  ]);
  const branchNameById = new Map(
    (scopeBranches ?? []).map((row) => [row.id, customBrandingEnabled && row.city ? row.city : row.name]),
  );
  const departmentNameById = new Map((scopeDepartments ?? []).map((row) => [row.id, row.name]));
  const positionNameById = new Map((scopePositions ?? []).map((row) => [row.id, row.name]));
  const userNameById = new Map(
    scopeUsers
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, `${row.first_name} ${row.last_name}`.trim() || "Usuario"]),
  );

  const scopeLabels = {
    locations: locationIds.map((id) => branchNameById.get(id) ?? id),
    departments: departmentIds.map((id) => departmentNameById.get(id) ?? id),
    positions: positionIds.map((id) => positionNameById.get(id) ?? id),
    users: userScopeIds.map((id) => userNameById.get(id) ?? id),
  };

  const { data: previewSections } = await supabase
    .from("checklist_template_sections")
    .select("id, name, sort_order")
    .eq("organization_id", tenant.organizationId)
    .eq("template_id", template.id)
    .order("sort_order", { ascending: true });

  const previewSectionIds = (previewSections ?? []).map((section) => section.id);
  const { data: previewItems } = previewSectionIds.length
    ? await supabase
        .from("checklist_template_items")
        .select("id, section_id, label, priority, sort_order")
        .eq("organization_id", tenant.organizationId)
        .in("section_id", previewSectionIds)
        .order("sort_order", { ascending: true })
    : { data: null };

  const { data: latestSubmission } = await admin
    .from("checklist_submissions")
    .select("id, status, submitted_at")
    .eq("organization_id", tenant.organizationId)
    .eq("template_id", template.id)
    .eq("submitted_by", userId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: submissionItems } = latestSubmission
    ? await admin
        .from("checklist_submission_items")
        .select("id, template_item_id, is_checked, is_flagged")
        .eq("organization_id", tenant.organizationId)
        .eq("submission_id", latestSubmission.id)
    : { data: null };

  const submissionItemIds = (submissionItems ?? []).map((row) => row.id);
  const [{ data: submissionComments }, { data: submissionFlags }, { data: submissionAttachments }] =
    latestSubmission && submissionItemIds.length > 0
      ? await Promise.all([
          admin
            .from("checklist_item_comments")
            .select("submission_item_id, comment, created_at")
            .eq("organization_id", tenant.organizationId)
            .in("submission_item_id", submissionItemIds)
            .order("created_at", { ascending: false }),
          admin
            .from("checklist_flags")
            .select("submission_item_id, reason")
            .eq("organization_id", tenant.organizationId)
            .in("submission_item_id", submissionItemIds),
          admin
            .from("checklist_item_attachments")
            .select("submission_item_id, file_path")
            .eq("organization_id", tenant.organizationId)
            .in("submission_item_id", submissionItemIds),
        ])
      : [{ data: null }, { data: null }, { data: null }];

  const itemsBySection = new Map<string, Array<{ id: string; label: string; priority: string }>>();
  for (const item of previewItems ?? []) {
    const list = itemsBySection.get(item.section_id) ?? [];
    list.push({ id: item.id, label: item.label, priority: item.priority });
    itemsBySection.set(item.section_id, list);
  }

  const sections = (previewSections ?? []).map((section) => ({
    id: section.id,
    name: section.name,
    items: itemsBySection.get(section.id) ?? [],
  }));

  const commentBySubmissionItemId = new Map<string, string>();
  for (const row of submissionComments ?? []) {
    if (!commentBySubmissionItemId.has(row.submission_item_id)) {
      commentBySubmissionItemId.set(row.submission_item_id, row.comment);
    }
  }

  const reasonBySubmissionItemId = new Map((submissionFlags ?? []).map((row) => [row.submission_item_id, row.reason]));

  const attachmentUrlsBySubmissionItemId = new Map<string, string[]>();
  if ((submissionAttachments ?? []).length) {
    const bySubmissionItemId = new Map<string, string[]>();
    const allPaths: string[] = [];

    for (const attachment of submissionAttachments ?? []) {
      const currentPaths = bySubmissionItemId.get(attachment.submission_item_id) ?? [];
      currentPaths.push(attachment.file_path);
      bySubmissionItemId.set(attachment.submission_item_id, currentPaths);
      allPaths.push(attachment.file_path);
    }

    const signedByPath = new Map<string, string>();
    const chunkSize = 50;
    for (let index = 0; index < allPaths.length; index += chunkSize) {
      const chunk = allPaths.slice(index, index + chunkSize);
      const { data } = await admin.storage.from("checklist-evidence").createSignedUrls(chunk, 60 * 60 * 24);
      for (const row of data ?? []) {
        if (row.path && row.signedUrl) signedByPath.set(row.path, row.signedUrl);
      }
    }

    for (const [submissionItemId, paths] of bySubmissionItemId.entries()) {
      attachmentUrlsBySubmissionItemId.set(
        submissionItemId,
        paths.map((path) => signedByPath.get(path)).filter((value): value is string => Boolean(value)),
      );
    }
  }

  const reportItemByTemplateItemId = new Map<string, { checked: boolean; flagged: boolean; comment: string; photos: string[] }>();
  for (const row of submissionItems ?? []) {
    const comment = commentBySubmissionItemId.get(row.id) ?? reasonBySubmissionItemId.get(row.id) ?? "";
    const photos = attachmentUrlsBySubmissionItemId.get(row.id) ?? [];
    reportItemByTemplateItemId.set(row.template_item_id, {
      checked: row.is_checked,
      flagged: row.is_flagged,
      comment,
      photos,
    });
  }

  return NextResponse.json({
    template: {
      id: template.id,
      name: template.name,
      checklist_type: template.checklist_type,
      shift: template.shift,
      repeat_every: template.repeat_every,
      is_active: template.is_active,
      target_scope: template.target_scope,
      scope_labels: scopeLabels,
    },
    sections,
    initialReport: latestSubmission
      ? {
          submittedAt: latestSubmission.submitted_at,
          status: latestSubmission.status,
          items: Object.fromEntries(reportItemByTemplateItemId.entries()),
        }
      : null,
  });
}

import Link from "next/link";
import { ClipboardCheck, Eye } from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { EmployeeChecklistRealtimeRefresh } from "@/modules/checklists/ui/employee-checklist-realtime-refresh";
import { EmployeeChecklistPreviewModal } from "@/modules/checklists/ui/employee-checklist-preview-modal";
import { RestoreChecklistScroll } from "@/modules/checklists/ui/restore-checklist-scroll";
import { requireEmployeeModule } from "@/shared/lib/access";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";

export const dynamic = "force-dynamic";

type EmployeeChecklistPageProps = {
  searchParams: Promise<{ preview?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatSubmittedAt(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reportStatusBadge(status: string | null | undefined) {
  if (status === "reviewed") {
    return {
      label: "Reporte revisado",
      className: "border-[color:color-mix(in_oklab,var(--gbp-violet)_30%,transparent)] bg-[var(--gbp-violet-soft)] text-[var(--gbp-violet)]",
      dotClassName: "bg-[var(--gbp-violet)]",
      dateClassName: "text-[var(--gbp-text2)]",
    };
  }

  return {
    label: "Reporte enviado",
    className: "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]",
    dotClassName: "bg-[var(--gbp-success)]",
    dateClassName: "text-[var(--gbp-text2)]",
  };
}

export default async function EmployeeChecklistPage({ searchParams }: EmployeeChecklistPageProps) {
  const tenant = await requireEmployeeModule("checklists");
  const params = await searchParams;
  const previewTemplateId = firstParam(params.preview).trim();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    return null;
  }

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

  const { data: templates } = await supabase
    .from("checklist_templates")
    .select("id, name, branch_id, department_id, target_scope, updated_at")
    .eq("organization_id", tenant.organizationId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(50);

  const visibleTemplates = (templates ?? []).filter((template) =>
    canUseChecklistTemplateInTenant({
      roleCode: tenant.roleCode,
      userId,
      branchId: employeeBranchId,
      departmentId: employeeRow?.department_id ?? null,
      positionIds: employeePositionIds,
      templateBranchId: template.branch_id,
      templateDepartmentId: template.department_id,
      targetScope: template.target_scope,
    }),
  );

  const visibleTemplateIds = visibleTemplates.map((template) => template.id);
  const [{ data: visibleSubmissions }, { data: scheduledJobs }] = visibleTemplateIds.length
    ? await Promise.all([
        admin
          .from("checklist_submissions")
          .select("template_id, status, submitted_at")
          .eq("organization_id", tenant.organizationId)
          .eq("submitted_by", userId)
          .in("template_id", visibleTemplateIds)
          .order("submitted_at", { ascending: false }),
        admin
          .from("scheduled_jobs")
          .select("target_id, last_run_at")
          .eq("organization_id", tenant.organizationId)
          .eq("job_type", "checklist_generator")
          .in("target_id", visibleTemplateIds)
      ])
    : [{ data: null }, { data: null }];

  const lastRunByTemplateId = new Map<string, Date | null>();
  for (const job of scheduledJobs ?? []) {
    lastRunByTemplateId.set(job.target_id, job.last_run_at ? new Date(job.last_run_at) : null);
  }

  const latestSubmissionByTemplateId = new Map<string, { status: string; submittedAt: string | null }>();
  for (const row of visibleSubmissions ?? []) {
    if (!latestSubmissionByTemplateId.has(row.template_id)) {
      latestSubmissionByTemplateId.set(row.template_id, {
        status: row.status,
        submittedAt: row.submitted_at,
      });
    }
  }

  function isTemplateSentForCurrentPeriod(templateId: string) {
    const latest = latestSubmissionByTemplateId.get(templateId);
    if (!latest) return false;
    
    // If there is no scheduled job or it hasn't run yet, just knowing it was submitted once is enough
    const lastRunAt = lastRunByTemplateId.get(templateId);
    if (!lastRunAt) return true;

    // It's sent for the current period if the last submission was AFTER the last cron run
    const submittedAt = new Date(latest.submittedAt || 0);
    return submittedAt >= lastRunAt;
  }

  const templatesForDisplay = [...visibleTemplates].sort((a, b) => {
    const aSent = isTemplateSentForCurrentPeriod(a.id);
    const bSent = isTemplateSentForCurrentPeriod(b.id);
    if (aSent === bSent) return 0;
    return aSent ? 1 : -1;
  });

  const previewTemplate = previewTemplateId
    ? visibleTemplates.find((template) => template.id === previewTemplateId) ?? null
    : null;

  const { data: previewSections } = previewTemplate
    ? await supabase
        .from("checklist_template_sections")
        .select("id, name, sort_order")
        .eq("organization_id", tenant.organizationId)
        .eq("template_id", previewTemplate.id)
        .order("sort_order", { ascending: true })
    : { data: null };

  const previewSectionIds = (previewSections ?? []).map((section) => section.id);

  const { data: previewItems } = previewTemplate && previewSectionIds.length > 0
    ? await supabase
        .from("checklist_template_items")
        .select("id, section_id, label, priority, sort_order")
        .eq("organization_id", tenant.organizationId)
        .in("section_id", previewSectionIds)
        .order("sort_order", { ascending: true })
    : { data: null };

  const { data: latestSubmission } = previewTemplate
    ? await admin
        .from("checklist_submissions")
        .select("id, status, submitted_at")
        .eq("organization_id", tenant.organizationId)
        .eq("template_id", previewTemplate.id)
        .eq("submitted_by", userId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

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

  const previewSectionViews = (previewSections ?? []).map((section) => ({
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
        if (row.path && row.signedUrl) {
          signedByPath.set(row.path, row.signedUrl);
        }
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

  return (
    <main>
      <EmployeeChecklistRealtimeRefresh organizationId={tenant.organizationId} userId={userId} />
      <RestoreChecklistScroll />
      <section className="mb-5 rounded-2xl border border-[var(--gbp-border)] bg-gradient-to-r from-[var(--gbp-surface)] to-[var(--gbp-bg)] p-6">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--gbp-text2)] uppercase">Checklist asignado</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Tus checklists visibles</h1>
          <span className="inline-flex rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] px-3 py-1 text-xs font-semibold text-[var(--gbp-accent)]">
            {visibleTemplates.length} visible(s)
          </span>
        </div>
      </section>

      <section className="space-y-3">
        {templatesForDisplay.map((template) => (
          <article key={template.id} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 transition-all duration-200 hover:-translate-y-[1px] hover:border-[var(--gbp-border2)] hover:shadow-[0_8px_24px_rgba(0,0,0,.05)]">
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-[var(--gbp-text)]">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-[var(--gbp-accent)]" />
                <p className="truncate text-base font-semibold">{template.name}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isTemplateSentForCurrentPeriod(template.id) ? (
                  (() => {
                    const latest = latestSubmissionByTemplateId.get(template.id);
                    const statusBadge = reportStatusBadge(latest?.status);
                    return (
                      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${statusBadge.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClassName}`} />
                        <span>{statusBadge.label}</span>
                        <span className={`hidden sm:inline ${statusBadge.dateClassName}`}>· {formatSubmittedAt(latest?.submittedAt ?? null)}</span>
                      </div>
                    );
                  })()
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] px-3 py-1.5 text-[11px] font-semibold text-[var(--gbp-accent)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--gbp-accent)]" />
                    <span>Reporte pendiente</span>
                  </div>
                )}
                <Link href={`/portal/checklist?preview=${template.id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--gbp-success)_18%,transparent)]" title="Ver checklist">
                  <Eye className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </article>
        ))}

        {!visibleTemplates.length ? (
          <div className="rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">
            No tienes checklists asignados para tu perfil.
          </div>
        ) : null}
      </section>

      {previewTemplate ? (
        <EmployeeChecklistPreviewModal
          templateId={previewTemplate.id}
          templateName={previewTemplate.name}
          sections={previewSectionViews}
          initialReport={
            latestSubmission
              ? {
                  submittedAt: latestSubmission.submitted_at,
                  status: latestSubmission.status,
                  items: Object.fromEntries(reportItemByTemplateItemId.entries()),
                }
              : null
          }
        />
      ) : null}
    </main>
  );
}

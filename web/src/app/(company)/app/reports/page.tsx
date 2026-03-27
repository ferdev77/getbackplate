import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { ChecklistReportsDashboard, type ChecklistReportView } from "@/modules/reports/ui/checklist-reports-dashboard";
import { requireTenantModule } from "@/shared/lib/access";



type ReportStatCard = {
  label: string;
  value: string;
  subLabel: string;
  icon: string;
  tone: "default" | "success" | "warning" | "muted";
};

type LocationCard = {
  branchId: string;
  branchName: string;
  cityLabel: string;
  status: "ok" | "warn" | "none";
  badge: string;
  managerName: string;
  managerInitials: string;
  managerColor: string;
  sentAtLabel: string;
  metrics: {
    total: number;
    done: number;
    attention: number;
    photos: number;
  };
  reportId: string | null;
};

type AttentionFeedItem = {
  id: string;
  reportId: string;
  task: string;
  note: string;
  managerShort: string;
  timeLabel: string;
  locationShort: string;
  resolved: boolean;
};

type ReportCategoryItem = {
  id: string;
  text: string;
  ok: boolean;
  flag: boolean;
  note?: string;
  photosCount: number;
  photos?: string[];
  itemOrder: number;
};

type ReportCategory = {
  id: string;
  name: string;
  items: ReportCategoryItem[];
};

function initials(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!tokens.length) return "EM";
  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

function shortName(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "Empleado";
  if (tokens.length === 1) return tokens[0] ?? "Empleado";
  return `${tokens[0]} ${(tokens[1]?.[0] ?? "").toUpperCase()}.`;
}

function formatTimeLabel(value: string | null) {
  if (!value) return "Sin hora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin hora";
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(value: string | null, todayStart: Date) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  if (date >= todayStart) return "Hoy";
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  if (date >= yesterdayStart) return "Ayer";
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function relativeFromNow(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMin < 60) return `hace ${diffMin}m`;
  const hours = Math.round(diffMin / 60);
  return `hace ${hours}h`;
}

function colorForUser(userId: string) {
  const palette = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d97706", "#0f766e"];
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length] ?? palette[0];
}

export default async function CompanyReportsPage() {
  const tenant = await requireTenantModule("reports");
  const supabase = await createSupabaseServerClient();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - 14);

  const [{ data: branches }, { data: submissions }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, city, state")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("checklist_submissions")
      .select("id, branch_id, template_id, submitted_by, status, submitted_at, created_at")
      .eq("organization_id", tenant.organizationId)
      .gte("created_at", lookbackStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const submissionIds = (submissions ?? []).map((row) => row.id);
  const submittedByUserIds = [...new Set((submissions ?? []).map((row) => row.submitted_by).filter(Boolean))];
  const templateIds = [...new Set((submissions ?? []).map((row) => row.template_id).filter(Boolean))];

  const [{ data: employees }, { data: userProfiles }, { data: templates }, { data: submissionItems }] = await Promise.all([
    submittedByUserIds.length
      ? supabase
          .from("employees")
          .select("user_id, first_name, last_name")
          .eq("organization_id", tenant.organizationId)
          .in("user_id", submittedByUserIds)
      : Promise.resolve({ data: null }),
    submittedByUserIds.length
      ? supabase
          .from("organization_user_profiles")
          .select("user_id, first_name, last_name")
          .eq("organization_id", tenant.organizationId)
          .in("user_id", submittedByUserIds)
      : Promise.resolve({ data: null }),
    templateIds.length
      ? supabase
          .from("checklist_templates")
          .select("id, name")
          .eq("organization_id", tenant.organizationId)
          .in("id", templateIds)
      : Promise.resolve({ data: null }),
    submissionIds.length
      ? supabase
          .from("checklist_submission_items")
          .select("id, submission_id, template_item_id, is_checked, is_flagged")
          .eq("organization_id", tenant.organizationId)
          .in("submission_id", submissionIds)
      : Promise.resolve({ data: null }),
  ]);

  const submissionItemIds = (submissionItems ?? []).map((row) => row.id);
  const templateItemIds = [...new Set((submissionItems ?? []).map((row) => row.template_item_id).filter(Boolean))];

  const [{ data: itemComments }, { data: itemFlags }, { data: itemAttachments }, { data: templateItems }] = await Promise.all([
    submissionItemIds.length
      ? supabase
          .from("checklist_item_comments")
          .select("submission_item_id, comment, created_at")
          .eq("organization_id", tenant.organizationId)
          .in("submission_item_id", submissionItemIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    submissionItemIds.length
      ? supabase
          .from("checklist_flags")
          .select("submission_item_id, reason, status, created_at")
          .eq("organization_id", tenant.organizationId)
          .in("submission_item_id", submissionItemIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    submissionItemIds.length
      ? supabase
          .from("checklist_item_attachments")
          .select("submission_item_id, file_path")
          .eq("organization_id", tenant.organizationId)
          .in("submission_item_id", submissionItemIds)
      : Promise.resolve({ data: null }),
    templateItemIds.length
      ? supabase
          .from("checklist_template_items")
          .select("id, section_id, label, sort_order")
          .eq("organization_id", tenant.organizationId)
          .in("id", templateItemIds)
      : Promise.resolve({ data: null }),
  ]);

  const sectionIds = [...new Set((templateItems ?? []).map((item) => item.section_id).filter(Boolean))];
  const { data: templateSections } = sectionIds.length
    ? await supabase
        .from("checklist_template_sections")
        .select("id, template_id, name, sort_order")
        .eq("organization_id", tenant.organizationId)
        .in("id", sectionIds)
    : { data: null };

  const employeeNameByUserId = new Map<string, string>();
  for (const row of employees ?? []) {
    employeeNameByUserId.set(row.user_id, `${row.first_name} ${row.last_name}`.trim());
  }

  for (const row of userProfiles ?? []) {
    const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
    if (!row.user_id || !fullName) continue;
    if (!employeeNameByUserId.has(row.user_id)) {
      employeeNameByUserId.set(row.user_id, fullName);
    }
  }

  const templateNameById = new Map((templates ?? []).map((row) => [row.id, row.name]));
  const branchById = new Map((branches ?? []).map((row) => [row.id, row]));

  const latestCommentBySubmissionItemId = new Map<string, string>();
  const commentCountBySubmissionItemId = new Map<string, number>();
  for (const row of itemComments ?? []) {
    if (!latestCommentBySubmissionItemId.has(row.submission_item_id)) {
      latestCommentBySubmissionItemId.set(row.submission_item_id, row.comment);
    }
    commentCountBySubmissionItemId.set(
      row.submission_item_id,
      (commentCountBySubmissionItemId.get(row.submission_item_id) ?? 0) + 1,
    );
  }

  const latestFlagBySubmissionItemId = new Map<string, { reason: string; status: string }>();
  for (const row of itemFlags ?? []) {
    if (!latestFlagBySubmissionItemId.has(row.submission_item_id)) {
      latestFlagBySubmissionItemId.set(row.submission_item_id, { reason: row.reason, status: row.status });
    }
  }

  const attachmentCountBySubmissionItemId = new Map<string, number>();
  const attachmentUrlsBySubmissionItemId = new Map<string, string[]>();
  for (const row of itemAttachments ?? []) {
    attachmentCountBySubmissionItemId.set(
      row.submission_item_id,
      (attachmentCountBySubmissionItemId.get(row.submission_item_id) ?? 0) + 1,
    );
    const urls = attachmentUrlsBySubmissionItemId.get(row.submission_item_id) ?? [];
    if (row.file_path) {
      const { data } = supabase.storage.from("checklist-evidence").getPublicUrl(row.file_path);
      urls.push(data.publicUrl);
    }
    attachmentUrlsBySubmissionItemId.set(row.submission_item_id, urls);
  }

  const sectionById = new Map(
    (templateSections ?? []).map((row) => [row.id, { name: row.name, sortOrder: row.sort_order, templateId: row.template_id }]),
  );

  const itemMetaById = new Map(
    (templateItems ?? []).map((item) => {
      const section = sectionById.get(item.section_id);
      return [
        item.id,
        {
          label: item.label,
          sectionName: section?.name ?? "General",
          sectionOrder: section?.sortOrder ?? 999,
          itemOrder: item.sort_order,
        },
      ];
    }),
  );

  const itemsBySubmissionId = new Map<string, Array<{ id: string; templateItemId: string; checked: boolean; flagged: boolean }>>();
  const metricsBySubmissionId = new Map<string, { total: number; done: number; flagged: number; photos: number; comments: number }>();

  for (const row of submissionItems ?? []) {
    const list = itemsBySubmissionId.get(row.submission_id) ?? [];
    list.push({ id: row.id, templateItemId: row.template_item_id, checked: row.is_checked, flagged: row.is_flagged });
    itemsBySubmissionId.set(row.submission_id, list);

    const metrics = metricsBySubmissionId.get(row.submission_id) ?? { total: 0, done: 0, flagged: 0, photos: 0, comments: 0 };
    metrics.total += 1;
    metrics.done += row.is_checked ? 1 : 0;
    metrics.flagged += row.is_flagged ? 1 : 0;
    metrics.photos += attachmentCountBySubmissionItemId.get(row.id) ?? 0;
    metrics.comments += commentCountBySubmissionItemId.get(row.id) ?? 0;
    metricsBySubmissionId.set(row.submission_id, metrics);
  }

  const reports: ChecklistReportView[] = (submissions ?? []).map((submission) => {
    const timestamp = submission.submitted_at ?? submission.created_at;
    const branch = submission.branch_id ? branchById.get(submission.branch_id) : null;
    const managerName = employeeNameByUserId.get(submission.submitted_by) ?? "Usuario";
    const managerInitials = initials(managerName);
    const managerColor = colorForUser(submission.submitted_by);
    const metrics = metricsBySubmissionId.get(submission.id) ?? { total: 0, done: 0, flagged: 0, photos: 0, comments: 0 };

    const sectionMap = new Map<string, { id: string; name: string; order: number; items: ReportCategoryItem[] }>();

    for (const submissionItem of itemsBySubmissionId.get(submission.id) ?? []) {
      const itemMeta = itemMetaById.get(submissionItem.templateItemId);
      const sectionName = itemMeta?.sectionName ?? "General";
      const sectionOrder = itemMeta?.sectionOrder ?? 999;
      const section: { id: string; name: string; order: number; items: ReportCategoryItem[] } =
        sectionMap.get(sectionName) ?? {
          id: sectionName.toLowerCase().replace(/\s+/g, "-"),
          name: sectionName,
          order: sectionOrder,
          items: [] as ReportCategoryItem[],
        };

      const flag = latestFlagBySubmissionItemId.get(submissionItem.id);
      const comment = latestCommentBySubmissionItemId.get(submissionItem.id) ?? "";
      section.items.push({
        id: submissionItem.id,
        text: itemMeta?.label ?? "Item",
        ok: submissionItem.checked,
        flag: submissionItem.flagged,
        note: flag?.reason ?? comment,
        photosCount: attachmentCountBySubmissionItemId.get(submissionItem.id) ?? 0,
        photos: attachmentUrlsBySubmissionItemId.get(submissionItem.id) ?? [],
        itemOrder: itemMeta?.itemOrder ?? 999,
      });

      sectionMap.set(sectionName, section);
    }

    const categories: ReportCategory[] = [...sectionMap.values()]
      .sort((a, b) => a.order - b.order)
      .map((section) => ({
        id: section.id,
        name: section.name,
        items: section.items.sort((a, b) => a.itemOrder - b.itemOrder),
      }));

    const attentionItems = categories
      .flatMap((category) =>
        category.items
          .filter((item) => item.flag)
          .map((item) => ({
            id: item.id,
            task: item.text,
            note: item.note ?? "",
            category: category.name,
          })),
      )
      .slice(0, 20);

    return {
      id: submission.id,
      branchId: submission.branch_id,
      locationName: branch?.name ?? "Global",
      locationShort: (branch?.name ?? "Global").split(" ")[0] ?? "Global",
      cityLabel: [branch?.city, branch?.state].filter(Boolean).join(", "),
      managerName,
      managerShort: shortName(managerName),
      managerInitials,
      managerColor,
      dateLabel: formatDateLabel(timestamp, todayStart),
      timeLabel: formatTimeLabel(timestamp),
      submittedAtIso: timestamp,
      templateName: templateNameById.get(submission.template_id) ?? "Checklist",
      totalItems: metrics.total,
      completedItems: metrics.done,
      flaggedItems: metrics.flagged,
      commentsCount: metrics.comments,
      photosCount: metrics.photos,
      status: metrics.flagged > 0 ? "warn" : "ok",
      dbStatus: submission.status,
      categories,
      attentionItems,
    };
  });

  const todayReports = reports.filter((report) => {
    if (!report.submittedAtIso) return false;
    const date = new Date(report.submittedAtIso);
    return !Number.isNaN(date.getTime()) && date >= todayStart;
  });

  const todayReportByBranch = new Map<string, ChecklistReportView>();
  for (const report of todayReports) {
    if (!report.branchId) continue;
    if (!todayReportByBranch.has(report.branchId)) {
      todayReportByBranch.set(report.branchId, report);
    }
  }

  const locationCards: LocationCard[] = (branches ?? []).map((branch) => {
    const report = todayReportByBranch.get(branch.id);
    if (!report) {
      return {
        branchId: branch.id,
        branchName: branch.name,
        cityLabel: [branch.city, branch.state].filter(Boolean).join(", "),
        status: "none",
        badge: "⚠ Sin reporte",
        managerName: "Sin envío",
        managerInitials: "--",
        managerColor: "#9ca3af",
        sentAtLabel: "No ha enviado reporte",
        metrics: { total: 0, done: 0, attention: 0, photos: 0 },
        reportId: null,
      };
    }

    return {
      branchId: branch.id,
      branchName: branch.name,
      cityLabel: report.cityLabel,
      status: report.flaggedItems > 0 ? "warn" : "ok",
      badge: report.flaggedItems > 0 ? `⚑ ${report.flaggedItems} atención` : "✓ Completo",
      managerName: report.managerName,
      managerInitials: report.managerInitials,
      managerColor: report.managerColor,
      sentAtLabel: `Enviado ${report.timeLabel}${relativeFromNow(report.submittedAtIso) ? ` · ${relativeFromNow(report.submittedAtIso)}` : ""}`,
      metrics: {
        total: report.totalItems,
        done: report.completedItems,
        attention: report.flaggedItems,
        photos: report.photosCount,
      },
      reportId: report.id,
    };
  });

  const branchesWithReportToday = locationCards.filter((card) => card.reportId).length;
  const completedToday = todayReports.filter((report) => report.flaggedItems === 0).length;
  const attentionToday = todayReports.reduce((sum, report) => sum + report.flaggedItems, 0);
  const noReportToday = Math.max((branches ?? []).length - branchesWithReportToday, 0);
  const noReportBranch = locationCards.find((card) => card.status === "none")?.branchName ?? "Sin pendiente";

  const statCards: ReportStatCard[] = [
    {
      icon: "📋",
      label: "Reportes hoy",
      value: String(branchesWithReportToday),
      subLabel: `de ${(branches ?? []).length} ubicaciones`,
      tone: "default",
    },
    {
      icon: "✅",
      label: "Completados",
      value: String(completedToday),
      subLabel: completedToday > 0 ? "Sin novedades" : "Sin reportes completos",
      tone: "success",
    },
    {
      icon: "⚑",
      label: "Para atencion",
      value: String(attentionToday),
      subLabel: `items en ${todayReports.filter((row) => row.flaggedItems > 0).length} reportes`,
      tone: "warning",
    },
    {
      icon: "⏳",
      label: "Sin reporte",
      value: String(noReportToday),
      subLabel: noReportToday > 0 ? noReportBranch : "Todo al día",
      tone: "muted",
    },
  ];

  const attentionFeed: AttentionFeedItem[] = reports
    .flatMap((report) =>
      report.attentionItems.map((item) => ({
        id: `${report.id}-${item.id}`,
        reportId: report.id,
        task: item.task,
        note: item.note,
        managerShort: report.managerShort,
        timeLabel: report.timeLabel,
        locationShort: report.locationShort,
        resolved: report.dbStatus === "reviewed",
      })),
    )
    .slice(0, 10);

  return (
    <ChecklistReportsDashboard
      organizationId={tenant.organizationId}
      generatedAt={now.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
      statCards={statCards}
      locationCards={locationCards}
      reports={reports}
      attentionFeed={attentionFeed}
    />
  );
}

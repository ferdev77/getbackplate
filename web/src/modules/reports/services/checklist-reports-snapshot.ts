import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { getEnabledModules } from "@/modules/organizations/queries";

type ReportStatCard = {
  label: string;
  value: string;
  subLabel: string;
  icon: string;
  tone: "default" | "success" | "warning" | "muted";
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

type ReportView = {
  id: string;
  branchId: string | null;
  locationName: string;
  locationShort: string;
  cityLabel: string;
  managerName: string;
  managerShort: string;
  managerInitials: string;
  managerColor: string;
  dateLabel: string;
  timeLabel: string;
  submittedAtIso: string | null;
  templateName: string;
  /** Null cuando la plantilla fue eliminada; el nombre sigue en templateName. */
  templateId: string | null;
  totalItems: number;
  completedItems: number;
  flaggedItems: number;
  commentsCount: number;
  photosCount: number;
  status: "ok" | "warn";
  dbStatus: string;
  categories: Array<{
    id: string;
    name: string;
    items: Array<{
      id: string;
      text: string;
      ok: boolean;
      flag: boolean;
      note?: string;
      photosCount: number;
      photos?: string[];
      itemOrder: number;
    }>;
  }>;
  attentionItems: Array<{
    id: string;
    task: string;
    note: string;
    category: string;
  }>;
};

// Los de abajo son puros y se exportan para poder probarlos: son los que
// deciden como se lee un reporte (iniciales, "Hoy"/"Ayer", "hace 2h") y donde
// se esconden los errores de borde de fechas.
export function initials(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!tokens.length) return "EM";
  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

export function shortName(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "Empleado";
  if (tokens.length === 1) return tokens[0] ?? "Empleado";
  return `${tokens[0]} ${(tokens[1]?.[0] ?? "").toUpperCase()}.`;
}

function formatTimeLabel(value: string | null) {
  if (!value) return "Sin hora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin hora";
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateLabel(value: string | null, todayStart: Date) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  if (date >= todayStart) return "Hoy";
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  if (date >= yesterdayStart) return "Ayer";
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" });
}

export function relativeFromNow(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMin < 60) return `hace ${diffMin}m`;
  const hours = Math.round(diffMin / 60);
  return `hace ${hours}h`;
}

/**
 * El color del circulo con las iniciales de cada persona: el de identidad de
 * la plataforma, uno solo para todos.
 *
 * Antes se elegia de una paleta de seis segun un hash del usuario, y ahi habia
 * dos problemas. El visible: cuatro de los seis estaban escritos con guiones
 * bajos -- `color-mix(in_oklab,...)`, la forma de Tailwind para las clases
 * arbitrarias, no CSS -- asi que el navegador los descartaba y el circulo
 * quedaba sin fondo, con el texto blanco sobre blanco. El de fondo: la paleta
 * mezclaba el verde de `--gbp-success`, que en el resto del sistema significa
 * "todo bien", no "esta persona". Un avatar verde al lado de uno naranja se
 * leia como un estado.
 *
 * Quien es cada uno lo dicen las iniciales y el nombre al lado; el color no
 * tenia que aportar eso. Se usa `var(--gbp-accent)` y no un valor fijo para que
 * acompañe al tema activo -- cambia entre claro y oscuro, y entre los temas
 * alternativos de la app.
 *
 * Ya no recibe el usuario: dejaria un parametro que no se usa, y el dia que se
 * vuelva a distinguir por persona se agrega de nuevo.
 */
export function colorForUser() {
  return "var(--gbp-accent)";
}

export function resolveChecklistHistoryItemMeta(
  snapshot: {
    sectionId: string | null;
    sectionName: string | null;
    sectionOrder: number | null;
    itemOrder: number | null;
    itemLabel: string | null;
  },
  live: {
    sectionId: string;
    sectionName: string;
    sectionOrder: number;
    itemOrder: number;
    label: string;
  } | undefined,
) {
  return {
    sectionKey: snapshot.sectionId ?? live?.sectionId ?? "general",
    sectionName: snapshot.sectionName ?? live?.sectionName ?? "General",
    sectionOrder: snapshot.sectionOrder ?? live?.sectionOrder ?? 999,
    itemOrder: snapshot.itemOrder ?? live?.itemOrder ?? 999,
    label: snapshot.itemLabel ?? live?.label ?? "Item",
  };
}

type BuildChecklistReportsSnapshotParams = {
  supabase: SupabaseClient;
  organizationId: string;
  templateCreatorUserId?: string;
  visibleBranchIds?: string[];
};

const EVIDENCE_BUCKET = "checklist-evidence";
/** Lo mismo que usa el portal del empleado para estas fotos. */
const EVIDENCE_URL_TTL_SECONDS = 60 * 60 * 24;

/**
 * Los enlaces de las fotos de evidencia, firmados.
 *
 * Antes se armaban con `getPublicUrl`, que no consulta nada: solo concatena la
 * ruta /object/public/. El bucket es privado a proposito -- el alta lo fuerza a
 * `public: false` en cada envio (ver api/employee/checklists/submit) -- asi que
 * esa URL devolvia 400 y la foto se veia rota en las dos pantallas de reportes,
 * la del panel y la del portal. La foto estaba subida y guardada; lo unico malo
 * era el enlace.
 *
 * Se firma con el cliente admin y no con el que llego por parametro: el bucket
 * no tiene policies de storage (no hay ninguna migracion que las defina), asi
 * que una sesion de usuario no puede firmar. De los tres llamadores, dos pasan
 * el admin y `/api/company/reports` pasa el de sesion; resolviendolo aca adentro
 * ninguno puede volver a romperlo por elegir el cliente equivocado.
 *
 * Quien llega hasta aca ya paso el control de acceso del modulo y el snapshot
 * filtra por organizacion, igual que en el portal.
 */
export async function firmarEvidencias(pathsBySubmissionItemId: Map<string, string[]>) {
  const urlsBySubmissionItemId = new Map<string, string[]>();
  const allPaths = [...pathsBySubmissionItemId.values()].flat();
  if (!allPaths.length) return urlsBySubmissionItemId;

  const admin = createSupabaseAdminClient();
  const signedByPath = new Map<string, string>();
  const chunkSize = 50;

  for (let index = 0; index < allPaths.length; index += chunkSize) {
    const chunk = allPaths.slice(index, index + chunkSize);
    const { data } = await admin.storage.from(EVIDENCE_BUCKET).createSignedUrls(chunk, EVIDENCE_URL_TTL_SECONDS);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) signedByPath.set(row.path, row.signedUrl);
    }
  }

  for (const [submissionItemId, paths] of pathsBySubmissionItemId.entries()) {
    urlsBySubmissionItemId.set(
      submissionItemId,
      paths.map((path) => signedByPath.get(path)).filter((value): value is string => Boolean(value)),
    );
  }

  return urlsBySubmissionItemId;
}

export async function buildChecklistReportsSnapshot({
  supabase,
  organizationId,
  templateCreatorUserId,
  visibleBranchIds,
}: BuildChecklistReportsSnapshotParams) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - 14);

  const branchScopeProvided = Array.isArray(visibleBranchIds);
  const scopedBranchIds = [...new Set((visibleBranchIds ?? []).map((value) => value.trim()).filter(Boolean))];

  const branchesQuery = supabase
    .from("branches")
    .select("id, name, city, state")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  const { data: branches } = branchScopeProvided
    ? (scopedBranchIds.length
      ? await branchesQuery.in("id", scopedBranchIds)
      : { data: [] as Array<{ id: string; name: string; city: string | null; state: string | null }> })
    : await branchesQuery;

  let scopedTemplateIds: string[] = [];
  if (templateCreatorUserId) {
    const { data: ownedTemplates } = await supabase
      .from("checklist_templates")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("created_by", templateCreatorUserId)
      .limit(5000);

    scopedTemplateIds = (ownedTemplates ?? []).map((row) => row.id);
  }

  let submissionsQuery = supabase
    .from("checklist_submissions")
    .select("id, branch_id, template_id, template_id_snapshot, template_name, template_created_by, submitted_by, status, submitted_at, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", lookbackStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(120);

  if (branchScopeProvided && scopedBranchIds.length > 0) {
    submissionsQuery = submissionsQuery.in("branch_id", scopedBranchIds);
  }

  let submissions: Array<{
    id: string;
    branch_id: string | null;
    // Queda en null cuando la plantilla se elimino; el nombre lo aporta
    // template_name, copiado al responder.
    template_id: string | null;
    template_id_snapshot: string | null;
    template_name: string | null;
    template_created_by: string | null;
    submitted_by: string;
    status: string;
    submitted_at: string | null;
    created_at: string;
  }> = [];

  if (branchScopeProvided && scopedBranchIds.length === 0) {
    submissions = [];
  } else {
    if (templateCreatorUserId) {
      submissionsQuery = scopedTemplateIds.length
        ? submissionsQuery.or(
            `template_created_by.eq.${templateCreatorUserId},and(template_created_by.is.null,template_id.in.(${scopedTemplateIds.join(",")}))`,
          )
        : submissionsQuery.eq("template_created_by", templateCreatorUserId);
    }
    const { data } = await submissionsQuery;
    submissions = (data ?? []) as typeof submissions;
  }

  const submissionIds = submissions.map((row) => row.id);
  const submittedByUserIds = [...new Set(submissions.map((row) => row.submitted_by).filter(Boolean))];
  const templateIds = [...new Set(submissions.map((row) => row.template_id).filter(Boolean))];

  const [{ data: employees }, { data: userProfiles }, { data: templates }, { data: submissionItems }] = await Promise.all([
    submittedByUserIds.length
      ? supabase
          .from("employees")
          .select("user_id, first_name, last_name")
          .eq("organization_id", organizationId)
          .in("user_id", submittedByUserIds)
      : Promise.resolve({ data: null }),
    submittedByUserIds.length
      ? supabase
          .from("organization_user_profiles")
          .select("user_id, first_name, last_name")
          .eq("organization_id", organizationId)
          .in("user_id", submittedByUserIds)
      : Promise.resolve({ data: null }),
    templateIds.length
      ? supabase
          .from("checklist_templates")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("id", templateIds)
      : Promise.resolve({ data: null }),
    submissionIds.length
      ? supabase
          .from("checklist_submission_items")
          .select("id, submission_id, template_item_id, item_label, section_id_snapshot, section_name, section_sort_order, item_sort_order, is_checked, is_flagged")
          .eq("organization_id", organizationId)
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
          .eq("organization_id", organizationId)
          .in("submission_item_id", submissionItemIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    submissionItemIds.length
      ? supabase
          .from("checklist_flags")
          .select("submission_item_id, reason, status, created_at")
          .eq("organization_id", organizationId)
          .in("submission_item_id", submissionItemIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    submissionItemIds.length
      ? supabase
          .from("checklist_item_attachments")
          .select("submission_item_id, file_path")
          .eq("organization_id", organizationId)
          .in("submission_item_id", submissionItemIds)
      : Promise.resolve({ data: null }),
    templateItemIds.length
      ? supabase
          .from("checklist_template_items")
          .select("id, section_id, label, sort_order")
          .eq("organization_id", organizationId)
          .in("id", templateItemIds)
      : Promise.resolve({ data: null }),
  ]);

  const sectionIds = [...new Set((templateItems ?? []).map((item) => item.section_id).filter(Boolean))];
  const { data: templateSections } = sectionIds.length
    ? await supabase
        .from("checklist_template_sections")
        .select("id, template_id, name, sort_order")
        .eq("organization_id", organizationId)
        .in("id", sectionIds)
    : { data: null };

  const employeeNameByUserId = new Map<string, string>();
  for (const row of employees ?? []) {
    employeeNameByUserId.set(row.user_id, `${row.first_name} ${row.last_name}`.trim());
  }
  for (const row of userProfiles ?? []) {
    const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
    if (!row.user_id || !fullName) continue;
    if (!employeeNameByUserId.has(row.user_id)) employeeNameByUserId.set(row.user_id, fullName);
  }

  const templateNameById = new Map((templates ?? []).map((row) => [row.id, row.name]));
  const branchById = new Map((branches ?? []).map((row) => [row.id, row]));
  const enabledModules = await getEnabledModules(organizationId);
  const customBrandingEnabled = enabledModules.has("custom_branding");
  const branchDisplayName = (branch: { name: string; city?: string | null } | null | undefined) => {
    if (!branch) return "Global";
    return customBrandingEnabled && branch.city ? branch.city : branch.name;
  };

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
  const pathsBySubmissionItemId = new Map<string, string[]>();
  for (const row of itemAttachments ?? []) {
    attachmentCountBySubmissionItemId.set(
      row.submission_item_id,
      (attachmentCountBySubmissionItemId.get(row.submission_item_id) ?? 0) + 1,
    );
    if (!row.file_path) continue;
    const paths = pathsBySubmissionItemId.get(row.submission_item_id) ?? [];
    paths.push(row.file_path);
    pathsBySubmissionItemId.set(row.submission_item_id, paths);
  }

  const attachmentUrlsBySubmissionItemId = await firmarEvidencias(pathsBySubmissionItemId);

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
          sectionId: item.section_id,
          sectionName: section?.name ?? "General",
          sectionOrder: section?.sortOrder ?? 999,
          itemOrder: item.sort_order,
        },
      ];
    }),
  );

  const itemsBySubmissionId = new Map<string, Array<{
    id: string;
    templateItemId: string | null;
    itemLabel: string | null;
    sectionId: string | null;
    sectionName: string | null;
    sectionOrder: number | null;
    itemOrder: number | null;
    checked: boolean;
    flagged: boolean;
  }>>();
  const metricsBySubmissionId = new Map<string, { total: number; done: number; flagged: number; photos: number; comments: number }>();
  for (const row of submissionItems ?? []) {
    const list = itemsBySubmissionId.get(row.submission_id) ?? [];
    list.push({
      id: row.id,
      templateItemId: row.template_item_id,
      itemLabel: row.item_label ?? null,
      sectionId: row.section_id_snapshot ?? null,
      sectionName: row.section_name ?? null,
      sectionOrder: row.section_sort_order ?? null,
      itemOrder: row.item_sort_order ?? null,
      checked: row.is_checked,
      flagged: row.is_flagged,
    });
    itemsBySubmissionId.set(row.submission_id, list);
    const metrics = metricsBySubmissionId.get(row.submission_id) ?? { total: 0, done: 0, flagged: 0, photos: 0, comments: 0 };
    metrics.total += 1;
    metrics.done += row.is_checked ? 1 : 0;
    metrics.flagged += row.is_flagged ? 1 : 0;
    metrics.photos += attachmentCountBySubmissionItemId.get(row.id) ?? 0;
    metrics.comments += commentCountBySubmissionItemId.get(row.id) ?? 0;
    metricsBySubmissionId.set(row.submission_id, metrics);
  }

  const reports: ReportView[] = submissions.map((submission) => {
    const timestamp = submission.submitted_at ?? submission.created_at;
    const branch = submission.branch_id ? branchById.get(submission.branch_id) : null;
    const managerName = employeeNameByUserId.get(submission.submitted_by) ?? "Usuario";
    const metrics = metricsBySubmissionId.get(submission.id) ?? { total: 0, done: 0, flagged: 0, photos: 0, comments: 0 };
    const sectionMap = new Map<string, { id: string; name: string; order: number; items: Array<{ id: string; text: string; ok: boolean; flag: boolean; note?: string; photosCount: number; photos?: string[]; itemOrder: number }> }>();

    for (const submissionItem of itemsBySubmissionId.get(submission.id) ?? []) {
      const itemMeta = submissionItem.templateItemId
        ? itemMetaById.get(submissionItem.templateItemId)
        : undefined;
      const historyMeta = resolveChecklistHistoryItemMeta(
        {
          sectionId: submissionItem.sectionId,
          sectionName: submissionItem.sectionName,
          sectionOrder: submissionItem.sectionOrder,
          itemOrder: submissionItem.itemOrder,
          itemLabel: submissionItem.itemLabel,
        },
        itemMeta,
      );
      const section = sectionMap.get(historyMeta.sectionKey) ?? {
        id: historyMeta.sectionKey,
        name: historyMeta.sectionName,
        order: historyMeta.sectionOrder,
        items: [] as Array<{
          id: string;
          text: string;
          ok: boolean;
          flag: boolean;
          note?: string;
          photosCount: number;
          photos?: string[];
          itemOrder: number;
        }>,
      };
      const flag = latestFlagBySubmissionItemId.get(submissionItem.id);
      const comment = latestCommentBySubmissionItemId.get(submissionItem.id) ?? "";
      section.items.push({
        id: submissionItem.id,
        // El texto congelado en la respuesta manda: el reporte de un dia anterior
        // no debe cambiar si despues se renombra o se borra el item de la
        // plantilla. La plantilla queda solo como respaldo para las respuestas
        // anteriores a la migracion 20260730000001, que no tienen la copia.
        text: historyMeta.label,
        ok: submissionItem.checked,
        flag: submissionItem.flagged,
        note: flag?.reason ?? comment,
        photosCount: attachmentCountBySubmissionItemId.get(submissionItem.id) ?? 0,
        photos: attachmentUrlsBySubmissionItemId.get(submissionItem.id) ?? [],
        itemOrder: historyMeta.itemOrder,
      });
      sectionMap.set(historyMeta.sectionKey, section);
    }

    const categories = [...sectionMap.values()]
      .sort((a, b) => a.order - b.order)
      .map((section) => ({ id: section.id, name: section.name, items: section.items.sort((a, b) => a.itemOrder - b.itemOrder) }));

    const attentionItems = categories
      .flatMap((category) =>
        category.items
          .filter((item) => item.flag)
          .map((item) => ({ id: item.id, task: item.text, note: item.note ?? "", category: category.name })),
      )
      .slice(0, 20);

    return {
      id: submission.id,
      branchId: submission.branch_id,
      locationName: branchDisplayName(branch),
      locationShort: branchDisplayName(branch).split(" ")[0] ?? "Global",
      cityLabel: [branch?.city, branch?.state].filter(Boolean).join(", "),
      managerName,
      managerShort: shortName(managerName),
      managerInitials: initials(managerName),
      managerColor: colorForUser(),
      dateLabel: formatDateLabel(timestamp, todayStart),
      timeLabel: formatTimeLabel(timestamp),
      submittedAtIso: timestamp,
      // El nombre congelado en la respuesta manda: la plantilla pudo haber sido
      // renombrada o eliminada (migracion 20260731000001).
      templateName:
        submission.template_name ??
        (submission.template_id ? templateNameById.get(submission.template_id) : undefined) ??
        "Checklist",
      templateId: submission.template_id,
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

  const todayReportByBranch = new Map<string, (typeof reports)[number]>();
  for (const report of todayReports) {
    if (!report.branchId) continue;
    if (!todayReportByBranch.has(report.branchId)) todayReportByBranch.set(report.branchId, report);
  }

  const locationCards: LocationCard[] = (branches ?? []).map((branch) => {
    const report = todayReportByBranch.get(branch.id);
    if (!report) {
      return {
        branchId: branch.id,
        branchName: branchDisplayName(branch),
        cityLabel: [branch.city, branch.state].filter(Boolean).join(", "),
        status: "none",
        badge: "⚠ Sin reporte",
        managerName: "Sin envío",
        managerInitials: "--",
        managerColor: "var(--gbp-muted)",
        sentAtLabel: "No ha enviado reporte",
        metrics: { total: 0, done: 0, attention: 0, photos: 0 },
        reportId: null,
      };
    }

    return {
      branchId: branch.id,
      branchName: branchDisplayName(branch),
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
    { icon: "📋", label: "Reportes hoy", value: String(branchesWithReportToday), subLabel: `de ${(branches ?? []).length} locaciones`, tone: "default" },
    { icon: "✅", label: "Completados", value: String(completedToday), subLabel: completedToday > 0 ? "Sin novedades" : "Sin reportes completos", tone: "success" },
    { icon: "⚑", label: "Para atencion", value: String(attentionToday), subLabel: `items en ${todayReports.filter((row) => row.flaggedItems > 0).length} reportes`, tone: "warning" },
    { icon: "⏳", label: "Sin reporte", value: String(noReportToday), subLabel: noReportToday > 0 ? noReportBranch : "Todo al día", tone: "muted" },
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

  return {
    generatedAt: now.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }),
    statCards,
    locationCards,
    reports,
    attentionFeed,
  };
}

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { resolveEmployeeAllowedLocationIds } from "@/shared/lib/employee-api-scope";
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_CATEGORIES,
  type MaintenanceCatalog,
  type MaintenanceCategoryOption,
  type MaintenanceIssueOption,
  type MaintenancePriority,
  type MaintenanceRequest,
  type MaintenanceServiceItemOption,
  type MaintenanceStatus,
} from "@/modules/maintenance/types";

const BUCKET_NAME = "tenant-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

let bucketExistsChecked = false;

const nullableString = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : String(value).trim()),
  z.string().max(300).nullable().optional(),
);

export const maintenanceCreateSchema = z.object({
  branch_id: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(5000),
  category: z.string().trim().min(1).max(80),
  service_item: nullableString,
  issue: nullableString,
  priority: z.enum(MAINTENANCE_PRIORITIES).default("medium"),
  action: z.enum(["draft", "submit"]).default("submit"),
});

export const maintenanceUpdateSchema = z.object({
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  message: z.string().trim().max(5000).optional().nullable(),
  scheduled_visit_at: z.string().trim().optional().nullable(),
});

type AnySupabase = ReturnType<typeof createSupabaseAdminClient> & {
  // New tables are not present in database.types.ts yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type MaintenanceUpdateRow = {
  id: string;
  request_id: string;
  actor_user_id: string;
  update_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  scheduled_visit_at: string | null;
  created_at: string;
};

type MaintenanceAttachmentRow = {
  id: string;
  request_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
};

type MaintenanceCategoryRow = {
  id: string;
  code: string;
  name: string;
  is_system: boolean | null;
  sort_order: number | null;
};

type MaintenanceServiceItemRow = {
  id: string;
  category_id: string;
  code: string;
  name: string;
  is_system: boolean | null;
  sort_order: number | null;
};

type MaintenanceIssueRow = {
  id: string;
  service_item_id: string;
  code: string;
  name: string;
  is_system: boolean | null;
  sort_order: number | null;
};

type ActorNameRow = {
  user_id: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type ActorContext = {
  organizationId: string;
  userId: string;
  branchId: string | null;
  roleCode: string;
};

type ListOptions = {
  scope: "company" | "employee";
  status?: string;
  branchId?: string;
};

type CreateCatalogInput = {
  name: string;
};

type UpdateCatalogInput = {
  name: string;
};

async function ensureBucketExists() {
  if (bucketExistsChecked) return;

  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(BUCKET_NAME);
  if (!bucket) {
    await admin.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
    });
  }

  bucketExistsChecked = true;
}

async function getAllowedLocationIds(context: ActorContext) {
  if (context.roleCode === "company_admin") {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("is_active", true);
    return (data ?? []).map((row) => row.id).filter(Boolean);
  }

  return resolveEmployeeAllowedLocationIds(context.organizationId, context.userId);
}

function normalizeStatus(value: unknown): MaintenanceStatus {
  return MAINTENANCE_STATUSES.includes(value as MaintenanceStatus) ? (value as MaintenanceStatus) : "submitted";
}

function normalizePriority(value: unknown): MaintenancePriority {
  return MAINTENANCE_PRIORITIES.includes(value as MaintenancePriority) ? (value as MaintenancePriority) : "medium";
}

function slugifyCatalogName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizeCategoryName(value: string) {
  const trimmed = value.trim();
  const legacy = MAINTENANCE_CATEGORIES.find((category) => category.value === trimmed.toLowerCase());
  return legacy?.label ?? trimmed;
}

async function buildUniqueCatalogCode(
  admin: AnySupabase,
  table: "maintenance_categories" | "maintenance_service_items" | "maintenance_issue_templates",
  organizationId: string,
  name: string,
  excludeId?: string,
) {
  const base = slugifyCatalogName(name) || "catalogo";
  const { data: existingRows } = await admin
    .from(table)
    .select("id, code")
    .eq("organization_id", organizationId)
    .ilike("code", `${base}%`)
    .limit(200);

  const existing = new Set(
    (existingRows ?? [])
      .filter((row: { id: string }) => (excludeId ? row.id !== excludeId : true))
      .map((row: { code: string }) => row.code),
  );

  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function resolveActorDisplayName(value: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  const fullName = `${value.first_name ?? ""} ${value.last_name ?? ""}`.trim();
  if (fullName) return fullName;
  if (value.email && value.email.includes("@")) {
    return value.email.split("@")[0] ?? value.email;
  }
  return "Administrador";
}

async function resolveMaintenanceActorNames(params: {
  organizationId: string;
  actorIds: string[];
}) {
  const actorNameMap = new Map<string, string>();
  if (!params.actorIds.length) return actorNameMap;

  const admin = createSupabaseAdminClient();
  const [{ data: employeesData }, { data: profilesData }] = await Promise.all([
    admin
      .from("employees")
      .select("user_id, first_name, last_name, email")
      .eq("organization_id", params.organizationId)
      .in("user_id", params.actorIds),
    admin
      .from("organization_user_profiles")
      .select("user_id, first_name, last_name, email")
      .eq("organization_id", params.organizationId)
      .in("user_id", params.actorIds),
  ]);

  for (const row of (employeesData ?? []) as ActorNameRow[]) {
    if (row.user_id) actorNameMap.set(row.user_id, resolveActorDisplayName(row));
  }

  for (const row of (profilesData ?? []) as ActorNameRow[]) {
    if (row.user_id && !actorNameMap.has(row.user_id)) {
      actorNameMap.set(row.user_id, resolveActorDisplayName(row));
    }
  }

  const missingIds = params.actorIds.filter((id) => !actorNameMap.has(id));
  if (!missingIds.length) return actorNameMap;

  const users = await Promise.all(
    missingIds.map(async (userId) => {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) return null;
      return { userId, user: data.user };
    }),
  );

  for (const item of users) {
    if (!item) continue;
    const meta = item.user.user_metadata as Record<string, unknown> | null;
    const fullName = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
    if (fullName) {
      actorNameMap.set(item.userId, fullName);
      continue;
    }
    if (item.user.email && item.user.email.includes("@")) {
      actorNameMap.set(item.userId, item.user.email.split("@")[0] ?? item.user.email);
      continue;
    }
    actorNameMap.set(item.userId, "Administrador");
  }

  return actorNameMap;
}

async function signedUrlForPath(path: string, organizationId: string) {
  if (!isSafeTenantStoragePath(path, organizationId)) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.storage.from(BUCKET_NAME).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

function mapCategoryOption(row: MaintenanceCategoryRow): MaintenanceCategoryOption {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isSystem: row.is_system === true,
  };
}

function mapServiceItemOption(row: MaintenanceServiceItemRow): MaintenanceServiceItemOption {
  return {
    id: row.id,
    categoryId: row.category_id,
    code: row.code,
    name: row.name,
    isSystem: row.is_system === true,
  };
}

function mapIssueOption(row: MaintenanceIssueRow): MaintenanceIssueOption {
  return {
    id: row.id,
    serviceItemId: row.service_item_id,
    code: row.code,
    name: row.name,
    isSystem: row.is_system === true,
  };
}

export async function getMaintenanceCatalog(organizationId: string): Promise<MaintenanceCatalog> {
  const admin = createSupabaseAdminClient();
  const [{ data: customBrandingEnabled }, { data: branches }, { data: categories }, { data: serviceItems }, { data: issues }] = await Promise.all([
    admin.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    admin
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    admin
      .from("maintenance_categories")
      .select("id, code, name, is_system, sort_order")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("maintenance_service_items")
      .select("id, category_id, code, name, is_system, sort_order")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("maintenance_issue_templates")
      .select("id, service_item_id, code, name, is_system, sort_order")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  return {
    branches: (branches ?? []).map((branch) => ({
      id: branch.id,
      name: customBrandingEnabled && branch.city ? branch.city : branch.name,
    })),
    categories: (categories ?? []).map((row) => mapCategoryOption(row as MaintenanceCategoryRow)),
    serviceItems: (serviceItems ?? []).map((row) => mapServiceItemOption(row as MaintenanceServiceItemRow)),
    issues: (issues ?? []).map((row) => mapIssueOption(row as MaintenanceIssueRow)),
  };
}

export async function listMaintenanceRequests(context: ActorContext, options: ListOptions) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const catalog = await getMaintenanceCatalog(context.organizationId);
  const branchNameById = new Map(catalog.branches.map((branch) => [branch.id, branch.name]));
  const allowedLocationIds = options.scope === "employee" ? await getAllowedLocationIds(context) : [];

  if (options.scope === "employee" && allowedLocationIds.length === 0) {
    return { requests: [], catalog };
  }

  let query = admin
    .from("maintenance_requests")
    .select("id, organization_id, branch_id, created_by, title, description, category, service_item, issue, priority, status, scheduled_visit_at, resolved_at, last_activity_at, created_at, updated_at")
    .eq("organization_id", context.organizationId)
    .order("last_activity_at", { ascending: false });

  if (options.status && options.status !== "all") {
    if (options.status === "open") {
      query = query.in("status", ["submitted", "visit_scheduled", "in_progress", "needs_parts", "needs_followup"]);
    } else if (options.status === "completed") {
      query = query.eq("status", "resolved");
    } else {
      query = query.eq("status", options.status);
    }
  }

  if (options.branchId) {
    query = query.eq("branch_id", options.branchId);
  }

  if (options.scope === "employee" && allowedLocationIds.length > 0) {
    query = query.in("branch_id", allowedLocationIds);
  }

  const { data: requests, error } = await query;
  if (error) throw new Error(error.message);

  const requestIds = (requests ?? []).map((row) => row.id);
  const [{ data: updates }, { data: attachments }] = requestIds.length
    ? await Promise.all([
        admin
          .from("maintenance_request_updates")
          .select("id, request_id, actor_user_id, update_type, from_status, to_status, message, scheduled_visit_at, created_at")
          .in("request_id", requestIds)
          .order("created_at", { ascending: true }),
        admin
          .from("maintenance_request_attachments")
          .select("id, request_id, file_path, file_name, mime_type, file_size_bytes, created_at")
          .in("request_id", requestIds)
          .order("created_at", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }];

  const updatesByRequest = new Map<string, MaintenanceUpdateRow[]>();
  for (const update of (updates ?? []) as MaintenanceUpdateRow[]) {
    const rows = updatesByRequest.get(update.request_id) ?? [];
    rows.push(update);
    updatesByRequest.set(update.request_id, rows);
  }

  const attachmentsByRequest = new Map<string, MaintenanceAttachmentRow[]>();
  for (const attachment of (attachments ?? []) as MaintenanceAttachmentRow[]) {
    const rows = attachmentsByRequest.get(attachment.request_id) ?? [];
    rows.push(attachment);
    attachmentsByRequest.set(attachment.request_id, rows);
  }

  const actorIds = Array.from(new Set(
    ((updates ?? []) as MaintenanceUpdateRow[])
      .map((update) => update.actor_user_id)
      .filter(Boolean),
  ));
  const actorNameMap = await resolveMaintenanceActorNames({
    organizationId: context.organizationId,
    actorIds,
  });

  const mapped: MaintenanceRequest[] = [];
  for (const row of requests ?? []) {
    const requestAttachments = await Promise.all(
      (attachmentsByRequest.get(row.id) ?? []).map(async (attachment) => ({
        id: attachment.id,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type ?? null,
        fileSizeBytes: Number(attachment.file_size_bytes ?? 0),
        signedUrl: await signedUrlForPath(attachment.file_path, context.organizationId),
        createdAt: attachment.created_at,
      })),
    );

    mapped.push({
      id: row.id,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      branchName: branchNameById.get(row.branch_id) ?? "Locacion",
      createdBy: row.created_by,
      title: row.title,
      description: row.description,
      category: normalizeCategoryName(row.category),
      serviceItem: row.service_item ?? null,
      issue: row.issue ?? null,
      priority: normalizePriority(row.priority),
      status: normalizeStatus(row.status),
      scheduledVisitAt: row.scheduled_visit_at ?? null,
      resolvedAt: row.resolved_at ?? null,
      lastActivityAt: row.last_activity_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      attachments: requestAttachments,
      updates: (updatesByRequest.get(row.id) ?? []).map((update) => ({
        id: update.id,
        actorUserId: update.actor_user_id,
        actorName: actorNameMap.get(update.actor_user_id) ?? "Administrador",
        updateType: update.update_type,
        fromStatus: update.from_status ? normalizeStatus(update.from_status) : null,
        toStatus: update.to_status ? normalizeStatus(update.to_status) : null,
        message: update.message ?? null,
        scheduledVisitAt: update.scheduled_visit_at ?? null,
        createdAt: update.created_at,
      })),
    });
  }

  return { requests: mapped, catalog };
}

export async function createMaintenanceRequest(context: ActorContext, input: z.infer<typeof maintenanceCreateSchema>) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const allowedLocationIds = await getAllowedLocationIds(context);

  if (context.roleCode === "employee" && !allowedLocationIds.includes(input.branch_id)) {
    throw new Error("No puedes crear requests fuera de tu locacion");
  }

  const catalogSelection = await ensureMaintenanceCatalogSelection(admin, context, input);

  const status: MaintenanceStatus = input.action === "draft" ? "draft" : "submitted";
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("maintenance_requests")
    .insert({
      organization_id: context.organizationId,
      branch_id: input.branch_id,
      created_by: context.userId,
      title: input.title,
      description: input.description,
      category: catalogSelection.categoryName,
      service_item: catalogSelection.serviceItemName,
      issue: catalogSelection.issueName,
      priority: input.priority,
      status,
      last_activity_at: now,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la request");

  await admin.from("maintenance_request_updates").insert({
    request_id: data.id,
    organization_id: context.organizationId,
    actor_user_id: context.userId,
    update_type: status === "draft" ? "created" : "submitted",
    to_status: status,
    message: status === "draft" ? "Request guardada como borrador." : "Request creada y enviada.",
  });

  return data.id as string;
}

export async function updateMaintenanceDraft(
  context: ActorContext,
  requestId: string,
  input: z.infer<typeof maintenanceCreateSchema>,
) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { data: requestRow, error: requestError } = await admin
    .from("maintenance_requests")
    .select("id, branch_id, created_by, status")
    .eq("organization_id", context.organizationId)
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestRow) throw new Error("Request no encontrada");
  if (requestRow.status !== "draft") {
    throw new Error("Solo se pueden editar requests en borrador");
  }

  if (context.roleCode === "employee") {
    if (requestRow.created_by !== context.userId) {
      throw new Error("Solo puedes editar tus propios borradores");
    }

    const allowedLocationIds = await getAllowedLocationIds(context);
    if (!allowedLocationIds.includes(input.branch_id)) {
      throw new Error("No puedes mover el borrador fuera de tu locacion");
    }
  }

  const catalogSelection = await ensureMaintenanceCatalogSelection(admin, context, input);

  const nextStatus: MaintenanceStatus = input.action === "submit" ? "submitted" : "draft";
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("maintenance_requests")
    .update({
      branch_id: input.branch_id,
      title: input.title,
      description: input.description,
      category: catalogSelection.categoryName,
      service_item: catalogSelection.serviceItemName,
      issue: catalogSelection.issueName,
      priority: input.priority,
      status: nextStatus,
      last_activity_at: now,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", requestId);

  if (updateError) throw new Error(updateError.message);

  await admin.from("maintenance_request_updates").insert({
    request_id: requestId,
    organization_id: context.organizationId,
    actor_user_id: context.userId,
    update_type: nextStatus === "submitted" ? "submitted" : "comment",
    from_status: requestRow.status,
    to_status: nextStatus,
    message: nextStatus === "submitted"
      ? "Borrador actualizado y enviado."
      : "Borrador actualizado.",
  });
}

async function ensureMaintenanceCategory(
  admin: AnySupabase,
  organizationId: string,
  userId: string,
  rawName: string,
) {
  const normalizedName = normalizeCategoryName(rawName);
  const { data: existing } = await admin
    .from("maintenance_categories")
    .select("id, code, name, is_system, sort_order")
    .eq("organization_id", organizationId)
    .ilike("name", normalizedName)
    .limit(1)
    .maybeSingle();

  if (existing) return mapCategoryOption(existing as MaintenanceCategoryRow);

  const code = await buildUniqueCatalogCode(admin, "maintenance_categories", organizationId, normalizedName);
  const { data, error } = await admin
    .from("maintenance_categories")
    .insert({
      organization_id: organizationId,
      code,
      name: normalizedName,
      is_system: false,
      sort_order: 500,
      created_by: userId,
      is_active: true,
    })
    .select("id, code, name, is_system, sort_order")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la categoria");
  return mapCategoryOption(data as MaintenanceCategoryRow);
}

async function ensureMaintenanceServiceItem(
  admin: AnySupabase,
  organizationId: string,
  userId: string,
  categoryId: string,
  rawName: string,
) {
  const normalizedName = rawName.trim();
  const { data: existing } = await admin
    .from("maintenance_service_items")
    .select("id, category_id, code, name, is_system, sort_order")
    .eq("organization_id", organizationId)
    .eq("category_id", categoryId)
    .ilike("name", normalizedName)
    .limit(1)
    .maybeSingle();

  if (existing) return mapServiceItemOption(existing as MaintenanceServiceItemRow);

  const code = await buildUniqueCatalogCode(admin, "maintenance_service_items", organizationId, normalizedName);
  const { data, error } = await admin
    .from("maintenance_service_items")
    .insert({
      organization_id: organizationId,
      category_id: categoryId,
      code,
      name: normalizedName,
      is_system: false,
      sort_order: 500,
      created_by: userId,
      is_active: true,
    })
    .select("id, category_id, code, name, is_system, sort_order")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el item de servicio");
  return mapServiceItemOption(data as MaintenanceServiceItemRow);
}

async function ensureMaintenanceIssue(
  admin: AnySupabase,
  organizationId: string,
  userId: string,
  serviceItemId: string,
  rawName: string,
) {
  const normalizedName = rawName.trim();
  const { data: existing } = await admin
    .from("maintenance_issue_templates")
    .select("id, service_item_id, code, name, is_system, sort_order")
    .eq("organization_id", organizationId)
    .eq("service_item_id", serviceItemId)
    .ilike("name", normalizedName)
    .limit(1)
    .maybeSingle();

  if (existing) return mapIssueOption(existing as MaintenanceIssueRow);

  const code = await buildUniqueCatalogCode(admin, "maintenance_issue_templates", organizationId, normalizedName);
  const { data, error } = await admin
    .from("maintenance_issue_templates")
    .insert({
      organization_id: organizationId,
      service_item_id: serviceItemId,
      code,
      name: normalizedName,
      is_system: false,
      sort_order: 500,
      created_by: userId,
      is_active: true,
    })
    .select("id, service_item_id, code, name, is_system, sort_order")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el issue");
  return mapIssueOption(data as MaintenanceIssueRow);
}

async function ensureMaintenanceCatalogSelection(
  admin: AnySupabase,
  context: ActorContext,
  input: z.infer<typeof maintenanceCreateSchema>,
) {
  const category = await ensureMaintenanceCategory(admin, context.organizationId, context.userId, input.category);

  const serviceItemName = input.service_item?.trim() ? input.service_item.trim() : null;
  const serviceItem = serviceItemName
    ? await ensureMaintenanceServiceItem(admin, context.organizationId, context.userId, category.id, serviceItemName)
    : null;

  const issueName = input.issue?.trim() ? input.issue.trim() : null;
  if (issueName && serviceItem) {
    await ensureMaintenanceIssue(admin, context.organizationId, context.userId, serviceItem.id, issueName);
  }

  return {
    categoryName: category.name,
    serviceItemName: serviceItem?.name ?? serviceItemName,
    issueName,
  };
}

export async function createMaintenanceCategory(context: ActorContext, input: CreateCatalogInput) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  return ensureMaintenanceCategory(admin, context.organizationId, context.userId, input.name);
}

export async function updateMaintenanceCategory(context: ActorContext, categoryId: string, input: UpdateCatalogInput) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { data: existing } = await admin
    .from("maintenance_categories")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", categoryId)
    .maybeSingle();

  if (!existing) throw new Error("Categoria no encontrada");

  const normalizedName = normalizeCategoryName(input.name);
  const code = await buildUniqueCatalogCode(admin, "maintenance_categories", context.organizationId, normalizedName, categoryId);
  const { data, error } = await admin
    .from("maintenance_categories")
    .update({ name: normalizedName, code })
    .eq("organization_id", context.organizationId)
    .eq("id", categoryId)
    .select("id, code, name, is_system, sort_order")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo actualizar la categoria");
  return mapCategoryOption(data as MaintenanceCategoryRow);
}

export async function deleteMaintenanceCategory(context: ActorContext, categoryId: string) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { error } = await admin
    .from("maintenance_categories")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", categoryId);

  if (error) throw new Error(error.message);
}

export async function createMaintenanceServiceItem(context: ActorContext, categoryId: string, input: CreateCatalogInput) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { data: category } = await admin
    .from("maintenance_categories")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", categoryId)
    .maybeSingle();

  if (!category) throw new Error("Categoria no encontrada");
  return ensureMaintenanceServiceItem(admin, context.organizationId, context.userId, categoryId, input.name);
}

export async function updateMaintenanceServiceItem(context: ActorContext, serviceItemId: string, input: UpdateCatalogInput) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { data: existing } = await admin
    .from("maintenance_service_items")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", serviceItemId)
    .maybeSingle();

  if (!existing) throw new Error("Item no encontrado");

  const normalizedName = input.name.trim();
  const code = await buildUniqueCatalogCode(admin, "maintenance_service_items", context.organizationId, normalizedName, serviceItemId);
  const { data, error } = await admin
    .from("maintenance_service_items")
    .update({ name: normalizedName, code })
    .eq("organization_id", context.organizationId)
    .eq("id", serviceItemId)
    .select("id, category_id, code, name, is_system, sort_order")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo actualizar el item");
  return mapServiceItemOption(data as MaintenanceServiceItemRow);
}

export async function deleteMaintenanceServiceItem(context: ActorContext, serviceItemId: string) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { error } = await admin
    .from("maintenance_service_items")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", serviceItemId);

  if (error) throw new Error(error.message);
}

export async function createMaintenanceIssueTemplate(context: ActorContext, serviceItemId: string, input: CreateCatalogInput) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { data: serviceItem } = await admin
    .from("maintenance_service_items")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", serviceItemId)
    .maybeSingle();

  if (!serviceItem) throw new Error("Item no encontrado");
  return ensureMaintenanceIssue(admin, context.organizationId, context.userId, serviceItemId, input.name);
}

export async function updateMaintenanceIssueTemplate(context: ActorContext, issueId: string, input: UpdateCatalogInput) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { data: existing } = await admin
    .from("maintenance_issue_templates")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("id", issueId)
    .maybeSingle();

  if (!existing) throw new Error("Issue no encontrado");

  const normalizedName = input.name.trim();
  const code = await buildUniqueCatalogCode(admin, "maintenance_issue_templates", context.organizationId, normalizedName, issueId);
  const { data, error } = await admin
    .from("maintenance_issue_templates")
    .update({ name: normalizedName, code })
    .eq("organization_id", context.organizationId)
    .eq("id", issueId)
    .select("id, service_item_id, code, name, is_system, sort_order")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo actualizar el issue");
  return mapIssueOption(data as MaintenanceIssueRow);
}

export async function deleteMaintenanceIssueTemplate(context: ActorContext, issueId: string) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { error } = await admin
    .from("maintenance_issue_templates")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", issueId);

  if (error) throw new Error(error.message);
}

export async function addMaintenanceUpdate(
  context: ActorContext,
  requestId: string,
  input: z.infer<typeof maintenanceUpdateSchema>,
) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const { data: requestRow, error: requestError } = await admin
    .from("maintenance_requests")
    .select("id, organization_id, branch_id, status")
    .eq("organization_id", context.organizationId)
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestRow) throw new Error("Request no encontrada");

  if (context.roleCode === "employee") {
    const allowedLocationIds = await getAllowedLocationIds(context);
    if (!allowedLocationIds.includes(requestRow.branch_id)) {
      throw new Error("No puedes responder requests fuera de tu locacion");
    }
  }

  const nextStatus = input.status ?? requestRow.status;
  const scheduledVisitAt = input.scheduled_visit_at || null;
  if (nextStatus === "visit_scheduled" && !scheduledVisitAt) {
    throw new Error("Debes indicar fecha y hora para programar la visita");
  }
  const now = new Date().toISOString();
  const resolvedAt = nextStatus === "resolved" ? now : null;

  const { error: updateError } = await admin
    .from("maintenance_requests")
    .update({
      status: nextStatus,
      scheduled_visit_at: scheduledVisitAt,
      resolved_at: resolvedAt,
      last_activity_at: now,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", requestId);

  if (updateError) throw new Error(updateError.message);

  const updateType =
    nextStatus === "visit_scheduled" ? "visit_scheduled" :
    nextStatus === "needs_parts" ? "parts_needed" :
    nextStatus === "needs_followup" ? "followup_needed" :
    nextStatus === "resolved" ? "resolved" :
    nextStatus === "cancelled" ? "cancelled" :
    nextStatus !== requestRow.status ? "status_change" :
    "comment";

  await admin.from("maintenance_request_updates").insert({
    request_id: requestId,
    organization_id: context.organizationId,
    actor_user_id: context.userId,
    update_type: updateType,
    from_status: requestRow.status,
    to_status: nextStatus,
    message: input.message || null,
    scheduled_visit_at: scheduledVisitAt,
  });
}

export async function attachMaintenanceFiles(context: ActorContext, requestId: string, files: File[]) {
  if (!files.length) return;

  const admin = createSupabaseAdminClient() as AnySupabase;
  const { data: requestRow } = await admin
    .from("maintenance_requests")
    .select("id, branch_id")
    .eq("organization_id", context.organizationId)
    .eq("id", requestId)
    .maybeSingle();

  if (!requestRow) throw new Error("Request no encontrada");

  if (context.roleCode === "employee") {
    const allowedLocationIds = await getAllowedLocationIds(context);
    if (!allowedLocationIds.includes(requestRow.branch_id)) {
      throw new Error("No puedes adjuntar archivos fuera de tu locacion");
    }
  }

  await ensureBucketExists();

  for (const file of files) {
    if (file.size <= 0) continue;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error("Un archivo supera 10MB");
    }

    let analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
    try {
      analysis = await analyzeUploadedFile(file);
      await assertPlanLimitForStorage(context.organizationId, file.size);
    } catch (error) {
      throw new Error(error instanceof Error ? getPlanLimitErrorMessage(error, error.message) : "Archivo invalido");
    }

    const path = `${context.organizationId}/maintenance/${requestId}/${randomUUID()}-${analysis.safeName}`;
    const { error: uploadError } = await admin.storage.from(BUCKET_NAME).upload(path, file, {
      contentType: analysis.normalizedMime,
      upsert: false,
    });

    if (uploadError) throw new Error(uploadError.message);

    await admin.from("maintenance_request_attachments").insert({
      request_id: requestId,
      organization_id: context.organizationId,
      uploaded_by: context.userId,
      file_path: path,
      file_name: analysis.originalName,
      mime_type: analysis.normalizedMime,
      file_size_bytes: file.size,
    });
  }
}

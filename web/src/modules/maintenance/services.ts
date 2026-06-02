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
  type MaintenancePriority,
  type MaintenanceRequest,
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

async function signedUrlForPath(path: string, organizationId: string) {
  if (!isSafeTenantStoragePath(path, organizationId)) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.storage.from(BUCKET_NAME).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function getMaintenanceCatalog(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const [{ data: customBrandingEnabled }, { data: branches }] = await Promise.all([
    admin.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    admin
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  return {
    branches: (branches ?? []).map((branch) => ({
      id: branch.id,
      name: customBrandingEnabled && branch.city ? branch.city : branch.name,
    })),
  };
}

export async function listMaintenanceRequests(context: ActorContext, options: ListOptions) {
  const admin = createSupabaseAdminClient() as AnySupabase;
  const catalog = await getMaintenanceCatalog(context.organizationId);
  const branchNameById = new Map(catalog.branches.map((branch) => [branch.id, branch.name]));
  const allowedLocationIds = options.scope === "employee" ? await getAllowedLocationIds(context) : [];

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
      category: row.category,
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
      category: input.category,
      service_item: input.service_item ?? null,
      issue: input.issue ?? null,
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

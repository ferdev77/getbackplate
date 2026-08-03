"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantModule } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

import { sendChecklistAudienceEmail, sendChecklistAudiencePush } from "./services/checklist-audience.service";
import { upsertChecklistTemplate, deleteChecklistTemplate } from "./services/checklist-template.service";

import { z } from "zod";
import { parseChecklistSections, type ChecklistSection } from "@/modules/checklists/lib/sections";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const createChecklistSchema = z.object({
  template_id: z.string().trim().optional().transform(v => v || null),
  name: z.string().trim().min(1, "Poné un nombre para el checklist"),
  checklist_type: z.enum(["opening", "closing", "prep", "custom"]).catch("custom"),
  checklist_type_other: z.string().trim().optional(),
  branch_id: z.string().trim().optional().transform(v => v || null),
  shift: z.string().trim().optional().transform(v => v || null),
  department_id: z.string().trim().optional().transform(v => v || null),
  department: z.string().trim().optional().transform(v => v || null),
  repeat_every: z.string().trim().default("daily").transform(v => v || "daily"),
  recurrence_type: z.string().trim().default("daily").transform(v => v || "daily"),
  custom_days: z.string().trim().default("[]"),
  template_status: z.enum(["active", "draft"]).catch("active"),
  location_scope: z.array(z.string()).default([]),
  department_scope: z.array(z.string()).default([]),
  position_scope: z.array(z.string()).default([]),
  user_scope: z.array(z.string()).default([]),
  scope_mode: z.string().trim().optional(),
  sections_payload: z.string().trim().optional(),
  items: z.string().trim().optional(),
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createChecklistTemplateAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();

  const { data: authData } = await supabase.auth.getUser();

  // --- Parse notify channels ---
  // Email es el unico canal configurable. in_app y push salen siempre y no se
  // piden por formulario; SMS esta discontinuado y se descarta aunque llegue en
  // el POST (ver lib/notification-channels.ts).
  const notifyChannels = [...new Set(formData.getAll("notify_channel").map(String))];
  const persistedNotifyChannels = notifyChannels.filter(
    (channel): channel is "email" => channel === "email",
  );
  const notifyByEmail = notifyChannels.includes("email");

  // --- Validate input ---
  const parsed = createChecklistSchema.safeParse({
    template_id: String(formData.get("template_id") ?? ""),
    name: String(formData.get("name") ?? ""),
    checklist_type: String(formData.get("checklist_type") ?? ""),
    checklist_type_other: String(formData.get("checklist_type_other") ?? ""),
    branch_id: String(formData.get("branch_id") ?? ""),
    shift: String(formData.get("shift") ?? ""),
    department_id: String(formData.get("department_id") ?? ""),
    department: String(formData.get("department") ?? ""),
    repeat_every: String(formData.get("repeat_every") ?? ""),
    recurrence_type: String(formData.get("recurrence_type") ?? "daily"),
    custom_days: String(formData.get("custom_days") ?? "[]"),
    template_status: String(formData.get("template_status") ?? ""),
    location_scope: formData.getAll("location_scope").map(String),
    department_scope: formData.getAll("department_scope").map(String),
    position_scope: formData.getAll("position_scope").map(String),
    user_scope: formData.getAll("user_scope").map(String),
    scope_mode: String(formData.get("scope_mode") ?? ""),
    sections_payload: String(formData.get("sections_payload") ?? ""),
    items: String(formData.get("items") ?? ""),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || "Invalid data" };
  }

  // --- Normalize sections ---
  const { sections_payload: sectionsPayloadRaw, items: itemsInput } = parsed.data;
  let normalizedSections: ChecklistSection[] = [];

  if (sectionsPayloadRaw) {
    normalizedSections = parseChecklistSections(sectionsPayloadRaw);
    if (normalizedSections.length === 0) {
      return { success: false, message: "El formato de las secciones no es válido" };
    }
  } else if (itemsInput) {
    const fallbackItems = itemsInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 80);

    if (fallbackItems.length > 0) {
      normalizedSections = [{ name: "General", items: fallbackItems.map((text) => ({ id: null, text })) }];
    }
  }

  let parsedCustomDays: number[] = [];
  try {
    parsedCustomDays = JSON.parse(parsed.data.custom_days);
  } catch {}

  // --- Delegate to service ---
  const result = await upsertChecklistTemplate({
    supabase,
    organizationId: tenant.organizationId,
    createdBy: authData.user?.id ?? null,
    templateId: parsed.data.template_id,
    name: parsed.data.name,
    checklistType: parsed.data.checklist_type,
    checklistTypeOther: parsed.data.checklist_type_other,
    branchId: parsed.data.branch_id,
    shift: parsed.data.shift,
    departmentId: parsed.data.department_id,
    department: parsed.data.department,
    repeatEvery: parsed.data.repeat_every,
    recurrenceType: parsed.data.recurrence_type,
    customDays: parsedCustomDays,
    templateStatus: parsed.data.template_status,
    locationScopes: parsed.data.location_scope,
    departmentScopes: parsed.data.department_scope,
    positionScopes: parsed.data.position_scope,
    userScopes: parsed.data.user_scope,
    normalizedSections,
    notifyChannels: persistedNotifyChannels,
    scopeMode: parsed.data.scope_mode,
  });

  if (!result.ok) {
    if (result.redirect) {
      redirect(result.redirect);
    }
    return { success: false, message: result.message };
  }

  // --- Audit ---
  await logAuditEvent({
    action: parsed.data.template_id ? "checklist.template.update" : "checklist.template.create",
    entityType: "checklist_template",
    entityId: result.templateId,
    organizationId: tenant.organizationId,
    branchId: parsed.data.branch_id,
    metadata: {
      name: parsed.data.name,
      checklistType: parsed.data.checklist_type,
      shift: parsed.data.shift,
      department: parsed.data.department,
      departmentId: parsed.data.department_id,
      repeatEvery: parsed.data.repeat_every,
      recurrenceType: parsed.data.recurrence_type,
      customDays: parsedCustomDays,
      templateStatus: parsed.data.template_status,
      notifyChannels: persistedNotifyChannels,
      checklistTypeOther: parsed.data.checklist_type_other,
      itemsCount: result.totalItems,
      sectionsCount: normalizedSections.length,
      preservedHistory: result.preservedHistory,
    },
    eventDomain: "checklists",
    outcome: "success",
    severity: parsed.data.template_id ? "medium" : "high",
  });

  revalidatePath("/app/checklists");
  revalidatePath("/app/reports");

  // --- Notifications (tanto al crear como al editar) ---
  let checklistAudienceEmailCount = 0;
  let checklistAudiencePushCount = 0;
  const scopePayload = {
    locations: parsed.data.location_scope,
    department_ids: parsed.data.department_scope,
    position_ids: parsed.data.position_scope,
    users: parsed.data.user_scope,
  };
  const notificationEvent = parsed.data.template_id ? ("updated" as const) : ("created" as const);

  if (notifyByEmail) {
    checklistAudienceEmailCount = await sendChecklistAudienceEmail({
      supabase,
      organizationId: tenant.organizationId,
      templateId: result.templateId,
      origen: notificationEvent === "created" ? "alta" : "edicion",
      templateName: parsed.data.name,
      event: notificationEvent,
      itemsCount: result.totalItems,
      actorEmail: authData.user?.email ?? "Usuario interno",
      targetScope: scopePayload,
      templateBranchId: parsed.data.branch_id,
    });
  }

  checklistAudiencePushCount = await sendChecklistAudiencePush({
    supabase,
    organizationId: tenant.organizationId,
    templateId: result.templateId,
    origen: notificationEvent === "created" ? "alta" : "edicion",
    templateName: parsed.data.name,
    event: notificationEvent,
    itemsCount: result.totalItems,
    targetScope: scopePayload,
    templateBranchId: parsed.data.branch_id,
  });

  // --- Build response ---
  const notificationsSummary: string[] = [];
  if (notifyByEmail) {
    notificationsSummary.push(`Emails sent: ${checklistAudienceEmailCount}`);
  }
  notificationsSummary.push(`Push notifications sent: ${checklistAudiencePushCount}`);

  // Cuando la vuelta actual ya tenia respuestas, los items quedaron pendientes
  // y se aplican al iniciar la vuelta siguiente (ver upsertChecklistTemplate).
  // Hay que decirlo: si no, el diferido es invisible y parece que no se guardo.
  const pendingMessage = result.pendingUntil
    ? (() => {
        const cuando = new Date(result.pendingUntil);
        const fecha = cuando.toLocaleDateString("es-AR", { day: "numeric", month: "long" });
        const hora = cuando.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
        return `Los datos del checklist se guardaron. Como ya hay respuestas de esta vuelta, los cambios en los ítems se aplican el ${fecha} a las ${hora}, al iniciar el próximo reparto.`;
      })()
    : null;

  const baseMessage = pendingMessage
    ?? (parsed.data.template_id ? "Checklist actualizado" : "Checklist creado");

  return {
    success: true,
    message: notificationsSummary.length
      ? `${baseMessage}. ${notificationsSummary.join(" · ")}`
      : baseMessage,
  };
}

export async function deleteChecklistTemplateAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();

  if (tenant.roleCode !== "company_admin") {
    return { success: false, message: "No tenés permiso para eliminar checklists" };
  }

  const templateId = String(formData.get("template_id") ?? "").trim();
  if (!templateId) {
    return { success: false, message: "Checklist inválido" };
  }

  // --- Delegate to service ---
  const result = await deleteChecklistTemplate({
    supabase,
    organizationId: tenant.organizationId,
    templateId,
  });

  if (!result.ok) {
    return { success: false, message: result.message };
  }

  // --- Audit ---
  await logAuditEvent({
    action: "checklist.template.delete",
    entityType: "checklist_template",
    entityId: templateId,
    organizationId: tenant.organizationId,
    metadata: {
      // Cuantas respuestas quedaron huerfanas a proposito, para poder rastrear
      // desde la auditoria que el historial se conservo.
      kept_submissions: result.keptSubmissions,
    },
    eventDomain: "checklists",
    outcome: "success",
    severity: "critical",
  });

  revalidatePath("/app/checklists");
  revalidatePath("/app/reports");
  return { success: true, message: result.message };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantModule } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

import { sendChecklistAudienceEmail, sendChecklistAudienceTwilio } from "./services/checklist-audience.service";
import { upsertChecklistTemplate, deleteChecklistTemplate } from "./services/checklist-template.service";

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const createChecklistSchema = z.object({
  template_id: z.string().trim().optional().transform(v => v || null),
  name: z.string().trim().min(1, "Nombre de plantilla obligatorio"),
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
  const notifyChannels = [...new Set(formData.getAll("notify_channel").map(String))];
  const notifyVia = notifyChannels.filter(
    (channel): channel is "whatsapp" | "sms" => channel === "whatsapp" || channel === "sms",
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
    sections_payload: String(formData.get("sections_payload") ?? ""),
    items: String(formData.get("items") ?? ""),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || "Datos inválidos" };
  }

  // --- Normalize sections ---
  const { sections_payload: sectionsPayloadRaw, items: itemsInput } = parsed.data;
  let normalizedSections: Array<{ name: string; items: string[] }> = [];

  if (sectionsPayloadRaw) {
    try {
      const sectionsParsed = JSON.parse(sectionsPayloadRaw);
      if (Array.isArray(sectionsParsed)) {
        normalizedSections = sectionsParsed
          .map((section: { name?: unknown; items?: unknown }) => ({
            name: typeof section?.name === "string" && section.name.trim() ? section.name.trim() : "General",
            items: Array.isArray(section?.items)
              ? section.items.map((item: unknown) => String(item).trim()).filter(Boolean)
              : [],
          }))
          .filter((section) => section.items.length > 0)
          .slice(0, 20);
      }
    } catch {
      return { success: false, message: "Formato de secciones (JSON) inválido" };
    }
  } else if (itemsInput) {
    const fallbackItems = itemsInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 80);

    if (fallbackItems.length > 0) {
      normalizedSections = [{ name: "General", items: fallbackItems }];
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
    notifyVia,
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
      notifyVia,
      notifyChannels,
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

  // --- Notifications (only for new templates) ---
  let checklistAudienceEmailCount = 0;
  let checklistAudienceSmsCount = 0;
  let checklistAudienceWhatsappCount = 0;
  const scopePayload = {
    locations: parsed.data.location_scope,
    department_ids: parsed.data.department_scope,
    position_ids: parsed.data.position_scope,
    users: parsed.data.user_scope,
  };

  if (!parsed.data.template_id && notifyByEmail) {
    checklistAudienceEmailCount = await sendChecklistAudienceEmail({
      supabase,
      organizationId: tenant.organizationId,
      templateName: parsed.data.name,
      event: "created",
      itemsCount: result.totalItems,
      actorEmail: authData.user?.email ?? "Usuario interno",
      targetScope: scopePayload,
      templateBranchId: parsed.data.branch_id,
      templateDepartmentId: parsed.data.department_id,
    });
  }

  if (!parsed.data.template_id && notifyVia.includes("sms")) {
    checklistAudienceSmsCount = await sendChecklistAudienceTwilio({
      supabase,
      organizationId: tenant.organizationId,
      channel: "sms",
      templateName: parsed.data.name,
      itemsCount: result.totalItems,
      actorEmail: authData.user?.email ?? "Usuario interno",
      targetScope: scopePayload,
      templateBranchId: parsed.data.branch_id,
      templateDepartmentId: parsed.data.department_id,
    });
  }

  if (!parsed.data.template_id && notifyVia.includes("whatsapp")) {
    checklistAudienceWhatsappCount = await sendChecklistAudienceTwilio({
      supabase,
      organizationId: tenant.organizationId,
      channel: "whatsapp",
      templateName: parsed.data.name,
      itemsCount: result.totalItems,
      actorEmail: authData.user?.email ?? "Usuario interno",
      targetScope: scopePayload,
      templateBranchId: parsed.data.branch_id,
      templateDepartmentId: parsed.data.department_id,
    });
  }

  // --- Build response ---
  const notificationsSummary: string[] = [];
  if (notifyByEmail) {
    notificationsSummary.push(`Emails enviados: ${checklistAudienceEmailCount}`);
  }
  if (notifyVia.includes("sms")) {
    notificationsSummary.push(`SMS enviados: ${checklistAudienceSmsCount}`);
  }
  if (notifyVia.includes("whatsapp")) {
    notificationsSummary.push(`WhatsApp enviados: ${checklistAudienceWhatsappCount}`);
  }

  return {
    success: true,
    message: parsed.data.template_id
      ? result.preservedHistory
        ? "Checklist actualizado creando nueva version (se preservo historial)"
        : "Checklist actualizado correctamente"
      : notificationsSummary.length
        ? `Plantilla creada correctamente. ${notificationsSummary.join(" · ")}`
        : "Plantilla creada correctamente"
  };
}

export async function reviewChecklistSubmissionAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (tenant.roleCode !== "company_admin") {
    return { success: false, message: "No tienes permisos para revisar ejecuciones" };
  }

  const submissionId = String(formData.get("submission_id") ?? "").trim();
  if (!submissionId) {
    return { success: false, message: "Ejecución inválida" };
  }

  const { error } = await supabase
    .from("checklist_submissions")
    .update({
      status: "reviewed",
      reviewed_by: authData.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .eq("organization_id", tenant.organizationId);

  if (error) {
    return { success: false, message: `No se pudo revisar la ejecución: ${error.message}` };
  }

  await logAuditEvent({
    action: "checklist.submission.review",
    entityType: "checklist_submission",
    entityId: submissionId,
    organizationId: tenant.organizationId,
    eventDomain: "checklists",
    outcome: "success",
    severity: "medium",
  });

  revalidatePath("/app/checklists");
  revalidatePath("/app/reports");
  return { success: true, message: "Checklist marcado como revisado" };
}

export async function deleteChecklistTemplateAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();

  if (tenant.roleCode !== "company_admin") {
    return { success: false, message: "No tienes permisos para eliminar checklists" };
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
    action: result.archived ? "checklist.template.archive" : "checklist.template.delete",
    entityType: "checklist_template",
    entityId: templateId,
    organizationId: tenant.organizationId,
    metadata: {
      archived: result.archived,
    },
    eventDomain: "checklists",
    outcome: "success",
    severity: result.archived ? "high" : "critical",
  });

  revalidatePath("/app/checklists");
  revalidatePath("/app/reports");
  return { success: true, message: result.message };
}

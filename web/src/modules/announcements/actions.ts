"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { z } from "zod";
import { readAnnouncementScopeFromFormData } from "@/modules/announcements/lib/scope";
import { upsertAnnouncement } from "@/modules/announcements/services/announcement-upsert.service";
import { logAuditEvent } from "@/shared/lib/audit";
import { requireTenantModule } from "@/shared/lib/access";
import { assertScopeIntent, validateTenantScopeReferences } from "@/shared/lib/scope-validation";

function qs(message: string) {
  return encodeURIComponent(message);
}

function normalizeKind(kind: string) {
  const value = kind.trim().toLowerCase();
  if (["general", "urgent", "reminder", "celebration"].includes(value)) {
    return value;
  }
  return "general";
}

export async function createAnnouncementAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantModule("announcements");

  const formDataObj = Object.fromEntries(formData.entries());
  
  const createAnnouncementSchema = z.object({
    title: z.string().min(1, "Title is required").max(100, "The title is too long"),
    body: z.string().min(1, "Content is required").max(3000, "The content is too long"),
  });

  const parsed = createAnnouncementSchema.safeParse({
    title: formDataObj.title ? String(formDataObj.title).trim() : "",
    body: formDataObj.body ? String(formDataObj.body).trim() : "",
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  const title = parsed.data.title;
  const body = parsed.data.body;

  const announcementId = String(formData.get("announcement_id") ?? "").trim() || null;
  const kind = normalizeKind(String(formData.get("kind") ?? "general"));
  const expiresAt = String(formData.get("expires_at") ?? "").trim() || null;
  const isFeatured = String(formData.get("is_featured") ?? "") === "on";
  const scope = readAnnouncementScopeFromFormData(formData);
  const locationScopes = scope.locations;
  const departmentScopes = scope.department_ids;
  const positionScopes = scope.position_ids;
  const userScopes = scope.users;
  const notifyChannels = formData.getAll("notify_channel").map(String);
  const selectedNotifyChannels = [...new Set(notifyChannels)].filter((channel) =>
    ["sms", "email", "in_app", "push"].includes(channel),
  );
  const normalizedNotifyChannels = [...new Set([...selectedNotifyChannels, "push"])];
  const channelsForDelivery = announcementId ? [] : normalizedNotifyChannels;

  const isRecurring = String(formData.get("is_recurring") ?? "") === "on";
  const recurrenceType = String(formData.get("recurrence_type") ?? "daily");
  const customDaysStr = String(formData.get("custom_days") ?? "[]");
  let customDays: number[] = [];
  try {
    customDays = JSON.parse(customDaysStr);
  } catch {}

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const intentCheck = assertScopeIntent({
    intent: formData.get("scope_mode"),
    locationIds: scope.locations,
    departmentIds: scope.department_ids,
    positionIds: scope.position_ids,
    userIds: scope.users,
  });
  if (!intentCheck.ok) {
    redirect(`/app/announcements?error=${qs(intentCheck.message)}`);
  }

  const scopeValidation = await validateTenantScopeReferences({
    supabase,
    organizationId: tenant.organizationId,
    locationIds: locationScopes,
    departmentIds: departmentScopes,
    positionIds: positionScopes,
    userIds: userScopes,
    userSource: "memberships",
  });

  if (!scopeValidation.ok) {
    const messageByField = {
      locations: "The audience includes invalid locations",
      departments: "The audience includes invalid departments",
      positions: "The audience includes invalid positions",
      users: "The audience includes invalid users",
    } as const;
    return { success: false, message: messageByField[scopeValidation.field] };
  }

  const result = await upsertAnnouncement({
    supabase,
    organizationId: tenant.organizationId,
    createdBy: authData.user?.id ?? null,
    announcementId: announcementId || null,
    title,
    body,
    kind,
    isFeatured,
    expiresAt,
    scope: {
      locations: scope.locations,
      department_ids: scope.department_ids,
      position_ids: scope.position_ids,
      users: scope.users,
    },
    deliveryChannels: channelsForDelivery,
    recurrence: {
      isRecurring,
      recurrenceType,
      customDays,
      channels: announcementId ? selectedNotifyChannels : normalizedNotifyChannels,
    },
  });

  if (!result.ok) {
    return { success: false, message: result.message };
  }

  const announcement = { id: result.announcementId };
  const sentContactsCount = result.sentContactsCount;

  await logAuditEvent({
    action: announcementId ? "announcement.update" : "announcement.create",
    entityType: "announcement",
    entityId: announcement.id,
    organizationId: tenant.organizationId,
    metadata: { title, kind, isFeatured, locationScopes, departmentScopes, positionScopes, userScopes, notifyChannels: channelsForDelivery },
    eventDomain: "announcements",
    outcome: "success",
    severity: announcementId ? "medium" : "high",
  });

  revalidatePath("/app/announcements");
  revalidatePath("/portal/home");
  const baseMessage = announcementId ? "Aviso actualizado" : "Aviso publicado";
  const message = channelsForDelivery.length
    ? `${baseMessage}. Notifications sent: ${sentContactsCount}`
    : baseMessage;
  return {
    success: true,
    message,
  };
}

export async function toggleAnnouncementFeaturedAction(arg1: FormData | unknown, arg2?: FormData) {
  const formData = arg2 || (arg1 as FormData);
  const tenant = await requireTenantModule("announcements");

  const announcementId = String(formData.get("announcement_id") ?? "").trim();
  const nextFeatured = String(formData.get("next_featured") ?? "") === "true";

  if (!announcementId) {
    redirect("/app/announcements?status=error&message=" + qs("Invalid announcement"));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("announcements")
    .update({ is_featured: nextFeatured })
    .eq("id", announcementId)
    .eq("organization_id", tenant.organizationId);

  if (error) {
    redirect(
      "/app/announcements?status=error&message=" +
        qs(`Could not update announcement: ${error.message}`),
    );
  }

  await logAuditEvent({
    action: "announcement.featured.toggle",
    entityType: "announcement",
    entityId: announcementId,
    organizationId: tenant.organizationId,
    metadata: { nextFeatured },
    eventDomain: "announcements",
    outcome: "success",
    severity: "medium",
  });

  revalidatePath("/app/announcements");
  revalidatePath("/portal/home");
  redirect(
    "/app/announcements?status=success&message=" +
      qs("Featured status updated"),
  );
}

export async function deleteAnnouncementAction(arg1: FormData | unknown, arg2?: FormData) {
  const formData = arg2 || (arg1 as FormData);
  const tenant = await requireTenantModule("announcements");

  const announcementId = String(formData.get("announcement_id") ?? "").trim();

  if (!announcementId) {
    redirect("/app/announcements?status=error&message=" + qs("Invalid announcement"));
  }

  const supabase = await createSupabaseServerClient();

  // El reparto periodico se va con el aviso: si quedara, el cron seguiria
  // encolando entregas de algo que ya no existe.
  await supabase
    .from("scheduled_jobs")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("job_type", "announcement_delivery")
    .eq("target_id", announcementId);

  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId)
    .eq("organization_id", tenant.organizationId);

  if (error) {
    redirect(
      "/app/announcements?status=error&message=" +
        qs(`Could not delete announcement: ${error.message}`),
    );
  }

  await logAuditEvent({
    action: "announcement.delete",
    entityType: "announcement",
    entityId: announcementId,
    organizationId: tenant.organizationId,
    eventDomain: "announcements",
    outcome: "success",
    severity: "critical",
  });

  revalidatePath("/app/announcements");
  revalidatePath("/portal/home");
  redirect(
    "/app/announcements?status=success&message=" +
      qs("Aviso eliminado"),
  );
}

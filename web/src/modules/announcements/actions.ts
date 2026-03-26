"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { z } from "zod";
import {
  buildAnnouncementAudienceRows,
  readAnnouncementScopeFromFormData,
} from "@/modules/announcements/lib/scope";
import { processAnnouncementDeliveries } from "@/modules/announcements/services/deliveries";
import { logAuditEvent } from "@/shared/lib/audit";
import { requireTenantModule } from "@/shared/lib/access";
import { validateTenantScopeReferences } from "@/shared/lib/scope-validation";
import { calculateNextRunAt, RecurrenceType } from "@/shared/lib/cron-utils";

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
    title: z.string().min(1, "Titulo es obligatorio").max(100, "El título es muy largo"),
    body: z.string().min(1, "Contenido es obligatorio").max(3000, "El contenido es muy largo"),
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
  const normalizedNotifyChannels = [...new Set(notifyChannels)].filter((channel) =>
    ["sms", "whatsapp", "email", "in_app"].includes(channel),
  );
  const channelsForDelivery = announcementId
    ? []
    : normalizedNotifyChannels;

  const isRecurring = String(formData.get("is_recurring") ?? "") === "on";
  const recurrenceType = String(formData.get("recurrence_type") ?? "daily");
  const customDaysStr = String(formData.get("custom_days") ?? "[]");
  let customDays: number[] = [];
  try {
    customDays = JSON.parse(customDaysStr);
  } catch (e) {}

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

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
      locations: "Hay locaciones invalidas en la audiencia",
      departments: "Hay departamentos invalidos en la audiencia",
      positions: "Hay puestos invalidos en la audiencia",
      users: "Hay usuarios invalidos en la audiencia",
    } as const;
    return { success: false, message: messageByField[scopeValidation.field] };
  }

  if (announcementId) {
    const { data: existing } = await supabase
      .from("announcements")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", announcementId)
      .maybeSingle();

    if (!existing) {
      return { success: false, message: "No se encontro el aviso a editar" };
    }
  }

  const upsertPayload = {
    branch_id: null,
    title,
    body,
    kind,
    is_featured: isFeatured,
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    target_scope: {
      locations: scope.locations,
      department_ids: scope.department_ids,
      position_ids: scope.position_ids,
      users: scope.users,
    },
  };

  const announcementMutation = announcementId
    ? await supabase
        .from("announcements")
        .update(upsertPayload)
        .eq("id", announcementId)
        .eq("organization_id", tenant.organizationId)
        .select("id")
        .single()
    : await supabase
        .from("announcements")
        .insert({
          organization_id: tenant.organizationId,
          created_by: authData.user?.id,
          publish_at: new Date().toISOString(),
          ...upsertPayload,
        })
        .select("id")
        .single();

  const { data: announcement, error } = announcementMutation;

  if (error || !announcement) {
    return { success: false, message: `No se pudo crear anuncio: ${error?.message ?? "error"}` };
  }

  if (announcementId) {
    await supabase
      .from("announcement_audiences")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("announcement_id", announcement.id);
  }

  const audiencePayload = buildAnnouncementAudienceRows(tenant.organizationId, announcement.id, scope);

  const { error: audienceError } = await supabase.from("announcement_audiences").insert(audiencePayload);

  if (audienceError) {
    return { success: false, message: `Anuncio creado pero audiencia fallo: ${audienceError.message}` };
  }

  let sentContactsCount = 0;

  if (channelsForDelivery.length) {
    const { error: deliveriesError } = await supabase.from("announcement_deliveries").insert(
      channelsForDelivery.map((channel) => ({
        organization_id: tenant.organizationId,
        announcement_id: announcement.id,
        channel,
        status: "queued",
      })),
    );

    if (deliveriesError) {
      return { success: false, message: `Aviso guardado pero no se pudo encolar notificacion: ${deliveriesError.message}` };
    }

    if (!announcementId) {
      const deliveryResult = await processAnnouncementDeliveries();
      if (deliveryResult.success && typeof deliveryResult.sentContactsCount === "number") {
        sentContactsCount = deliveryResult.sentContactsCount;
      }
    }
  }

  // Handle scheduled job for recurrence
  if (isRecurring) {
    const nextRun = calculateNextRunAt(recurrenceType as RecurrenceType, null, customDays);
    
    if (announcementId) {
      // Intenta actualizar si existe, si no, crear
      const { data: existingJob } = await supabase
        .from("scheduled_jobs")
        .select("id")
        .eq("organization_id", tenant.organizationId)
        .eq("job_type", "announcement_delivery")
        .eq("target_id", announcement.id)
        .maybeSingle();

      if (existingJob) {
        await supabase.from("scheduled_jobs").update({
          recurrence_type: recurrenceType,
          custom_days: customDays,
          next_run_at: nextRun.toISOString(),
          metadata: { channels: normalizedNotifyChannels }
        }).eq("id", existingJob.id);
      } else {
        await supabase.from("scheduled_jobs").insert({
          organization_id: tenant.organizationId,
          job_type: "announcement_delivery",
          target_id: announcement.id,
          recurrence_type: recurrenceType,
          custom_days: customDays,
          next_run_at: nextRun.toISOString(),
          metadata: { channels: normalizedNotifyChannels }
        });
      }
    } else {
      await supabase.from("scheduled_jobs").insert({
        organization_id: tenant.organizationId,
        job_type: "announcement_delivery",
        target_id: announcement.id,
        recurrence_type: recurrenceType,
        custom_days: customDays,
        next_run_at: nextRun.toISOString(),
        metadata: { channels: normalizedNotifyChannels }
      });
    }
  } else if (announcementId) {
    // Si no es recurrente pero viene un id (y quiza le sacaron el toggle) borramos el job
    await supabase.from("scheduled_jobs")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("job_type", "announcement_delivery")
      .eq("target_id", announcementId);
  }

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
  const creationMessage = channelsForDelivery.length
    ? `Anuncio creado correctamente. Notificaciones enviadas: ${sentContactsCount}`
    : "Anuncio creado correctamente";
  return { 
    success: true, 
    message: announcementId ? "Anuncio actualizado correctamente" : creationMessage
  };
}

export async function toggleAnnouncementFeaturedAction(arg1: FormData | unknown, arg2?: FormData) {
  const formData = arg2 || (arg1 as FormData);
  const tenant = await requireTenantModule("announcements");

  const announcementId = String(formData.get("announcement_id") ?? "").trim();
  const nextFeatured = String(formData.get("next_featured") ?? "") === "true";

  if (!announcementId) {
    redirect("/app/announcements?status=error&message=" + qs("Anuncio invalido"));
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
        qs(`No se pudo actualizar anuncio: ${error.message}`),
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
      qs("Estado de destacado actualizado"),
  );
}

export async function deleteAnnouncementAction(arg1: FormData | unknown, arg2?: FormData) {
  const formData = arg2 || (arg1 as FormData);
  const tenant = await requireTenantModule("announcements");

  const announcementId = String(formData.get("announcement_id") ?? "").trim();

  if (!announcementId) {
    redirect("/app/announcements?status=error&message=" + qs("Anuncio invalido"));
  }

  const supabase = await createSupabaseServerClient();

  await supabase
    .from("announcement_audiences")
    .delete()
    .eq("announcement_id", announcementId)
    .eq("organization_id", tenant.organizationId);

  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", announcementId)
    .eq("organization_id", tenant.organizationId);

  if (error) {
    redirect(
      "/app/announcements?status=error&message=" +
        qs(`No se pudo eliminar anuncio: ${error.message}`),
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
      qs("Anuncio eliminado correctamente"),
  );
}

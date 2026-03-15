"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { z } from "zod";
import {
  buildAnnouncementAudienceRows,
  readAnnouncementScopeFromFormData,
} from "@/modules/announcements/lib/scope";
import { logAuditEvent } from "@/shared/lib/audit";
import { requireTenantModule } from "@/shared/lib/access";

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

export async function createAnnouncementAction(prevState: any, formData: FormData) {
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

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (locationScopes.length) {
    const { data: scopeBranches, error: scopeBranchesError } = await supabase
      .from("branches")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .in("id", locationScopes);

    if (scopeBranchesError || (scopeBranches?.length ?? 0) !== locationScopes.length) {
      return { success: false, message: "Hay locaciones invalidas en la audiencia" };
    }
  }

  if (departmentScopes.length) {
    const { data: scopeDepartments, error: scopeDepartmentsError } = await supabase
      .from("organization_departments")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .in("id", departmentScopes);

    if (scopeDepartmentsError || (scopeDepartments?.length ?? 0) !== departmentScopes.length) {
      return { success: false, message: "Hay departamentos invalidos en la audiencia" };
    }
  }

  if (positionScopes.length) {
    const { data: scopedPositions, error: scopedPositionsError } = await supabase
      .from("department_positions")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .in("id", positionScopes);

    if (scopedPositionsError || (scopedPositions?.length ?? 0) !== positionScopes.length) {
      return { success: false, message: "Hay puestos invalidos en la audiencia" };
    }
  }

  if (userScopes.length) {
    const { data: scopeUsers, error: scopeUsersError } = await supabase
      .from("employees")
      .select("user_id")
      .eq("organization_id", tenant.organizationId)
      .in("user_id", userScopes);

    if (scopeUsersError || (scopeUsers?.length ?? 0) !== userScopes.length) {
      return { success: false, message: "Hay usuarios invalidos en la audiencia" };
    }
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

  if (notifyChannels.length) {
    await supabase.from("announcement_deliveries").insert(
      notifyChannels.map((channel) => ({
        organization_id: tenant.organizationId,
        announcement_id: announcement.id,
        channel: channel === "sms" ? "sms" : channel === "whatsapp" ? "whatsapp" : "in_app",
        status: "queued",
      })),
    );
  }

  await logAuditEvent({
    action: announcementId ? "announcement.update" : "announcement.create",
    entityType: "announcement",
    entityId: announcement.id,
    organizationId: tenant.organizationId,
    metadata: { title, kind, isFeatured, locationScopes, departmentScopes, positionScopes, userScopes, notifyChannels },
    eventDomain: "announcements",
    outcome: "success",
    severity: announcementId ? "medium" : "high",
  });

  revalidatePath("/app/announcements");
  revalidatePath("/portal/home");
  return { 
    success: true, 
    message: announcementId ? "Anuncio actualizado correctamente" : "Anuncio creado correctamente" 
  };
}

export async function toggleAnnouncementFeaturedAction(arg1: any, arg2?: FormData) {
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

export async function deleteAnnouncementAction(arg1: any, arg2?: FormData) {
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

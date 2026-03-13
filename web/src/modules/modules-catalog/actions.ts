"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

function normalizeCode(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

function qs(message: string) {
  return encodeURIComponent(message);
}

const NON_DEMOTABLE_CORE_MODULES = new Set(["dashboard", "settings", "employees", "documents"]);

export async function createModuleAction(formData: FormData) {
  await requireSuperadmin();

  const code = normalizeCode(String(formData.get("code") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const isCore = String(formData.get("is_core") ?? "") === "on";

  if (!code || !name) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data: createdModule } = await supabase
    .from("module_catalog")
    .insert({
      code,
      name,
      description,
      is_core: isCore,
    })
    .select("id")
    .single();

  if (createdModule?.id && isCore) {
    const { data: organizations } = await supabase.from("organizations").select("id");

    if (organizations?.length) {
      await supabase.from("organization_modules").upsert(
        organizations.map((org) => ({
          organization_id: org.id,
          module_id: createdModule.id,
          is_enabled: true,
          enabled_at: new Date().toISOString(),
        })),
        { onConflict: "organization_id,module_id" },
      );
    }
  }

  await logAuditEvent({
    action: "module.create",
    entityType: "module",
    entityId: createdModule?.id,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "high",
    metadata: { code, name, isCore },
  });

  revalidatePath("/superadmin/modules");
  revalidatePath("/superadmin/organizations");
}

export async function updateModuleAction(formData: FormData) {
  await requireSuperadmin();

  const moduleId = String(formData.get("module_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const isCore = String(formData.get("is_core") ?? "") === "on";

  if (!moduleId || !name) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data: currentModule } = await supabase
    .from("module_catalog")
    .select("id, code, name, is_core")
    .eq("id", moduleId)
    .maybeSingle();

  if (!currentModule) {
    redirect(
      "/superadmin/modules?status=error&message=" +
        qs("No se encontro el modulo seleccionado"),
    );
  }

  if (
    currentModule.is_core &&
    !isCore &&
    NON_DEMOTABLE_CORE_MODULES.has(currentModule.code)
  ) {
    await logAuditEvent({
      action: "module.update.denied",
      entityType: "module",
      entityId: moduleId,
      eventDomain: "superadmin",
      outcome: "denied",
      severity: "high",
      metadata: {
        code: currentModule.code,
        name: currentModule.name,
        reason: "core_module_cannot_be_demoted",
      },
    });

    redirect(
      "/superadmin/modules?status=error&message=" +
        qs(`El modulo core '${currentModule.name}' no puede pasar a opcional`),
    );
  }

  await supabase
    .from("module_catalog")
    .update({ name, description, is_core: isCore })
    .eq("id", moduleId);

  if (!currentModule.is_core && isCore) {
    const { data: organizations } = await supabase.from("organizations").select("id");

    if (organizations?.length) {
      await supabase.from("organization_modules").upsert(
        organizations.map((org) => ({
          organization_id: org.id,
          module_id: moduleId,
          is_enabled: true,
          enabled_at: new Date().toISOString(),
        })),
        { onConflict: "organization_id,module_id" },
      );
    }
  }

  await logAuditEvent({
    action: "module.update",
    entityType: "module",
    entityId: moduleId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "high",
    metadata: { name, isCore },
  });

  revalidatePath("/superadmin/modules");
  revalidatePath("/superadmin/organizations");

  redirect(
    "/superadmin/modules?status=success&message=" +
      qs(`Modulo '${name}' actualizado correctamente`),
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { stripe } from "@/infrastructure/stripe/client";

function normalizePlanCode(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function normalizeCurrencyCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

function parsePriceAmount(input: FormDataEntryValue | null) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Number(value.toFixed(2));
}

function normalizeBillingPeriod(input: string) {
  const value = input.trim().toLowerCase();
  if (["monthly", "yearly", "one_time", "custom"].includes(value)) {
    return value;
  }
  return "monthly";
}

function toNullableInt(input: FormDataEntryValue | null) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function qs(message: string) {
  return encodeURIComponent(message);
}

function toFriendlyPlanErrorMessage(raw: string) {
  const text = raw.toLowerCase();

  if (text.includes("could not find the table 'public.plans'")) {
    return "Tu base de datos aun no tiene la tabla plans. Debes ejecutar primero las migraciones 20260311_0001_base_saas.sql y 202603110002_plan_pricing.sql en Supabase SQL Editor.";
  }

  if (text.includes("price_amount") || text.includes("currency_code") || text.includes("billing_period")) {
    return "Falta aplicar la migracion de precios de planes (202603110002_plan_pricing.sql).";
  }

  return raw;
}

async function syncOrganizationsModulesForPlan(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  planId: string,
) {
  const [{ data: organizations }, { data: modulesCatalog }, { data: planModules }] = await Promise.all([
    supabase.from("organizations").select("id").eq("plan_id", planId),
    supabase.from("module_catalog").select("id, is_core"),
    supabase.from("plan_modules").select("module_id").eq("plan_id", planId).eq("is_enabled", true),
  ]);

  if (!(organizations?.length && modulesCatalog?.length)) {
    return;
  }

  const planModuleSet = new Set((planModules ?? []).map((row) => row.module_id));
  const now = new Date().toISOString();

  await supabase.from("organization_modules").upsert(
    organizations.flatMap((organization) =>
      modulesCatalog.map((module) => {
        const shouldEnable = Boolean(module.is_core) || planModuleSet.has(module.id);
        return {
          organization_id: organization.id,
          module_id: module.id,
          is_enabled: shouldEnable,
          enabled_at: shouldEnable ? now : null,
        };
      }),
    ),
    { onConflict: "organization_id,module_id" },
  );
}

export async function createPlanAction(formData: FormData) {
  await requireSuperadmin();

  const code = normalizePlanCode(String(formData.get("code") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const isActive = String(formData.get("is_active") ?? "") === "on";
  const billingPeriod = normalizeBillingPeriod(String(formData.get("billing_period") ?? "monthly"));
  const maxBranches = toNullableInt(formData.get("max_branches"));
  const maxUsers = toNullableInt(formData.get("max_users"));
  const maxEmployees = toNullableInt(formData.get("max_employees"));
  const maxStorageMb = toNullableInt(formData.get("max_storage_mb"));
  const stripePriceId = String(formData.get("stripe_price_id") ?? "").trim() || null;

  let priceAmount = parsePriceAmount(formData.get("price_amount"));
  let currencyCode = normalizeCurrencyCode(String(formData.get("currency_code") ?? "USD")) || "USD";

  if (stripePriceId) {
    try {
      const price = await stripe.prices.retrieve(stripePriceId);
      priceAmount = price.unit_amount ? price.unit_amount / 100 : 0;
      currencyCode = price.currency.toUpperCase();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      redirect("/superadmin/plans?status=error&message=" + qs(`Stripe Price ID inválido: ${message}`));
    }
  }

  if (!code || !name) {
    redirect("/superadmin/plans?status=error&message=" + qs("Completa codigo y nombre del plan"));
  }

  const supabase = createSupabaseAdminClient();
  const selectedModuleIds = new Set(
    formData
      .getAll("module_ids")
      .map((value) => String(value).trim())
      .filter(Boolean),
  );

  const { data: modulesCatalog } = await supabase
    .from("module_catalog")
    .select("id, is_core");

  const moduleIdsForPlan = (modulesCatalog ?? [])
    .filter((module) => module.is_core || selectedModuleIds.has(module.id))
    .map((module) => module.id);

  const { data: createdPlan, error } = await supabase
    .from("plans")
    .insert({
      code,
      name,
      description,
      is_active: isActive,
      price_amount: priceAmount,
      currency_code: currencyCode,
      billing_period: billingPeriod,
      max_branches: maxBranches,
      max_users: maxUsers,
      max_employees: maxEmployees,
      max_storage_mb: maxStorageMb,
      stripe_price_id: stripePriceId,
    })
    .select("id")
    .single();

  if (error) {
    const message = `No se pudo crear el plan: ${toFriendlyPlanErrorMessage(error.message)}`;
    redirect("/superadmin/plans?status=error&message=" + qs(message));
  }

  if (createdPlan?.id && moduleIdsForPlan.length > 0) {
    await supabase.from("plan_modules").insert(
      moduleIdsForPlan.map((moduleId) => ({
        plan_id: createdPlan.id,
        module_id: moduleId,
        is_enabled: true,
      })),
    );
  }

  if (createdPlan?.id) {
    await syncOrganizationsModulesForPlan(supabase, createdPlan.id);
  }

  await logAuditEvent({
    action: "plan.create",
    entityType: "plan",
    entityId: createdPlan?.id,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "high",
    metadata: {
      code,
      name,
      isActive,
      priceAmount,
      currencyCode,
      billingPeriod,
      maxBranches,
      maxUsers,
      maxEmployees,
      maxStorageMb,
      moduleCount: moduleIdsForPlan.length,
    },
  });

  revalidatePath("/superadmin/plans");
  redirect("/superadmin/plans?status=success&message=" + qs("Plan creado correctamente"));
}

export async function updatePlanAction(formData: FormData) {
  await requireSuperadmin();

  const planId = String(formData.get("plan_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const isActive = String(formData.get("is_active") ?? "") === "on";
  const billingPeriod = normalizeBillingPeriod(String(formData.get("billing_period") ?? "monthly"));
  const maxBranches = toNullableInt(formData.get("max_branches"));
  const maxUsers = toNullableInt(formData.get("max_users"));
  const maxEmployees = toNullableInt(formData.get("max_employees"));
  const maxStorageMb = toNullableInt(formData.get("max_storage_mb"));
  const stripePriceId = String(formData.get("stripe_price_id") ?? "").trim() || null;

  let priceAmount = parsePriceAmount(formData.get("price_amount"));
  let currencyCode = normalizeCurrencyCode(String(formData.get("currency_code") ?? "USD")) || "USD";

  if (stripePriceId) {
    try {
      const price = await stripe.prices.retrieve(stripePriceId);
      priceAmount = price.unit_amount ? price.unit_amount / 100 : 0;
      currencyCode = price.currency.toUpperCase();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      redirect("/superadmin/plans?status=error&message=" + qs(`Stripe Price ID inválido: ${message}`));
    }
  }

  const selectedModuleIds = new Set(
    formData
      .getAll("module_ids")
      .map((value) => String(value).trim())
      .filter(Boolean),
  );

  if (!planId || !name) {
    redirect("/superadmin/plans?status=error&message=" + qs("Faltan datos para actualizar el plan"));
  }

  const supabase = createSupabaseAdminClient();
  const { data: modulesCatalog } = await supabase
    .from("module_catalog")
    .select("id, is_core");

  const moduleIdsForPlan = (modulesCatalog ?? [])
    .filter((module) => module.is_core || selectedModuleIds.has(module.id))
    .map((module) => module.id);

  const { error } = await supabase
    .from("plans")
    .update({
      name,
      description,
      is_active: isActive,
      price_amount: priceAmount,
      currency_code: currencyCode,
      billing_period: billingPeriod,
      max_branches: maxBranches,
      max_users: maxUsers,
      max_employees: maxEmployees,
      max_storage_mb: maxStorageMb,
      stripe_price_id: stripePriceId,
    })
    .eq("id", planId);

  if (error) {
    const message = `No se pudo actualizar el plan: ${toFriendlyPlanErrorMessage(error.message)}`;
    redirect("/superadmin/plans?status=error&message=" + qs(message));
  }

  await supabase.from("plan_modules").delete().eq("plan_id", planId);
  if (moduleIdsForPlan.length > 0) {
    await supabase.from("plan_modules").insert(
      moduleIdsForPlan.map((moduleId) => ({
        plan_id: planId,
        module_id: moduleId,
        is_enabled: true,
      })),
    );
  }

  await syncOrganizationsModulesForPlan(supabase, planId);

  await logAuditEvent({
    action: "plan.update",
    entityType: "plan",
    entityId: planId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "high",
    metadata: {
      name,
      isActive,
      priceAmount,
      currencyCode,
      billingPeriod,
      maxBranches,
      maxUsers,
      maxEmployees,
      maxStorageMb,
      moduleCount: moduleIdsForPlan.length,
    },
  });

  revalidatePath("/superadmin/plans");
  redirect("/superadmin/plans?status=success&message=" + qs("Plan actualizado correctamente"));
}

export async function deletePlanAction(formData: FormData) {
  await requireSuperadmin();

  const planId = String(formData.get("plan_id") ?? "");

  if (!planId) {
    redirect("/superadmin/plans?status=error&message=" + qs("No se recibio el plan a eliminar"));
  }

  const supabase = createSupabaseAdminClient();

  const { count: organizationsUsingPlan, error: usageError } = await supabase
    .from("organizations")
    .select("id", { head: true, count: "exact" })
    .eq("plan_id", planId);

  if (usageError) {
    redirect(
      "/superadmin/plans?status=error&message=" +
        qs(`No se pudo validar uso del plan: ${usageError.message}`),
    );
  }

  if ((organizationsUsingPlan ?? 0) > 0) {
    redirect(
      "/superadmin/plans?status=error&message=" +
        qs("No se puede borrar el plan porque hay empresas asignadas"),
    );
  }

  const { error } = await supabase.from("plans").delete().eq("id", planId);

  if (error) {
    redirect(
      "/superadmin/plans?status=error&message=" +
        qs(`No se pudo eliminar el plan: ${toFriendlyPlanErrorMessage(error.message)}`),
    );
  }

  await logAuditEvent({
    action: "plan.delete",
    entityType: "plan",
    entityId: planId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "critical",
  });

  revalidatePath("/superadmin/plans");
  redirect("/superadmin/plans?status=success&message=" + qs("Plan eliminado correctamente"));
}

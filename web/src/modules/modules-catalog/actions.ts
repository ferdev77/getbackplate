"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { stripe } from "@/infrastructure/stripe/client";

function qs(message: string) {
  return encodeURIComponent(message);
}

const NON_DEMOTABLE_CORE_MODULES = new Set(["dashboard", "settings", "employees", "documents"]);
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
        qs("The selected module was not found"),
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
        qs(`The core module '${currentModule.name}' cannot be made optional`),
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
      qs(`Module '${name}' updated successfully`),
  );
}

export async function updateModuleAddonAction(formData: FormData) {
  await requireSuperadmin();

  const moduleId = String(formData.get("module_id") ?? "");
  const isAvailableAsAddon = String(formData.get("is_available_as_addon") ?? "") === "on";
  const addonName = String(formData.get("addon_name") ?? "").trim() || null;
  const addonDescription = String(formData.get("addon_description") ?? "").trim() || null;
  const addonStripePriceId = String(formData.get("addon_stripe_price_id") ?? "").trim() || null;
  const integrationPlanType = String(formData.get("integration_plan_type") ?? "").trim() || null;

  if (!moduleId) {
    redirect("/superadmin/modules?status=error&message=" + qs("Module not specified"));
  }

  let addonPriceAmount: number | null = null;
  let addonCurrencyCode = "USD";

  // Only resolve Stripe price for simple (non-tiered) add-ons
  if (addonStripePriceId && !integrationPlanType) {
    try {
      const price = await stripe.prices.retrieve(addonStripePriceId);
      addonPriceAmount = price.unit_amount ? price.unit_amount / 100 : 0;
      addonCurrencyCode = price.currency.toUpperCase();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      redirect("/superadmin/modules?status=error&message=" + qs(`Invalid Stripe Price ID: ${message}`));
    }
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("module_catalog")
    .update({
      is_available_as_addon: isAvailableAsAddon,
      addon_name: addonName,
      addon_description: addonDescription,
      // Tiered add-ons don't use a single stripe_price_id
      addon_stripe_price_id: integrationPlanType ? null : addonStripePriceId,
      addon_price_amount: integrationPlanType ? null : addonPriceAmount,
      addon_currency_code: integrationPlanType ? null : addonCurrencyCode,
      integration_plan_type: integrationPlanType,
    })
    .eq("id", moduleId);

  if (error) {
    redirect("/superadmin/modules?status=error&message=" + qs(`Update failed: ${error.message}`));
  }

  await logAuditEvent({
    action: "module.addon_config_updated",
    entityType: "module",
    entityId: moduleId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "medium",
    metadata: { isAvailableAsAddon, addonStripePriceId },
  });

  revalidatePath("/superadmin/modules");

  redirect(
    "/superadmin/modules?status=success&message=" +
      qs("Add-on configuration updated successfully"),
  );
}

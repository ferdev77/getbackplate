"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { stripe } from "@/infrastructure/stripe/client";
import {
  normalizeBillingPeriod,
  normalizeCurrencyCode,
  normalizePlanCode,
  normalizePlanType,
  parseFeatures,
  parsePriceAmount,
  toFriendlyPlanErrorMessage,
  toNullableInt,
} from "@/modules/plans/lib/normalize";

function qs(message: string) {
  return encodeURIComponent(message);
}

function revalidatePlanSurfaces(planType: string) {
  revalidatePath("/superadmin/plans");
  revalidatePath("/");

  if (planType === "qbo_r365") {
    revalidatePath("/integrations/qbo-r365");
  }
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
  const planType = normalizePlanType(String(formData.get("plan_type") ?? "platform"));
  const isFeatured = String(formData.get("is_featured") ?? "") === "on";
  const isEnterprise = String(formData.get("is_enterprise") ?? "") === "on";
  const features = parseFeatures(formData.get("features"));
  const ctaText = String(formData.get("cta_text") ?? "").trim() || null;
  const ctaEmail = String(formData.get("cta_email") ?? "").trim() || null;
  const sortOrder = toNullableInt(formData.get("sort_order")) ?? 0;
  const invoicesIncluded = toNullableInt(formData.get("invoices_included"));
  const maxR365Connections = toNullableInt(formData.get("max_r365_connections"));
  const setupFeeStripePriceId = String(formData.get("setup_fee_stripe_price_id") ?? "").trim() || null;
  const rawDiscountPct = parseInt(String(formData.get("setup_fee_annual_discount_pct") ?? "25"), 10);
  const setupFeeAnnualDiscountPct = Number.isNaN(rawDiscountPct) ? 25 : Math.min(100, Math.max(0, rawDiscountPct));

  let setupFeeAmount = parsePriceAmount(formData.get("setup_fee_amount"));
  let priceAmount = parsePriceAmount(formData.get("price_amount"));
  let currencyCode = normalizeCurrencyCode(String(formData.get("currency_code") ?? "USD")) || "USD";

  if (stripePriceId) {
    try {
      const price = await stripe.prices.retrieve(stripePriceId);
      priceAmount = price.unit_amount ? price.unit_amount / 100 : 0;
      currencyCode = price.currency.toUpperCase();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      redirect("/superadmin/plans?status=error&message=" + qs(`Invalid Stripe Price ID: ${message}`));
    }
  }

  if (setupFeeStripePriceId) {
    try {
      const price = await stripe.prices.retrieve(setupFeeStripePriceId);
      setupFeeAmount = price.unit_amount ? price.unit_amount / 100 : 0;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      redirect("/superadmin/plans?status=error&message=" + qs(`Invalid setup fee Stripe Price ID: ${message}`));
    }
  }

  if (!code || !name) {
    redirect("/superadmin/plans?status=error&message=" + qs("Enter a plan code and name"));
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
      plan_type: planType,
      is_featured: isFeatured,
      is_enterprise: isEnterprise,
      setup_fee_amount: setupFeeAmount,
      setup_fee_annual_discount_pct: setupFeeAnnualDiscountPct,
      features,
      cta_text: ctaText,
      cta_email: ctaEmail,
      sort_order: sortOrder,
      invoices_included: invoicesIncluded,
      max_r365_connections: maxR365Connections,
    })
    .select("id")
    .single();

  if (error) {
    const message = `Could not create the plan: ${toFriendlyPlanErrorMessage(error.message)}`;
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

  revalidatePlanSurfaces(planType);
  redirect("/superadmin/plans?status=success&message=" + qs("Plan created successfully"));
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
  const planType = normalizePlanType(String(formData.get("plan_type") ?? "platform"));
  const isFeatured = String(formData.get("is_featured") ?? "") === "on";
  const isEnterprise = String(formData.get("is_enterprise") ?? "") === "on";
  const features = parseFeatures(formData.get("features"));
  const ctaText = String(formData.get("cta_text") ?? "").trim() || null;
  const ctaEmail = String(formData.get("cta_email") ?? "").trim() || null;
  const sortOrder = toNullableInt(formData.get("sort_order")) ?? 0;
  const invoicesIncluded = toNullableInt(formData.get("invoices_included"));
  const maxR365Connections = toNullableInt(formData.get("max_r365_connections"));
  const setupFeeStripePriceId = String(formData.get("setup_fee_stripe_price_id") ?? "").trim() || null;
  const rawDiscountPctU = parseInt(String(formData.get("setup_fee_annual_discount_pct") ?? "25"), 10);
  const setupFeeAnnualDiscountPct = Number.isNaN(rawDiscountPctU) ? 25 : Math.min(100, Math.max(0, rawDiscountPctU));

  let setupFeeAmount = parsePriceAmount(formData.get("setup_fee_amount"));
  let priceAmount = parsePriceAmount(formData.get("price_amount"));
  let currencyCode = normalizeCurrencyCode(String(formData.get("currency_code") ?? "USD")) || "USD";

  if (stripePriceId) {
    try {
      const price = await stripe.prices.retrieve(stripePriceId);
      priceAmount = price.unit_amount ? price.unit_amount / 100 : 0;
      currencyCode = price.currency.toUpperCase();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      redirect("/superadmin/plans?status=error&message=" + qs(`Invalid Stripe Price ID: ${message}`));
    }
  }

  if (setupFeeStripePriceId) {
    try {
      const price = await stripe.prices.retrieve(setupFeeStripePriceId);
      setupFeeAmount = price.unit_amount ? price.unit_amount / 100 : 0;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      redirect("/superadmin/plans?status=error&message=" + qs(`Invalid setup fee Stripe Price ID: ${message}`));
    }
  }

  const selectedModuleIds = new Set(
    formData
      .getAll("module_ids")
      .map((value) => String(value).trim())
      .filter(Boolean),
  );

  if (!planId || !name) {
    redirect("/superadmin/plans?status=error&message=" + qs("Missing plan update data"));
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
      plan_type: planType,
      is_featured: isFeatured,
      is_enterprise: isEnterprise,
      setup_fee_amount: setupFeeAmount,
      setup_fee_annual_discount_pct: setupFeeAnnualDiscountPct,
      features,
      cta_text: ctaText,
      cta_email: ctaEmail,
      sort_order: sortOrder,
      invoices_included: invoicesIncluded,
      max_r365_connections: maxR365Connections,
    })
    .eq("id", planId);

  if (error) {
    const message = `Could not update the plan: ${toFriendlyPlanErrorMessage(error.message)}`;
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

  revalidatePlanSurfaces(planType);
  redirect("/superadmin/plans?status=success&message=" + qs("Plan updated successfully"));
}

export async function deletePlanAction(formData: FormData) {
  await requireSuperadmin();

  const planId = String(formData.get("plan_id") ?? "");

  if (!planId) {
    redirect("/superadmin/plans?status=error&message=" + qs("No plan was provided for deletion"));
  }

  const supabase = createSupabaseAdminClient();

  const { count: organizationsUsingPlan, error: usageError } = await supabase
    .from("organizations")
    .select("id", { head: true, count: "exact" })
    .eq("plan_id", planId);

  if (usageError) {
    redirect(
      "/superadmin/plans?status=error&message=" +
        qs(`Could not validate plan usage: ${usageError.message}`),
    );
  }

  if ((organizationsUsingPlan ?? 0) > 0) {
    redirect(
      "/superadmin/plans?status=error&message=" +
        qs("The plan cannot be deleted because organizations are assigned to it"),
    );
  }

  const { data: planRow, error: planLookupError } = await supabase
    .from("plans")
    .select("plan_type")
    .eq("id", planId)
    .single();

  if (planLookupError) {
    redirect(
      "/superadmin/plans?status=error&message=" +
        qs(`Could not retrieve the plan type: ${toFriendlyPlanErrorMessage(planLookupError.message)}`),
    );
  }

  const deletedPlanType = normalizePlanType(String(planRow?.plan_type ?? "platform"));

  const { error } = await supabase.from("plans").delete().eq("id", planId);

  if (error) {
    redirect(
      "/superadmin/plans?status=error&message=" +
        qs(`Could not delete the plan: ${toFriendlyPlanErrorMessage(error.message)}`),
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

  revalidatePlanSurfaces(deletedPlanType);
  redirect("/superadmin/plans?status=success&message=" + qs("Plan deleted successfully"));
}

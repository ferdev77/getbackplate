"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { legalConsentMetadata } from "@/shared/lib/legal-consent";
import { logAuthEvent } from "@/shared/lib/audit";
import { setActiveOrganizationIdCookie } from "@/shared/lib/tenant-selection";
import { shouldEnableRegistrationModule } from "@/modules/auth/registration-module-rules";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
}

function completeUrl(message: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ error: message, ...params });
  return `/auth/intuit/complete?${query.toString()}`;
}

export async function completeIntuitRegistrationAction(formData: FormData) {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const accepted = formData.get("legalAccepted") === "on";
  const integrationPlanId = String(formData.get("integrationPlanId") ?? "").trim();
  const billingPeriod = String(formData.get("billingPeriod") ?? "") === "annual" ? "annual" : "monthly";
  const billingTrack = formData.get("billingTrack") === "platform" ? "platform" : "integration";
  const includeSetupFee = formData.get("includeSetupFee") !== "0";
  const preserved: Record<string, string> = integrationPlanId
    ? { integrationPlanId, billingPeriod, billingTrack: "integration", includeSetupFee: includeSetupFee ? "1" : "0" }
    : { billingTrack };

  if (!companyName || !fullName || !accepted) {
    redirect(completeUrl("Complete the company details and accept the legal terms.", preserved));
  }

  const server = await createSupabaseServerClient();
  const { data } = await server.auth.getUser();
  if (!data.user) redirect("/auth/login?desde=integracion");

  const admin = createSupabaseAdminClient();
  const { data: identity } = await admin
    .from("external_auth_identities")
    .select("id")
    .eq("provider", "intuit")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!identity) redirect("/auth/login?desde=integracion&error=Restart+Sign+in+with+Intuit.");

  const { data: existingMembership } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", data.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existingMembership) redirect("/app/dashboard");

  if (integrationPlanId) {
    const { data: plan } = await admin
      .from("plans")
      .select("id")
      .eq("id", integrationPlanId)
      .eq("plan_type", "qbo_r365")
      .eq("is_active", true)
      .maybeSingle();
    if (!plan) redirect(completeUrl("The selected integration plan is unavailable."));
  }

  const { data: organizationId, error: provisioningError } = await admin.rpc("provision_intuit_sso_organization", {
    p_user_id: data.user.id,
    p_company_name: companyName,
    p_slug_base: slugify(companyName) || "organization",
  });
  if (provisioningError || !organizationId) {
    console.error("[intuit-sso] organization provisioning failed", provisioningError?.message ?? "unknown");
    redirect(completeUrl("Your organization could not be completed. Please try again.", preserved));
  }

  const { error: onboardingTrackError } = await admin
    .from("organizations")
    .update({ billing_onboarding_track: integrationPlanId ? "integration" : billingTrack })
    .eq("id", organizationId);
  if (onboardingTrackError) {
    console.error("[intuit-sso] billing onboarding track update failed", onboardingTrackError.message);
    redirect(completeUrl("Your selected product could not be saved. Please try again.", preserved));
  }

  const resolvedOnboardingTrack = integrationPlanId ? "integration" : billingTrack;
  const { data: modules, error: modulesError } = await admin.from("module_catalog").select("id, code, is_core");
  if (modulesError) {
    console.error("[intuit-sso] registration module lookup failed", modulesError.message);
    redirect(completeUrl("Your selected product could not be prepared. Please try again.", preserved));
  }
  if (modules?.length) {
    const { error: moduleSyncError } = await admin.from("organization_modules").upsert(
      modules.map((module) => {
        const isEnabled = shouldEnableRegistrationModule({ code: module.code, isCore: Boolean(module.is_core) }, resolvedOnboardingTrack);
        return {
          organization_id: organizationId,
          module_id: module.id,
          is_enabled: isEnabled,
          enabled_at: isEnabled ? new Date().toISOString() : null,
        };
      }),
      { onConflict: "organization_id,module_id" },
    );
    if (moduleSyncError) {
      console.error("[intuit-sso] registration module sync failed", moduleSyncError.message);
      redirect(completeUrl("Your selected product could not be prepared. Please try again.", preserved));
    }
  }

  await admin.auth.admin.updateUserById(data.user.id, {
    user_metadata: { ...data.user.user_metadata, full_name: fullName },
  });

  await logAuthEvent({
    action: "login.success",
    outcome: "success",
    organizationId,
    severity: "high",
    metadata: {
      is_registration: true,
      provider: "intuit",
      legalAccepted: true,
      ...legalConsentMetadata(),
    },
  });
  await setActiveOrganizationIdCookie(organizationId);

  if (integrationPlanId) {
    redirect(`/app/dashboard?welcome=true&selectIntegrationPlanId=${encodeURIComponent(integrationPlanId)}&billingPeriod=${billingPeriod}&includeSetupFee=${includeSetupFee ? "1" : "0"}`);
  }
  redirect(`/app/dashboard?welcome=true&billingTrack=${billingTrack}`);
}

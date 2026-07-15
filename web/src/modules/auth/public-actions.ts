"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { logAuthEvent } from "@/shared/lib/audit";
import { setActiveOrganizationIdCookie } from "@/shared/lib/tenant-selection";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function qs(message: string) {
  return encodeURIComponent(message);
}

export async function registerPublicAction(formData: FormData) {
  try {
    const companyName = String(formData.get("companyName") ?? "").trim();
    const fullName = String(formData.get("fullName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const planIdParam = String(formData.get("planId") ?? "").trim();
    const integrationPlanIdParam = String(formData.get("integrationPlanId") ?? "").trim();
    const billingPeriodParam = String(formData.get("billingPeriod") ?? "").trim();
    const normalizedBillingPeriod =
      billingPeriodParam === "yearly" || billingPeriodParam === "annual" ? "yearly" : "monthly";
    
    // Validations
    if (!companyName || !fullName || !email || !password) {
      redirect("/auth/register?error=" + qs("Complete all required fields."));
    }

    if (password.length < 8) {
      redirect("/auth/register?error=" + qs("Your password must contain at least 8 characters."));
    }

    const supabaseAdmin = createSupabaseAdminClient();

    if (integrationPlanIdParam) {
      const { data: integrationPlan } = await supabaseAdmin
        .from("plans")
        .select("id")
        .eq("id", integrationPlanIdParam)
        .eq("plan_type", "qbo_r365")
        .eq("is_active", true)
        .maybeSingle();
      if (!integrationPlan) {
        redirect("/auth/register?error=" + qs("The selected integration plan is unavailable."));
      }
    }

    // 1. Create the Auth User
    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (createUserError) {
       console.error("Public Registration - Auth Error:", createUserError);
       const errorMsg = createUserError.message.toLowerCase().includes("already") 
        ? "This email address is already registered. Please sign in."
        : "Your account could not be created. Please try again.";
       redirect("/auth/register?error=" + qs(errorMsg));
    }

    const userId = createdUser.user.id;

    // 2. Create the Organization (Tenant)
    const slug = slugify(companyName) || `org-${Math.random().toString(36).slice(2, 8)}`;
    
    let org: { id: string } | null = null;
    let orgError: { message?: string } | null = null;

    const createOrgWithBillingDefaults = await supabaseAdmin
      .from("organizations")
      .insert({
        name: companyName,
        slug,
        created_by: userId,
        billing_onboarding_required: true,
        billing_activation_status: "pending",
      })
      .select("id")
      .single();

    org = createOrgWithBillingDefaults.data;
    orgError = createOrgWithBillingDefaults.error;

    const missingBillingColumns =
      Boolean(orgError?.message?.includes("billing_onboarding_required")) ||
      Boolean(orgError?.message?.includes("billing_activation_status"));

    if (!org && missingBillingColumns) {
      const legacyCreateOrg = await supabaseAdmin
        .from("organizations")
        .insert({
          name: companyName,
          slug,
          created_by: userId,
        })
        .select("id")
        .single();

      org = legacyCreateOrg.data;
      orgError = legacyCreateOrg.error;
    }

    if (orgError || !org) {
      console.error("Public Registration - Org Error:", orgError);
      redirect("/auth/register?error=" + qs("Your organization could not be created. Contact support."));
    }

    // 3. Assign Core Modules
    const { data: modules } = await supabaseAdmin
      .from("module_catalog")
      .select("id")
      .eq("is_core", true);

    if (modules?.length) {
      await supabaseAdmin.from("organization_modules").insert(
        modules.map((mod) => ({
          organization_id: org.id,
          module_id: mod.id,
          is_enabled: true,
          enabled_at: new Date().toISOString(),
        }))
      );
    }

    // 4. Assign Company Admin Role
    const { data: role } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("code", "company_admin")
      .single();

    if (role) {
      await supabaseAdmin.from("memberships").upsert({
        organization_id: org.id,
        user_id: userId,
        role_id: role.id,
        status: "active",
      });
    }

    // 5. Audit Log (using login.success for now as register.success is not in strictly typed union)
    await logAuthEvent({
      action: "login.success",
      outcome: "success",
      organizationId: org.id,
      severity: "high",
      metadata: {
        is_registration: true,
        email,
        companyName,
        provider: "password",
      },
    });

    // We must sign them in now so the browser gets the session cookie
    // MUST use the ServerClient, not Admin Client, so cookies are set!
    const { createSupabaseServerClient } = await import("@/infrastructure/supabase/client/server");
    const supabaseServer = await createSupabaseServerClient();
    await supabaseServer.auth.signInWithPassword({
        email,
        password
    });
    
    // Set the tenant cookie
    await setActiveOrganizationIdCookie(org.id);

    // 6. Continue the selected checkout flow after the new session is established.
    if (integrationPlanIdParam) {
      const integrationPeriod = billingPeriodParam === "annual" ? "annual" : "monthly";
      redirect(`/app/dashboard?welcome=true&selectIntegrationPlanId=${encodeURIComponent(integrationPlanIdParam)}&billingPeriod=${integrationPeriod}`);
    }

    if (planIdParam) {
        redirect(`/app/dashboard?welcome=true&selectPlanId=${planIdParam}&billingPeriod=${normalizedBillingPeriod}`);
    }

    redirect("/app/dashboard?welcome=true");

  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
        throw error;
    }
    console.error("Registration Action Failed", error);
    redirect("/auth/register?error=" + qs("An unexpected error occurred while creating your account."));
  }
}

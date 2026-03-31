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
    const billingPeriodParam = String(formData.get("billingPeriod") ?? "").trim();
    const normalizedBillingPeriod =
      billingPeriodParam === "yearly" || billingPeriodParam === "annual" ? "yearly" : "monthly";
    
    // Validations
    if (!companyName || !fullName || !email || !password) {
      redirect("/auth/register?error=" + qs("Completa todos los campos obligatorios"));
    }

    if (password.length < 8) {
      redirect("/auth/register?error=" + qs("La contraseña debe tener al menos 8 caracteres"));
    }

    const supabaseAdmin = createSupabaseAdminClient();

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
        ? "El email ya está registrado. Por favor, inicia sesión." 
        : `Error al crear usuario: ${createUserError.message}`;
       redirect("/auth/register?error=" + qs(errorMsg));
    }

    const userId = createdUser.user.id;

    // 2. Create the Organization (Tenant)
    const slug = slugify(companyName) || `org-${Math.random().toString(36).slice(2, 8)}`;
    
    const { data: org, error: orgError } = await supabaseAdmin
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

    if (orgError || !org) {
      console.error("Public Registration - Org Error:", orgError);
      redirect("/auth/register?error=" + qs("No se pudo crear la empresa. Contacta a soporte."));
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

    // 6. Direct them to the dashboard, highlighting the plan if selected
    if (planIdParam) {
        redirect(`/app/dashboard?welcome=true&selectPlanId=${planIdParam}&billingPeriod=${normalizedBillingPeriod}`);
    }

    redirect("/app/dashboard?welcome=true");

  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
        throw error;
    }
    console.error("Registration Action Failed", error);
    redirect("/auth/register?error=" + qs("Ocurrió un error inesperado al registrarte."));
  }
}

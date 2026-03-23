"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getCurrentUserMemberships } from "@/modules/memberships/queries";
import { logAuditEvent, logAuthEvent } from "@/shared/lib/audit";
import { AUDIT_REASON_CODES } from "@/shared/lib/audit-taxonomy";
import {
  getActiveOrganizationIdFromCookie,
  setActiveOrganizationIdCookie,
} from "@/shared/lib/tenant-selection";

function getEmailDomain(email: string) {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1]?.toLowerCase() ?? null : null;
}

function getAppUrl() {
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicUrl) return publicUrl.replace(/\/$/, "");

  const baseUrl = process.env.APP_BASE_URL?.trim();
  if (baseUrl) return baseUrl.replace(/\/$/, "");

  return null;
}

export async function loginWithPasswordAction(formData: FormData) {
  try {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const emailDomain = getEmailDomain(email);

    if (!email || !password) {
      await logAuthEvent({
        action: "login.failed",
        outcome: "denied",
        severity: "medium",
        reasonCode: AUDIT_REASON_CODES.MISSING_CREDENTIALS,
        metadata: {
          email_domain: emailDomain,
        },
      });
      redirect("/auth/login?error=Completa+email+y+contrasena");
    }

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      await logAuthEvent({
        action: "login.failed",
        outcome: "denied",
        severity: "medium",
        reasonCode: AUDIT_REASON_CODES.INVALID_CREDENTIALS,
        metadata: {
          email_domain: emailDomain,
          provider: "password",
        },
      });
      redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      await logAuthEvent({
        action: "login.failed",
        outcome: "error",
        severity: "high",
        reasonCode: AUDIT_REASON_CODES.SESSION_VALIDATION_FAILED,
        metadata: {
          email_domain: emailDomain,
        },
      });
      redirect("/auth/login?error=" + encodeURIComponent("No se pudo validar la sesion"));
    }

    if (Boolean((authData.user.user_metadata as Record<string, unknown> | undefined)?.force_password_change)) {
      redirect("/auth/change-password?reason=first_login");
    }

    const admin = createSupabaseAdminClient();

    const { data: superadminRow } = await admin
      .from("superadmin_users")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (superadminRow?.user_id) {
      await logAuthEvent({
        action: "login.success",
        outcome: "success",
        severity: "low",
        metadata: {
          landing: "/superadmin/dashboard",
          provider: "password",
          role: "superadmin",
        },
      });
      redirect("/superadmin/dashboard");
    }

    const { data: memberships, error: membershipsError } = await admin
      .from("memberships")
      .select("role_id, organization_id")
      .eq("user_id", authData.user.id)
      .eq("status", "active");

    if (membershipsError) {
      await logAuthEvent({
        action: "login.failed",
        outcome: "error",
        severity: "high",
        reasonCode: AUDIT_REASON_CODES.MEMBERSHIPS_QUERY_FAILED,
        metadata: {
          provider: "password",
        },
      });
      redirect(
        "/auth/login?error=" +
          encodeURIComponent(`No se pudo cargar membresias: ${membershipsError.message}`),
      );
    }

    const roleIds = [...new Set((memberships ?? []).map((row) => row.role_id))];

    if (!roleIds.length) {
      await logAuthEvent({
        action: "login.failed",
        outcome: "denied",
        severity: "medium",
        reasonCode: AUDIT_REASON_CODES.NO_ACTIVE_MEMBERSHIPS,
        metadata: {
          provider: "password",
        },
      });
      redirect(
        "/auth/login?error=" +
          encodeURIComponent("Tu usuario no tiene acceso asignado. Contacta al administrador."),
      );
    }

    const { data: roles, error: rolesError } = await admin
      .from("roles")
      .select("id, code")
      .in("id", roleIds);

    if (rolesError) {
      await logAuthEvent({
        action: "login.failed",
        outcome: "error",
        severity: "high",
        reasonCode: AUDIT_REASON_CODES.ROLES_QUERY_FAILED,
        metadata: {
          provider: "password",
        },
      });
      redirect(
        "/auth/login?error=" +
          encodeURIComponent(`No se pudieron cargar roles: ${rolesError.message}`),
      );
    }

    const roleCodeById = new Map((roles ?? []).map((role) => [role.id, role.code]));
    const membershipContexts = (memberships ?? []).map((row) => ({
      organizationId: row.organization_id,
      roleCode: roleCodeById.get(row.role_id) ?? "",
    }));
    const organizations = [...new Set(membershipContexts.map((row) => row.organizationId))];

    const preferredOrganizationId = await getActiveOrganizationIdFromCookie();
    const hasPreferredOrganization = Boolean(
      preferredOrganizationId && organizations.includes(preferredOrganizationId),
    );

    if (organizations.length > 1 && !hasPreferredOrganization) {
      await logAuthEvent({
        action: "login.success",
        outcome: "success",
        severity: "low",
        metadata: {
          landing: "/auth/select-organization",
          provider: "password",
        },
      });
      redirect("/auth/select-organization");
    }

    const resolvedOrganizationId =
      (hasPreferredOrganization ? preferredOrganizationId : organizations[0]) ?? null;

    if (resolvedOrganizationId) {
      await setActiveOrganizationIdCookie(resolvedOrganizationId);
    }

    const roleCodesInResolvedOrganization = new Set(
      membershipContexts
        .filter((row) => row.organizationId === resolvedOrganizationId)
        .map((row) => row.roleCode),
    );

    if (
      roleCodesInResolvedOrganization.has("company_admin") ||
      roleCodesInResolvedOrganization.has("manager")
    ) {
      await logAuthEvent({
        action: "login.success",
        outcome: "success",
        organizationId: resolvedOrganizationId,
        severity: "low",
        metadata: {
          landing: "/app/dashboard",
          provider: "password",
        },
      });
      redirect("/app/dashboard");
    }

    if (roleCodesInResolvedOrganization.has("employee")) {
      await logAuthEvent({
        action: "login.success",
        outcome: "success",
        organizationId: resolvedOrganizationId,
        severity: "low",
        metadata: {
          landing: "/portal/home",
          provider: "password",
        },
      });
      redirect("/portal/home");
    }

  await logAuthEvent({
      action: "login.success",
      outcome: "success",
      organizationId: resolvedOrganizationId,
      severity: "low",
      metadata: {
        landing: "/app/dashboard",
        provider: "password",
        reason: "fallback_role_routing",
      },
    });

    redirect("/app/dashboard");
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    await logAuthEvent({
      action: "login.failed",
      outcome: "error",
      severity: "high",
      reasonCode: AUDIT_REASON_CODES.UNEXPECTED_LOGIN_EXCEPTION,
      metadata: {
        error_message: error instanceof Error ? error.message : "unknown",
      },
    });

    redirect(
      "/auth/login?error=" +
        encodeURIComponent(
          `Error en inicio de sesion: ${error instanceof Error ? error.message : "desconocido"}`,
        ),
    );
  }
}

export async function requestPasswordRecoveryAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email) {
    redirect("/auth/forgot-password?error=" + encodeURIComponent("Ingresa un email valido"));
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = getAppUrl();
  const nextPath = "/auth/change-password?reason=recovery";
  const redirectTo = appUrl
    ? `${appUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`
    : undefined;

  const { error } = await supabase.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  );

  if (error) {
    redirect(
      "/auth/forgot-password?error=" +
        encodeURIComponent(`No se pudo enviar el correo de recuperacion: ${error.message}`),
    );
  }

  redirect(
    "/auth/forgot-password?status=success&message=" +
      encodeURIComponent("Te enviamos un enlace para restablecer tu contrasena"),
  );
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const nextPath = String(formData.get("next") ?? "").trim();

  if (!password || password.length < 8) {
    await logAuditEvent({
      action: "password.update.failed",
      entityType: "auth_session",
      eventDomain: "auth",
      outcome: "denied",
      severity: "low",
      metadata: {
        reason: "password_too_short",
      },
    });
    redirect(
      "/auth/change-password?error=" +
        encodeURIComponent("La contrasena debe tener al menos 8 caracteres"),
    );
  }

  if (password !== confirmPassword) {
    await logAuditEvent({
      action: "password.update.failed",
      entityType: "auth_session",
      eventDomain: "auth",
      outcome: "denied",
      severity: "low",
      metadata: {
        reason: "password_confirmation_mismatch",
      },
    });
    redirect(
      "/auth/change-password?error=" +
        encodeURIComponent("La confirmacion de contrasena no coincide"),
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    await logAuditEvent({
      action: "password.update.failed",
      entityType: "auth_session",
      eventDomain: "auth",
      outcome: "denied",
      severity: "medium",
      metadata: {
        reason: "missing_authenticated_user",
      },
    });
    redirect("/auth/login?error=" + encodeURIComponent("Tu sesion expiro. Inicia sesion nuevamente"));
  }

  const currentMetadata =
    user.user_metadata && typeof user.user_metadata === "object"
      ? (user.user_metadata as Record<string, unknown>)
      : {};

  const { error } = await supabase.auth.updateUser({
    password,
    data: {
      ...currentMetadata,
      force_password_change: false,
      password_changed_at: new Date().toISOString(),
    },
  });

  if (error) {
    await logAuditEvent({
      action: "password.update.failed",
      entityType: "auth_session",
      eventDomain: "auth",
      outcome: "error",
      severity: "high",
      metadata: {
        reason: "supabase_update_failed",
        error_message: error.message,
      },
    });
    redirect(
      "/auth/change-password?error=" +
        encodeURIComponent(`No se pudo actualizar la contrasena: ${error.message}`),
    );
  }

  await logAuditEvent({
    action: "password.update.success",
    entityType: "auth_session",
    eventDomain: "auth",
    outcome: "success",
    severity: "low",
    metadata: {
      redirect_to: nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/app/dashboard",
    },
  });

  if (nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    redirect(nextPath);
  }

  redirect("/app/dashboard");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await logAuthEvent({
    action: "logout.success",
    outcome: "success",
    severity: "low",
    metadata: {
      provider: "supabase",
    },
  });
  await supabase.auth.signOut();
  redirect("/auth/login");
}

export async function selectOrganizationAction(formData: FormData) {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const nextPath = String(formData.get("next_path") ?? "").trim();

  if (!organizationId) {
    redirect("/auth/select-organization?error=" + encodeURIComponent("Selecciona una empresa"));
  }

  const memberships = await getCurrentUserMemberships();
  if (!memberships.length) {
    redirect(
      "/auth/login?error=" +
        encodeURIComponent("Tu usuario no tiene acceso asignado. Contacta al administrador."),
    );
  }

  const organizationMemberships = memberships.filter(
    (membership) => membership.organizationId === organizationId,
  );

  if (!organizationMemberships.length) {
    redirect(
      "/auth/select-organization?error=" +
        encodeURIComponent("No tienes acceso a la empresa seleccionada"),
    );
  }

  await setActiveOrganizationIdCookie(organizationId);

  const roleCodes = new Set(organizationMemberships.map((membership) => membership.roleCode));

  if (nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    redirect(nextPath);
  }

  if (mode === "employee") {
    if (roleCodes.has("employee")) {
      redirect("/portal/home");
    }

    redirect(
      "/app/dashboard?status=error&message=" +
        encodeURIComponent("No tienes rol de empleado en esta empresa"),
    );
  }

  if (mode === "company") {
    if (roleCodes.has("company_admin") || roleCodes.has("manager")) {
      redirect("/app/dashboard");
    }

    if (roleCodes.has("employee")) {
      redirect("/portal/home");
    }

    redirect(
      "/auth/select-organization?error=" +
        encodeURIComponent("No tienes permisos para ingresar a esta empresa"),
    );
  }

  if (roleCodes.has("company_admin") || roleCodes.has("manager")) {
    redirect("/app/dashboard");
  }

  if (roleCodes.has("employee")) {
    redirect("/portal/home");
  }

  redirect(
    "/auth/select-organization?error=" +
      encodeURIComponent("No tienes permisos para ingresar a esta empresa"),
  );
}

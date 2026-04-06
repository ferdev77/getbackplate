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
import { normalizeOrganizationId } from "@/shared/lib/tenant-selection-shared";
import { resolveOrganizationIdFromAuthHint } from "@/shared/lib/tenant-auth-branding";
import { getCanonicalAppUrl } from "@/shared/lib/app-url";
import { getDefaultEmailBranding, getTenantEmailBranding } from "@/shared/lib/email-branding";
import { sendEmail } from "@/shared/lib/brevo";
import { passwordRecoveryTemplate } from "@/shared/lib/email-templates/recovery";
import { buildRecoveryBridgeUrl } from "@/shared/lib/recovery-link";

function getEmailDomain(email: string) {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1]?.toLowerCase() ?? null : null;
}

function buildLoginPath(options?: { error?: string; organizationIdHint?: string | null }) {
  const search = new URLSearchParams();
  if (options?.error) {
    search.set("error", options.error);
  }
  if (options?.organizationIdHint) {
    search.set("org", options.organizationIdHint);
  }
  const query = search.toString();
  return query ? `/auth/login?${query}` : "/auth/login";
}

function buildForgotPasswordPath(options?: {
  error?: string;
  status?: "success";
  message?: string;
  organizationIdHint?: string | null;
}) {
  const search = new URLSearchParams();
  if (options?.error) {
    search.set("error", options.error);
  }
  if (options?.status) {
    search.set("status", options.status);
  }
  if (options?.message) {
    search.set("message", options.message);
  }
  if (options?.organizationIdHint) {
    search.set("org", options.organizationIdHint);
  }
  const query = search.toString();
  return query ? `/auth/forgot-password?${query}` : "/auth/forgot-password";
}

export async function loginWithPasswordAction(formData: FormData) {
  try {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const organizationHint = normalizeOrganizationId(
      String(formData.get("organization_id_hint") ?? ""),
    );
    const organizationIdHint = await resolveOrganizationIdFromAuthHint(organizationHint);
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
      redirect(buildLoginPath({ error: "Completa email y contrasena", organizationIdHint: organizationHint }));
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
      redirect(buildLoginPath({ error: error.message, organizationIdHint: organizationHint }));
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
      redirect(buildLoginPath({ error: "No se pudo validar la sesion", organizationIdHint: organizationHint }));
    }

    const admin = createSupabaseAdminClient();

    const { data: superadminRow } = await admin
      .from("superadmin_users")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (Boolean((authData.user.user_metadata as Record<string, unknown> | undefined)?.force_password_change)) {
      const nextAfterPassword = superadminRow?.user_id ? "/superadmin/dashboard" : "/app/dashboard";
      const orgQuery = organizationHint ? `&org=${encodeURIComponent(organizationHint)}` : "";
      redirect(`/auth/change-password?reason=first_login&next=${encodeURIComponent(nextAfterPassword)}${orgQuery}`);
    }

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
    const hintMatchesMembership = Boolean(
      organizationIdHint && organizations.includes(organizationIdHint),
    );
    const hasPreferredOrganization = Boolean(
      preferredOrganizationId && organizations.includes(preferredOrganizationId),
    );

    if (organizations.length > 1 && !hintMatchesMembership && !hasPreferredOrganization) {
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
      (hintMatchesMembership
        ? organizationIdHint
        : (hasPreferredOrganization ? preferredOrganizationId : organizations[0])) ?? null;

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
      buildLoginPath({
        error: `Error en inicio de sesion: ${error instanceof Error ? error.message : "desconocido"}`,
        organizationIdHint: normalizeOrganizationId(
          String(formData.get("organization_id_hint") ?? ""),
        ),
      }),
    );
  }
}

export async function requestPasswordRecoveryAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const organizationIdHint = normalizeOrganizationId(
    String(formData.get("organization_id_hint") ?? ""),
  );
  const resolvedOrganizationId = await resolveOrganizationIdFromAuthHint(organizationIdHint);

  if (!email) {
    redirect(buildForgotPasswordPath({ error: "Ingresa un email valido", organizationIdHint }));
  }

  const admin = createSupabaseAdminClient();
  const appUrl = getCanonicalAppUrl();
  const nextPath = "/auth/change-password?reason=recovery";
  const callbackPath = `/auth/callback?next=${encodeURIComponent(nextPath)}${resolvedOrganizationId ? `&org=${encodeURIComponent(resolvedOrganizationId)}` : ""}`;
  const redirectTo = `${appUrl}${callbackPath}`;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  const tokenHash = linkData?.properties?.hashed_token;

  if (linkError || !tokenHash) {
    const message = (linkError?.message || "").toLowerCase();
    if (message.includes("user") && (message.includes("not found") || message.includes("no user"))) {
      redirect(buildForgotPasswordPath({
        status: "success",
        message: "Te enviamos un enlace para restablecer tu contrasena",
        organizationIdHint,
      }));
    }

    redirect(buildForgotPasswordPath({
      error: `No se pudo preparar el enlace de recuperacion: ${linkError?.message || "intenta nuevamente"}`,
      organizationIdHint,
    }));
  }

  const branding = resolvedOrganizationId
    ? await getTenantEmailBranding(resolvedOrganizationId)
    : getDefaultEmailBranding();

  const recoveryBridgeUrl = buildRecoveryBridgeUrl({
    appUrl,
    tokenHash,
    organizationIdHint: resolvedOrganizationId,
  });

  const mailResult = await sendEmail({
    to: [{ email }],
    subject: `Restablece tu contrasena en ${branding.companyName || "GetBackplate"}`,
    htmlContent: passwordRecoveryTemplate({
      recoveryUrl: recoveryBridgeUrl,
      branding,
    }),
  });

  if (!mailResult.ok) {
    redirect(buildForgotPasswordPath({
      error: `No se pudo enviar el correo de recuperacion: ${mailResult.error}`,
      organizationIdHint,
    }));
  }

  redirect(buildForgotPasswordPath({
    status: "success",
    message: "Te enviamos un enlace para restablecer tu contrasena",
    organizationIdHint,
  }));
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const nextPath = String(formData.get("next") ?? "").trim();
  const safeNextPath = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : null;

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
      redirect_to: safeNextPath ?? "role_based_default",
    },
  });

  if (safeNextPath) {
    redirect(safeNextPath);
  }

  const admin = createSupabaseAdminClient();
  const { data: superadminRow } = await admin
    .from("superadmin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (superadminRow?.user_id) {
    redirect("/superadmin/dashboard");
  }

  const { data: memberships, error: membershipsError } = await admin
    .from("memberships")
    .select("role_id, organization_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipsError) {
    redirect(
      "/auth/login?error=" +
        encodeURIComponent(`No se pudo resolver tu acceso despues del cambio: ${membershipsError.message}`),
    );
  }

  const roleIds = [...new Set((memberships ?? []).map((row) => row.role_id))];
  if (!roleIds.length) {
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
    redirect(
      "/auth/login?error=" +
        encodeURIComponent(`No se pudo resolver tu rol despues del cambio: ${rolesError.message}`),
    );
  }

  const roleCodeById = new Map((roles ?? []).map((role) => [role.id, role.code]));
  const membershipContexts = (memberships ?? []).map((row) => ({
    organizationId: row.organization_id,
    roleCode: roleCodeById.get(row.role_id) ?? "",
  }));

  const organizations = [...new Set(membershipContexts.map((row) => row.organizationId))];
  const preferredOrganizationId = await getActiveOrganizationIdFromCookie();
  const resolvedOrganizationId =
    (preferredOrganizationId && organizations.includes(preferredOrganizationId)
      ? preferredOrganizationId
      : organizations[0]) ?? null;

  if (organizations.length > 1 && !preferredOrganizationId) {
    redirect("/auth/select-organization");
  }

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
    redirect("/app/dashboard");
  }

  if (roleCodesInResolvedOrganization.has("employee")) {
    redirect("/portal/home");
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

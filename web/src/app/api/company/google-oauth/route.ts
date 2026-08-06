import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCompanyAdminModuleApi, isModuleEnabledForOrganization } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { isSuperadminImpersonating } from "@/shared/lib/impersonation";
import {
  disableTenantGoogleOAuthConfig,
  getTenantGoogleOAuthStatus,
  saveTenantGoogleOAuthConfig,
} from "@/modules/auth/google-tenant/service";
import { TenantGoogleOAuthError } from "@/modules/auth/google-tenant/client";

const configSchema = z.object({
  clientId: z.string().trim().min(20).max(255).regex(/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/),
  clientSecret: z.string().trim().min(8).max(2048).optional().or(z.literal("")),
});

async function companyAccess() {
  return assertCompanyAdminModuleApi("settings");
}

async function requireCustomBranding(organizationId: string) {
  return isModuleEnabledForOrganization(organizationId, "custom_branding");
}

export async function GET() {
  const access = await companyAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    return NextResponse.json(await getTenantGoogleOAuthStatus(access.tenant.organizationId));
  } catch {
    return NextResponse.json({ error: "No se pudo cargar la configuración de Google." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const access = await companyAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!await requireCustomBranding(access.tenant.organizationId)) {
    return NextResponse.json({ error: "Custom Branding debe estar activo." }, { status: 403 });
  }
  if (await isSuperadminImpersonating(access.userId, access.tenant.organizationId)) {
    return NextResponse.json({ error: "Operación bloqueada en modo impersonación." }, { status: 403 });
  }
  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revisa el Client ID y el Client Secret." }, { status: 400 });
  }
  try {
    const status = await saveTenantGoogleOAuthConfig({
      organizationId: access.tenant.organizationId,
      userId: access.userId,
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret || undefined,
    });
    await logAuditEvent({
      action: "organization.google_oauth.credentials_saved",
      entityType: "organization_google_oauth_config",
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      eventDomain: "security",
      outcome: "success",
      severity: "high",
      metadata: { client_id_changed: true, client_secret_rotated: Boolean(parsed.data.clientSecret) },
    });
    return NextResponse.json(status);
  } catch (caught) {
    const message = caught instanceof TenantGoogleOAuthError ? caught.message : "No se pudo guardar la configuración.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const access = await companyAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!await requireCustomBranding(access.tenant.organizationId)) {
    return NextResponse.json({ error: "Custom Branding debe estar activo." }, { status: 403 });
  }
  if (await isSuperadminImpersonating(access.userId, access.tenant.organizationId)) {
    return NextResponse.json({ error: "Operación bloqueada en modo impersonación." }, { status: 403 });
  }
  try {
    const status = await disableTenantGoogleOAuthConfig(access.tenant.organizationId, access.userId);
    await logAuditEvent({
      action: "organization.google_oauth.disabled",
      entityType: "organization_google_oauth_config",
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      eventDomain: "security",
      outcome: "success",
      severity: "high",
    });
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ error: "No se pudo desactivar el acceso personalizado." }, { status: 500 });
  }
}

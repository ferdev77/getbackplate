import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { isSuperadminImpersonating } from "@/shared/lib/impersonation";

const requestSchema = z.object({
  kind: z.enum(["profile", "preferences", "billing", "theme"]),
  fullName: z.string().trim().max(120).optional(),
  twoFactorEnabled: z.boolean().optional(),
  twoFactorMethod: z.enum(["app", "sms", "email"]).optional(),
  theme: z.string().trim().min(1).max(40).optional(),
  language: z.string().trim().min(2).max(10).optional(),
  dateFormat: z.string().trim().min(4).max(24).optional(),
  timezoneMode: z.enum(["auto", "manual"]).optional(),
  timezoneManual: z.string().trim().max(80).optional(),
  analyticsEnabled: z.boolean().optional(),
  billingPlan: z.string().trim().max(80).optional(),
  billingPeriod: z.string().trim().max(20).optional(),
  billedTo: z.string().trim().max(120).optional(),
  billingEmail: z.string().trim().email().max(150).or(z.literal("")).optional(),
  paymentLast4: z.string().trim().regex(/^\d{0,4}$/).optional(),
  invoiceEmailsEnabled: z.boolean().optional(),
});

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("settings");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const userId = moduleAccess.userId;
  const supabase = await createSupabaseServerClient();

  const rawBody = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const body = parsed.data;
  const kind = body.kind;
  const impersonating = await isSuperadminImpersonating(userId, tenant.organizationId);

  if (
    impersonating &&
    (
      kind === "billing" ||
      (kind === "profile" && (body.twoFactorEnabled !== undefined || body.twoFactorMethod !== undefined))
    )
  ) {
    await logAuditEvent({
      action: "organization.impersonation.blocked_settings_write",
      entityType: "organization_setting",
      organizationId: tenant.organizationId,
      eventDomain: "security",
      outcome: "denied",
      severity: "high",
      metadata: {
        kind,
        blocked_reason: kind === "billing" ? "billing_write" : "security_profile_write",
      },
    });
    return NextResponse.json(
      { error: "impersonation_blocked", message: "Operación bloqueada en modo impersonación." },
      { status: 403 },
    );
  }

  if (kind === "profile") {
    const fullName = body.fullName ?? "";

    const { error: authError } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });

    if (authError) {
      await logAuditEvent({
        action: "settings.profile.update",
        entityType: "user_preference",
        entityId: userId,
        organizationId: tenant.organizationId,
        eventDomain: "settings",
        outcome: "error",
        severity: "medium",
        metadata: {
          kind,
          error: authError.message,
        },
      });
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const { error: prefError } = await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        organization_id: tenant.organizationId,
        two_factor_enabled: Boolean(body.twoFactorEnabled),
        two_factor_method: body.twoFactorMethod ?? "app",
      },
      { onConflict: "organization_id,user_id" },
    );

    if (prefError) {
      await logAuditEvent({
        action: "settings.profile.update",
        entityType: "user_preference",
        entityId: userId,
        organizationId: tenant.organizationId,
        eventDomain: "settings",
        outcome: "error",
        severity: "medium",
        metadata: {
          kind,
          error: prefError.message,
        },
      });
      return NextResponse.json({ error: prefError.message }, { status: 400 });
    }

    await logAuditEvent({
      action: "settings.profile.update",
      entityType: "user_preference",
      entityId: userId,
      organizationId: tenant.organizationId,
      eventDomain: "settings",
      outcome: "success",
      severity: "low",
      metadata: {
        kind,
      },
    });

    return NextResponse.json({ ok: true });
  }

  if (kind === "preferences") {
    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        organization_id: tenant.organizationId,
        theme: body.theme ?? "default",
        language: body.language ?? "es",
        date_format: body.dateFormat ?? "DD/MM/YYYY",
        timezone_mode: body.timezoneMode ?? "auto",
        timezone_manual: body.timezoneManual ?? "",
        analytics_enabled: Boolean(body.analyticsEnabled),
      },
      { onConflict: "organization_id,user_id" },
    );

    if (error) {
      await logAuditEvent({
        action: "settings.preferences.update",
        entityType: "user_preference",
        entityId: userId,
        organizationId: tenant.organizationId,
        eventDomain: "settings",
        outcome: "error",
        severity: "medium",
        metadata: {
          kind,
          error: error.message,
        },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAuditEvent({
      action: "settings.preferences.update",
      entityType: "user_preference",
      entityId: userId,
      organizationId: tenant.organizationId,
      eventDomain: "settings",
      outcome: "success",
      severity: "low",
      metadata: {
        kind,
      },
    });

    return NextResponse.json({ ok: true });
  }

  if (kind === "billing") {
    if (tenant.roleCode !== "company_admin") {
      return NextResponse.json({ error: "Sin permisos para editar billing" }, { status: 403 });
    }

    const { error } = await supabase.from("organization_settings").upsert(
      {
        organization_id: tenant.organizationId,
        billing_plan: body.billingPlan ?? "Starter",
        billing_period: body.billingPeriod ?? "monthly",
        billed_to: body.billedTo ?? "",
        billing_email: body.billingEmail ?? "",
        payment_last4: body.paymentLast4 ?? "4242",
        invoice_emails_enabled: Boolean(body.invoiceEmailsEnabled),
        updated_by: userId,
      },
      { onConflict: "organization_id" },
    );

    if (error) {
      await logAuditEvent({
        action: "settings.billing.update",
        entityType: "organization_setting",
        entityId: tenant.organizationId,
        organizationId: tenant.organizationId,
        eventDomain: "settings",
        outcome: "error",
        severity: "high",
        metadata: {
          kind,
          error: error.message,
        },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAuditEvent({
      action: "settings.billing.update",
      entityType: "organization_setting",
      entityId: tenant.organizationId,
      organizationId: tenant.organizationId,
      eventDomain: "settings",
      outcome: "success",
      severity: "medium",
      metadata: {
        kind,
      },
    });

    return NextResponse.json({ ok: true });
  }

  if (kind === "theme") {
    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        organization_id: tenant.organizationId,
        theme: body.theme ?? "default",
      },
      { onConflict: "organization_id,user_id" },
    );

    if (error) {
      await logAuditEvent({
        action: "settings.theme.update",
        entityType: "user_preference",
        entityId: userId,
        organizationId: tenant.organizationId,
        eventDomain: "settings",
        outcome: "error",
        severity: "medium",
        metadata: {
          kind,
          error: error.message,
        },
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logAuditEvent({
      action: "settings.theme.update",
      entityType: "user_preference",
      entityId: userId,
      organizationId: tenant.organizationId,
      eventDomain: "settings",
      outcome: "success",
      severity: "low",
      metadata: {
        kind,
      },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Tipo no soportado" }, { status: 400 });
}

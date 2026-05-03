import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

import { ALLOWED_EMPLOYMENT_STATUSES } from "./_shared";

export async function PATCH(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const actorId = moduleAccess.userId;
  const supabase = await createSupabaseServerClient();

  const body = await request.json().catch(() => null) as {
    employeeId?: string;
    organizationUserProfileId?: string;
    status?: string;
  } | null;
  const employeeId = String(body?.employeeId ?? "").trim();
  const organizationUserProfileId = String(body?.organizationUserProfileId ?? "").trim();
  const status = String(body?.status ?? "").trim();

  if (!employeeId && !organizationUserProfileId) {
    return NextResponse.json({ error: "Registro inválido" }, { status: 400 });
  }

  const isEmployeeStatus = ALLOWED_EMPLOYMENT_STATUSES.has(status);
  const isUserStatus = status === "active" || status === "inactive";
  if (!isEmployeeStatus && !isUserStatus) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  if (organizationUserProfileId) {
    if (!isUserStatus) {
      return NextResponse.json({ error: "Estado inválido para usuario" }, { status: 400 });
    }

    const { data: previousProfile } = await supabase
      .from("organization_user_profiles")
      .select("status, user_id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId)
      .maybeSingle();

    if (!previousProfile) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const { error: profileError } = await supabase
      .from("organization_user_profiles")
      .update({ status })
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId);

    if (profileError) {
      return NextResponse.json({ error: `No se pudo actualizar estado del usuario: ${profileError.message}` }, { status: 400 });
    }

    const { error: membershipError } = await supabase
      .from("memberships")
      .update({ status })
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", previousProfile.user_id);

    if (membershipError) {
      await logAuditEvent({
        action: "employee.status.update",
        entityType: "organization_user_profile",
        entityId: organizationUserProfileId,
        organizationId: tenant.organizationId,
        eventDomain: "employees",
        outcome: "error",
        severity: "medium",
        actorId,
        metadata: {
          status_scope: "membership_sync",
          next_status: status,
          error: membershipError.message,
        },
      });
      return NextResponse.json({ error: `No se pudo sincronizar estado de acceso: ${membershipError.message}` }, { status: 400 });
    }

    await logAuditEvent({
      action: "employee.status.update",
      entityType: "organization_user_profile",
      entityId: organizationUserProfileId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "low",
      actorId,
      metadata: {
        status_scope: "laboral",
        previous_status: previousProfile?.status ?? null,
        next_status: status,
      },
    });

    return NextResponse.json({ ok: true });
  }

  if (!isEmployeeStatus) {
    return NextResponse.json({ error: "Estado inválido para empleado" }, { status: 400 });
  }

  const { data: previousEmployee } = await supabase
    .from("employees")
    .select("status")
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!previousEmployee) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const { error } = await supabase
    .from("employees")
    .update({ status })
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId);

  if (error) {
    await logAuditEvent({
      action: "employee.status.update",
      entityType: "employee",
      entityId: employeeId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "error",
      severity: "medium",
      actorId,
      metadata: {
        status_scope: "laboral",
        previous_status: previousEmployee?.status ?? null,
        next_status: status,
        error: error.message,
      },
    });
    return NextResponse.json({ error: `No se pudo actualizar estado: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.status.update",
    entityType: "employee",
    entityId: employeeId,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    actorId,
    metadata: {
      status_scope: "laboral",
      previous_status: previousEmployee?.status ?? null,
      next_status: status,
    },
  });

  return NextResponse.json({ ok: true });
}

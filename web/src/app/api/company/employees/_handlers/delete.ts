import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

export async function DELETE(request: Request) {
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
    membershipId?: string;
  } | null;
  const employeeId = String(body?.employeeId ?? "").trim();
  const organizationUserProfileId = String(body?.organizationUserProfileId ?? "").trim();
  const membershipId = String(body?.membershipId ?? "").trim();

  if (!employeeId && !organizationUserProfileId) {
    return NextResponse.json({ error: "Registro inválido" }, { status: 400 });
  }

  if (organizationUserProfileId) {
    const { data: existingProfile } = await supabase
      .from("organization_user_profiles")
      .select("id, user_id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId)
      .maybeSingle();

    if (!existingProfile) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (membershipId) {
      const { data: membershipToDelete } = await supabase
        .from("memberships")
        .select("id, user_id")
        .eq("organization_id", tenant.organizationId)
        .eq("id", membershipId)
        .maybeSingle();

      if (!membershipToDelete) {
        return NextResponse.json({ error: "Acceso no encontrado" }, { status: 404 });
      }

      if (existingProfile.user_id && membershipToDelete.user_id !== existingProfile.user_id) {
        await logAuditEvent({
          action: "users.profile.delete",
          entityType: "organization_user_profile",
          entityId: organizationUserProfileId,
          organizationId: tenant.organizationId,
          eventDomain: "employees",
          outcome: "denied",
          severity: "high",
          actorId,
          metadata: {
            membership_id: membershipId,
            reason: "membership_profile_mismatch",
          },
        });
        return NextResponse.json({ error: "El acceso indicado no corresponde a este usuario" }, { status: 400 });
      }

      const { error: membershipDeleteError } = await supabase
        .from("memberships")
        .delete()
        .eq("organization_id", tenant.organizationId)
        .eq("id", membershipId);

      if (membershipDeleteError) {
        return NextResponse.json({ error: `No se pudo eliminar acceso de usuario: ${membershipDeleteError.message}` }, { status: 400 });
      }
    }

    const { data: deletedProfiles, error: deleteProfileError } = await supabase
      .from("organization_user_profiles")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("id", organizationUserProfileId)
      .select("id");

    if (deleteProfileError) {
      return NextResponse.json({ error: `No se pudo eliminar usuario: ${deleteProfileError.message}` }, { status: 400 });
    }

    if (!deletedProfiles || deletedProfiles.length === 0) {
      return NextResponse.json({ error: "No se encontró el registro o faltan permisos para eliminarlo." }, { status: 400 });
    }

    await logAuditEvent({
      action: "users.profile.delete",
      entityType: "organization_user_profile",
      entityId: organizationUserProfileId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "medium",
      actorId,
      metadata: { membership_id: membershipId || null },
    });

    return NextResponse.json({ ok: true });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, user_id")
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  const { data: deletedEmployees, error: deleteError } = await supabase
    .from("employees")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId)
    .select("id");

  if (deleteError) {
    await logAuditEvent({
      action: "employee.delete",
      entityType: "employee",
      entityId: employeeId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "error",
      severity: "high",
      actorId,
      metadata: { error: deleteError.message },
    });
    return NextResponse.json({ error: `No se pudo eliminar empleado: ${deleteError.message}` }, { status: 400 });
  }

  if (!deletedEmployees || deletedEmployees.length === 0) {
    return NextResponse.json({ error: "No se encontró el registro del empleado o faltan permisos para eliminarlo." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (employee.user_id) {
    await admin
      .from("memberships")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", employee.user_id);
  }

  await admin
    .from("organization_user_profiles")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("employee_id", employeeId);

  await logAuditEvent({
    action: "employee.delete",
    entityType: "employee",
    entityId: employeeId,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "medium",
    metadata: { actor_user_id: actorId },
  });

  return NextResponse.json({ ok: true });
}

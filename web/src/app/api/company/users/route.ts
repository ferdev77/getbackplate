import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const ALLOWED_ROLE_CODES = new Set(["employee", "manager", "company_admin"]);
const ALLOWED_STATUSES = new Set(["active", "inactive"]);

async function requireUserContext() {
  const moduleAccess = await assertCompanyManagerModuleApi("employees");
  if (!moduleAccess.ok) {
    return {
      error: NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status }),
    };
  }

  const tenant = moduleAccess.tenant;
  const supabase = await createSupabaseServerClient();
  const userId = moduleAccess.userId;

  return { supabase, tenant, userId };
}

export async function PATCH(request: Request) {
  const context = await requireUserContext();
  if ("error" in context) {
    return context.error;
  }

  const { supabase, tenant, userId } = context;
  const body = await request.json().catch(() => null) as
    | { membershipId?: string; roleCode?: string; status?: string; branchId?: string | null }
    | null;

  const membershipId = String(body?.membershipId ?? "").trim();
  const roleCode = String(body?.roleCode ?? "").trim();
  const status = String(body?.status ?? "").trim();
  const branchId = body?.branchId ? String(body.branchId).trim() : null;

  if (!membershipId) {
    return NextResponse.json({ error: "Membresia invalida" }, { status: 400 });
  }

  if (!ALLOWED_ROLE_CODES.has(roleCode)) {
    return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
  }

  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle();

  if (roleError || !role) {
    return NextResponse.json({ error: "No se pudo resolver rol" }, { status: 400 });
  }

  if (branchId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", branchId)
      .eq("is_active", true)
      .maybeSingle();

    if (!branch) {
      return NextResponse.json({ error: "Locacion invalida" }, { status: 400 });
    }
  }

  const { error: updateError } = await supabase
    .from("memberships")
    .update({ role_id: role.id, status, branch_id: branchId })
    .eq("organization_id", tenant.organizationId)
    .eq("id", membershipId);

  if (updateError) {
    await logAuditEvent({
      action: "user.membership.update",
      entityType: "membership",
      entityId: membershipId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "error",
      severity: "medium",
      metadata: {
        actor_user_id: userId,
        role_code: roleCode,
        status,
        branch_id: branchId,
        error: updateError.message,
      },
    });
    return NextResponse.json({ error: `No se pudo actualizar usuario: ${updateError.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "user.membership.update",
    entityType: "membership",
    entityId: membershipId,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    metadata: {
      actor_user_id: userId,
      role_code: roleCode,
      status,
      branch_id: branchId,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await requireUserContext();
  if ("error" in context) {
    return context.error;
  }

  const { supabase, tenant, userId } = context;
  const body = await request.json().catch(() => null) as { membershipId?: string } | null;
  const membershipId = String(body?.membershipId ?? "").trim();

  if (!membershipId) {
    return NextResponse.json({ error: "Membresia invalida" }, { status: 400 });
  }

  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("id", membershipId);

  if (error) {
    await logAuditEvent({
      action: "user.membership.delete",
      entityType: "membership",
      entityId: membershipId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "error",
      severity: "high",
      metadata: {
        actor_user_id: userId,
        error: error.message,
      },
    });
    return NextResponse.json({ error: `No se pudo eliminar usuario: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "user.membership.delete",
    entityType: "membership",
    entityId: membershipId,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "medium",
    metadata: {
      actor_user_id: userId,
    },
  });

  return NextResponse.json({ ok: true });
}

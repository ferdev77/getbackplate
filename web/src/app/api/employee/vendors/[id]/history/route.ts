import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { resolveEmployeeVendorScope } from "@/modules/vendors/lib/employee-scope";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { extractDisplayName } from "@/shared/lib/user";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const access = await assertEmployeeCapabilityApi("vendors", "view");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (access.tenant.roleCode !== "employee") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const { organizationId } = access.tenant;
  const admin = createSupabaseAdminClient();

  // Un empleado solo toca proveedores de sus locaciones.
  let alcance;
  try {
    alcance = await resolveEmployeeVendorScope(admin, organizationId, access.userId);
  } catch (error) {
    console.error("[employee vendor history] scope error:", error);
    return NextResponse.json({ error: "No se pudo resolver el alcance de locaciones" }, { status: 500 });
  }
  if (!alcance.visibleVendorIds.has(id)) {
    return NextResponse.json({ error: "Este proveedor no pertenece a tus locaciones" }, { status: 403 });
  }


  const { data: vendor } = await admin
    .from("vendors")
    .select("id, name, is_active")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!vendor || !vendor.is_active) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  const { data: logs } = await admin
    .from("audit_logs")
    .select("id, action, metadata, created_at, actor_user_id")
    .eq("entity_type", "vendor")
    .eq("entity_id", id)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  const catalog = await buildScopeUsersCatalog(organizationId);
  const catalogMap = new Map(
    catalog
      .filter((u) => u.user_id)
      .map((u) => [u.user_id as string, `${u.first_name} ${u.last_name || ""}`.trim() || "Usuario"]),
  );

  const actorIds = [...new Set((logs ?? []).map((log) => log.actor_user_id).filter(Boolean))];
  const missingIds = actorIds.filter((actorId) => !catalogMap.has(actorId as string));

  if (missingIds.length > 0) {
    await Promise.all(
      missingIds.map(async (uid) => {
        const { data: authUser } = await admin.auth.admin.getUserById(uid as string);
        if (!authUser?.user) return;
        let display = extractDisplayName(authUser.user);
        if (display === authUser.user.email) {
          const prefix = display.split("@")[0] || "Usuario";
          display = prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/[._-]/g, " ");
        }
        catalogMap.set(uid as string, display);
      }),
    );
  }

  const entries = (logs ?? []).map((log) => {
    const metadata = (log.metadata as Record<string, unknown>) || {};
    return {
      id: log.id,
      action: log.action,
      outcome: typeof metadata.outcome === "string" ? metadata.outcome : "success",
      severity: typeof metadata.severity === "string" ? metadata.severity : "low",
      metadata: log.metadata,
      createdAt: log.created_at,
      actorId: log.actor_user_id,
      actorName: log.actor_user_id ? (catalogMap.get(log.actor_user_id) ?? "Usuario") : "Sistema",
    };
  });

  return NextResponse.json({ vendor: { id: vendor.id, name: vendor.name }, history: entries });
}

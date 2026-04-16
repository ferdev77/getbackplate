import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { extractDisplayName } from "@/shared/lib/user";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/company/vendors/[id]/history ─────────────────────────────────────
export async function GET(_req: Request, { params }: RouteParams) {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const { organizationId } = access.tenant;
  const admin = createSupabaseAdminClient();

  // Verify vendor belongs to org
  const { data: vendor } = await admin
    .from("vendors")
    .select("id, name")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!vendor) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  // Pull audit log entries for this vendor
  const { data: logs } = await admin
    .from("audit_logs")
    .select("id, action, metadata, created_at, actor_user_id")
    .eq("entity_type", "vendor")
    .eq("entity_id", id)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Resolve actor names using scope users catalog (which covers employees, external users, etc)
  const catalog = await buildScopeUsersCatalog(organizationId);
  const catalogMap = new Map(
    catalog
      .filter((u) => u.user_id)
      .map((u) => [u.user_id as string, `${u.first_name} ${u.last_name || ""}`.trim() || "Usuario"])
  );

  // For any missing user IDs (like root owners or superadmins), fetch directly from Auth
  const actorIds = [...new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean))];
  const missingIds = actorIds.filter(id => !catalogMap.has(id as string));

  if (missingIds.length > 0) {
    await Promise.all(
      missingIds.map(async (uid) => {
        const { data: authUser } = await admin.auth.admin.getUserById(uid as string);
        if (authUser?.user) {
          const metaName = extractDisplayName(authUser.user);
          // If the extracted name is still their email, we try to create a friendly name from it
          let display = metaName;
          if (display === authUser.user.email) {
            const prefix = display.split("@")[0] || "Usuario";
            // Capitalize first letter of email prefix
            display = prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/[._-]/g, " ");
          }
          catalogMap.set(uid as string, display);
        }
      })
    );
  }

  const entries = (logs ?? []).map((l) => {
    // Audit lib stores some fields in metadata for non-core columns
    const m = (l.metadata as Record<string, unknown>) || {};
    return {
      id: l.id,
      action: l.action,
      outcome: typeof m.outcome === "string" ? m.outcome : "success",
      severity: typeof m.severity === "string" ? m.severity : "low",
      metadata: l.metadata,
      createdAt: l.created_at,
      actorId: l.actor_user_id,
      actorName: l.actor_user_id ? (catalogMap.get(l.actor_user_id) ?? "Usuario") : "Sistema",
    };
  });

  return NextResponse.json({ vendor: { id: vendor.id, name: vendor.name }, history: entries });
}

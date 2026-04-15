import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertTenantModuleApi } from "@/shared/lib/access";

// ─── GET /api/employee/vendors ────────────────────────────────────────────────
// Empleado: solo lectura, filtrado por su sucursal
export async function GET(request: Request) {
  const access = await assertTenantModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (access.tenant.roleCode !== "employee") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { organizationId, branchId } = access.tenant;
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";

  const admin = createSupabaseAdminClient();

  const [{ data: vendors }, { data: vendorLocations }, { data: branches }] = await Promise.all([
    admin
      .from("vendors")
      .select("id, name, category, contact_name, contact_email, contact_phone, website_url, address, notes")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    admin
      .from("vendor_locations")
      .select("vendor_id, branch_id")
      .eq("organization_id", organizationId),
    admin
      .from("branches")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
  ]);

  // Build vendor → branch_ids map
  const locationsByVendor = new Map<string, Array<string | null>>();
  for (const loc of vendorLocations ?? []) {
    if (!locationsByVendor.has(loc.vendor_id)) {
      locationsByVendor.set(loc.vendor_id, []);
    }
    locationsByVendor.get(loc.vendor_id)!.push(loc.branch_id);
  }

  const branchById = new Map((branches ?? []).map((b) => [b.id, b.name]));

  let result = (vendors ?? [])
    .map((v) => {
      const locs = locationsByVendor.get(v.id) ?? [];
      const branchIds = locs.filter(Boolean) as string[];
      return {
        ...v,
        branchIds,
        branchNames: branchIds.map((id) => branchById.get(id)).filter(Boolean),
        isGlobal: locs.some((l) => l === null) || locs.length === 0,
      };
    })
    // Filter by employee branch
    .filter((v) => {
      if (v.isGlobal) return true;
      if (!branchId) return true;
      return v.branchIds.includes(branchId);
    });

  // Additional filters from query
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.contact_name?.toLowerCase().includes(q)
    );
  }
  if (category) {
    result = result.filter((v) => v.category === category);
  }

  return NextResponse.json({ vendors: result, branches: branches ?? [] });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const nullableStr = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : String(v).trim()),
    z.string().max(max).nullable().optional(),
  );

const vendorSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200),
  category: z.string().trim().min(1).max(80),
  contact_name: nullableStr(200),
  contact_email: nullableStr(300),
  contact_phone: nullableStr(50),
  contact_whatsapp: nullableStr(50),
  website_url: nullableStr(500),
  address: nullableStr(500),
  notes: nullableStr(2000),
  is_active: z.boolean().optional().default(true),
  branch_ids: z.array(z.string().uuid()).optional().default([]),
});

// ─── GET /api/employee/vendors ────────────────────────────────────────────────
// Empleado: listado filtrado por locación y permisos delegados
export async function GET(request: Request) {
  const access = await assertEmployeeCapabilityApi("vendors", "view");
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

  const [{ data: customBrandingEnabled }, { data: vendors }, { data: vendorLocations }, { data: branches }, { data: categories }] = await Promise.all([
    admin.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    admin
      .from("vendors")
      .select("id, organization_id, name, category, contact_name, contact_email, contact_phone, contact_whatsapp, website_url, address, notes, is_active, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    admin
      .from("vendor_locations")
      .select("vendor_id, branch_id")
      .eq("organization_id", organizationId),
    admin
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    admin
      .from("vendor_categories")
      .select("id, code, name, is_system, sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  // Build vendor → branch_ids map
  const locationsByVendor = new Map<string, Array<string | null>>();
  for (const loc of vendorLocations ?? []) {
    if (!locationsByVendor.has(loc.vendor_id)) {
      locationsByVendor.set(loc.vendor_id, []);
    }
    locationsByVendor.get(loc.vendor_id)!.push(loc.branch_id);
  }

  const branchById = new Map((branches ?? []).map((b) => [b.id, customBrandingEnabled && b.city ? b.city : b.name]));

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
        v.contact_name?.toLowerCase().includes(q) ||
        v.contact_whatsapp?.includes(q)
    );
  }
  if (category) {
    result = result.filter((v) => v.category === category);
  }

  const mappedBranches = (branches ?? []).map((branch) => ({
    id: branch.id,
    name: customBrandingEnabled && branch.city ? branch.city : branch.name,
  }));

  return NextResponse.json({ vendors: result, branches: mappedBranches, categories: categories ?? [] });
}

// ─── POST /api/employee/vendors ───────────────────────────────────────────────
export async function POST(request: Request) {
  const access = await assertEmployeeCapabilityApi("vendors", "create");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (access.tenant.roleCode !== "employee") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { organizationId } = access.tenant;
  const actorId = access.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const parsed = vendorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 422 });
  }

  const { branch_ids, ...vendorData } = parsed.data;
  const admin = createSupabaseAdminClient();

  const { data: category } = await admin
    .from("vendor_categories")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", vendorData.category)
    .maybeSingle();

  if (!category) {
    return NextResponse.json({ error: "Categoría inválida" }, { status: 422 });
  }

  const { data: newVendor, error: insertError } = await admin
    .from("vendors")
    .insert({
      organization_id: organizationId,
      name: vendorData.name,
      category: vendorData.category,
      contact_name: vendorData.contact_name ?? null,
      contact_email: vendorData.contact_email ?? null,
      contact_phone: vendorData.contact_phone ?? null,
      contact_whatsapp: vendorData.contact_whatsapp ?? null,
      website_url: vendorData.website_url ?? null,
      address: vendorData.address ?? null,
      notes: vendorData.notes ?? null,
      is_active: vendorData.is_active ?? true,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (insertError || !newVendor) {
    return NextResponse.json({ error: "Error al crear proveedor", detail: insertError?.message }, { status: 500 });
  }

  if (branch_ids.length > 0) {
    const { error: locError } = await admin.from("vendor_locations").insert(
      branch_ids.map((bid) => ({
        vendor_id: newVendor.id,
        organization_id: organizationId,
        branch_id: bid,
      })),
    );
    if (locError) {
      return NextResponse.json({ error: "No se pudieron asignar locaciones" }, { status: 500 });
    }
  } else {
    const { error: locError } = await admin.from("vendor_locations").insert({
      vendor_id: newVendor.id,
      organization_id: organizationId,
      branch_id: null,
    });
    if (locError) {
      return NextResponse.json({ error: "No se pudo asignar alcance global" }, { status: 500 });
    }
  }

  await logAuditEvent({
    action: "vendor.create",
    entityType: "vendor",
    entityId: newVendor.id,
    organizationId,
    actorId,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
    metadata: { source: "employee", name: vendorData.name, category: vendorData.category, branch_ids },
  });

  return NextResponse.json({ vendor: { id: newVendor.id } }, { status: 201 });
}

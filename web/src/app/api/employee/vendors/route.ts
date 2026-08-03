import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import {
  locacionesFueraDeAlcance,
  resolveEmployeeVendorScope,
} from "@/modules/vendors/lib/employee-scope";
import { logAuditEvent } from "@/shared/lib/audit";
import { notifyVendorEvent } from "@/modules/vendors/notifications";
import { mapVendorMutationError, saveVendorTransaction } from "@/modules/vendors/mutation";

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

  const { organizationId } = access.tenant;
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

  // Un empleado solo ve los proveedores de sus locaciones.
  let alcance;
  try {
    alcance = await resolveEmployeeVendorScope(admin, organizationId, access.userId);
  } catch (error) {
    console.error("[employee vendors GET] scope error:", error);
    return NextResponse.json({ error: "No se pudo resolver el alcance de locaciones" }, { status: 500 });
  }
  const vendorsVisibles = (vendors ?? []).filter((v) => alcance.visibleVendorIds.has(v.id));

  // Build vendor → branch_ids map
  const locationsByVendor = new Map<string, Array<string | null>>();
  for (const loc of vendorLocations ?? []) {
    if (!locationsByVendor.has(loc.vendor_id)) {
      locationsByVendor.set(loc.vendor_id, []);
    }
    locationsByVendor.get(loc.vendor_id)!.push(loc.branch_id);
  }

  const branchById = new Map((branches ?? []).map((b) => [b.id, customBrandingEnabled && b.city ? b.city : b.name]));

  let result = vendorsVisibles.map((v) => {
      const locs = locationsByVendor.get(v.id) ?? [];
      const branchIds = locs.filter(Boolean) as string[];
      return {
        ...v,
        branchIds,
        branchNames: branchIds.map((id) => branchById.get(id)).filter(Boolean),
        isGlobal: locs.some((l) => l === null) || locs.length === 0,
      };
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

  let alcanceAlta;
  try {
    alcanceAlta = await resolveEmployeeVendorScope(admin, organizationId, access.userId);
  } catch (error) {
    console.error("[employee vendors POST] scope error:", error);
    return NextResponse.json({ error: "No se pudo resolver el alcance de locaciones" }, { status: 500 });
  }

  if (alcanceAlta.allowedLocationIds.length === 0) {
    return NextResponse.json(
      { error: "No tienes locaciones habilitadas para gestionar proveedores", code: "vendor_employee_scope_empty" },
      { status: 403 },
    );
  }

  const fuera = locacionesFueraDeAlcance(branch_ids, alcanceAlta.allowedLocationIds);
  if (fuera.length > 0) {
    return NextResponse.json(
      { error: "No puedes asignar el proveedor a locaciones fuera de tu alcance" },
      { status: 403 },
    );
  }

  // Sin locaciones elegidas queda en las suyas: un empleado no crea proveedores
  // de toda la empresa.
  const locacionesDelProveedor = branch_ids.length > 0 ? branch_ids : alcanceAlta.allowedLocationIds;

  const { data: savedVendor, error: saveError } = await saveVendorTransaction(admin, {
    organizationId,
    vendorId: null,
    actorId,
    patch: {
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
    },
    replaceLocations: true,
    branchIds: locacionesDelProveedor,
    employeeScopeIds: alcanceAlta.allowedLocationIds,
  });

  if (saveError || !savedVendor) {
    console.error("[employee vendors POST] save_vendor_transaction error:", saveError);
    const mapped = mapVendorMutationError(saveError ?? { message: "invalid_vendor_rpc_result" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  try {
    await logAuditEvent({
      action: "vendor.create",
      entityType: "vendor",
      entityId: savedVendor.vendorId,
      organizationId,
      actorId,
      eventDomain: "settings",
      outcome: "success",
      severity: "medium",
      metadata: {
        source: "employee",
        name: savedVendor.vendorName,
        category: vendorData.category,
        branch_ids: savedVendor.branchIds,
        is_global: savedVendor.isGlobal,
      },
    });
  } catch (error) {
    console.error("[employee vendors POST] logAuditEvent error after commit:", error);
  }

  void notifyVendorEvent({
    supabase: admin,
    organizationId,
    actorId,
    title: "Nuevo proveedor",
    body: vendorData.name,
    source: "vendor_created",
    locationScope: { branchIds: savedVendor.branchIds, isGlobal: savedVendor.isGlobal },
  });

  return NextResponse.json({ vendor: { id: savedVendor.vendorId } }, { status: 201 });
}

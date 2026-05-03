import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

// Coerce empty string / null → null before further validation
const nullableStr = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : String(v).trim()),
    z.string().max(max).nullable().optional()
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

// ─── GET /api/company/vendors ─────────────────────────────────────────────────
export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { organizationId } = access.tenant;
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";
  const branchId = url.searchParams.get("branch_id")?.trim() ?? "";
  const showInactive = url.searchParams.get("show_inactive") === "1";

  const admin = createSupabaseAdminClient();

  const [
    { data: customBrandingEnabled },
    { data: vendors },
    { data: branches },
    { data: vendorLocations },
    { data: categories },
  ] = await Promise.all([
    admin.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    admin
      .from("vendors")
      .select("id, name, category, contact_name, contact_email, contact_phone, contact_whatsapp, website_url, address, notes, is_active, created_at, updated_at")
      .eq("organization_id", organizationId)
      .order("name"),
    admin
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    admin
      .from("vendor_locations")
      .select("vendor_id, branch_id")
      .eq("organization_id", organizationId),
    admin
      .from("vendor_categories")
      .select("id, code, name, is_system, sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const locationsByVendor = new Map<string, string[]>();
  for (const loc of vendorLocations ?? []) {
    if (!locationsByVendor.has(loc.vendor_id)) {
      locationsByVendor.set(loc.vendor_id, []);
    }
    if (loc.branch_id) {
      locationsByVendor.get(loc.vendor_id)!.push(loc.branch_id);
    }
  }

  const branchById = new Map((branches ?? []).map((b) => [b.id, customBrandingEnabled && b.city ? b.city : b.name]));

  let result = (vendors ?? []).map((v) => {
    const branchIds = locationsByVendor.get(v.id) ?? [];
    return {
      ...v,
      branchIds,
      branchNames: branchIds.map((id) => branchById.get(id)).filter(Boolean),
    };
  });

  // Filters
  if (!showInactive) result = result.filter((v) => v.is_active);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.contact_name?.toLowerCase().includes(q) ||
        v.contact_email?.toLowerCase().includes(q) ||
        v.contact_phone?.includes(q) ||
        v.contact_whatsapp?.includes(q)
    );
  }
  if (category) {
    result = result.filter((v) => v.category === category);
  }
  if (branchId) {
    result = result.filter(
      (v) => v.branchIds.length === 0 || v.branchIds.includes(branchId)
    );
  }

  const mappedBranches = (branches ?? []).map((branch) => ({
    id: branch.id,
    name: customBrandingEnabled && branch.city ? branch.city : branch.name,
  }));

  return NextResponse.json({ vendors: result, branches: mappedBranches, categories: categories ?? [] });
}

// ─── POST /api/company/vendors ────────────────────────────────────────────────
export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { organizationId } = access.tenant;
  const actorId = access.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = vendorSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[vendors POST] Zod validation failed:", JSON.stringify(parsed.error.flatten(), null, 2));
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 422 }
    );
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
    console.error("[vendors POST] Insert error:", insertError?.message, insertError?.details);
    return NextResponse.json({ error: "Error al crear proveedor", detail: insertError?.message }, { status: 500 });
  }

  // Insert vendor_locations
  if (branch_ids && branch_ids.length > 0) {
    const { error: locError } = await admin.from("vendor_locations").insert(
      branch_ids.map((bid) => ({
        vendor_id: newVendor.id,
        organization_id: organizationId,
        branch_id: bid,
      }))
    );
    if (locError) console.error("[vendors POST] vendor_locations insert error:", locError.message, locError.details);
  } else {
    // Global vendor — branch_id NULL means visible to all branches
    const { error: locError } = await admin.from("vendor_locations").insert({
      vendor_id: newVendor.id,
      organization_id: organizationId,
      branch_id: null,
    });
    if (locError) console.error("[vendors POST] vendor_locations global insert error:", locError.message, locError.details);
  }

  try {
    await logAuditEvent({
      action: "vendor.create",
      entityType: "vendor",
      entityId: newVendor.id,
      organizationId,
      actorId,
      eventDomain: "settings",
      outcome: "success",
      severity: "medium",
      metadata: { name: vendorData.name, category: vendorData.category, branch_ids },
    });
  } catch (auditErr) {
    console.error("[vendors POST] logAuditEvent error:", auditErr);
    // Non-fatal — vendor was created successfully
  }

  return NextResponse.json({ vendor: { id: newVendor.id } }, { status: 201 });
}

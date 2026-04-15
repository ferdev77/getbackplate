import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const VENDOR_CATEGORIES = ["alimentos", "bebidas", "equipos", "limpieza", "mantenimiento", "empaque", "otro"] as const;

// Coerce empty string / null → null before further validation
const nullableStr = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : String(v).trim()),
    z.string().max(max).nullable().optional()
  );

const vendorUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(VENDOR_CATEGORIES).optional(),
  contact_name: nullableStr(200),
  contact_email: nullableStr(300),
  contact_phone: nullableStr(50),
  website_url: nullableStr(500),
  address: nullableStr(500),
  notes: nullableStr(2000),
  is_active: z.boolean().optional(),
  branch_ids: z.array(z.string().uuid()).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/company/vendors/[id] ────────────────────────────────────────────
export async function GET(_req: Request, { params }: RouteParams) {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const { organizationId } = access.tenant;
  const admin = createSupabaseAdminClient();

  const [{ data: vendor }, { data: locations }] = await Promise.all([
    admin
      .from("vendors")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    admin
      .from("vendor_locations")
      .select("branch_id")
      .eq("vendor_id", id)
      .eq("organization_id", organizationId),
  ]);

  if (!vendor) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    vendor: {
      ...vendor,
      branchIds: (locations ?? []).map((l) => l.branch_id).filter(Boolean),
    },
  });
}

// ─── PUT /api/company/vendors/[id] ────────────────────────────────────────────
export async function PUT(request: Request, { params }: RouteParams) {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const { organizationId } = access.tenant;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = vendorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const admin = createSupabaseAdminClient();

  // Verify vendor belongs to org and get current data for diffing
  const [{ data: existing }, { data: existingLocations }] = await Promise.all([
    admin
      .from("vendors")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    admin
      .from("vendor_locations")
      .select("branch_id")
      .eq("vendor_id", id)
      .eq("organization_id", organizationId),
  ]);

  if (!existing) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  const existingBranchIds = (existingLocations ?? []).map((l) => l.branch_id).filter(Boolean).sort();

  const { branch_ids, ...updateFields } = parsed.data;

  // Build update payload (only provided fields)
  const updatePayload: Record<string, unknown> = {};
  if (updateFields.name !== undefined) updatePayload.name = updateFields.name;
  if (updateFields.category !== undefined) updatePayload.category = updateFields.category;
  if ("contact_name" in updateFields) updatePayload.contact_name = updateFields.contact_name || null;
  if ("contact_email" in updateFields) updatePayload.contact_email = updateFields.contact_email || null;
  if ("contact_phone" in updateFields) updatePayload.contact_phone = updateFields.contact_phone || null;
  if ("website_url" in updateFields) updatePayload.website_url = updateFields.website_url || null;
  if ("address" in updateFields) updatePayload.address = updateFields.address || null;
  if ("notes" in updateFields) updatePayload.notes = updateFields.notes || null;
  if (updateFields.is_active !== undefined) updatePayload.is_active = updateFields.is_active;

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateError } = await admin
      .from("vendors")
      .update(updatePayload)
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (updateError) {
      return NextResponse.json({ error: "Error al actualizar proveedor" }, { status: 500 });
    }
  }

  // Re-sync vendor_locations if branch_ids provided
  let branchesChanged = false;
  if (branch_ids !== undefined) {
    const sortedNew = [...branch_ids].sort();
    if (JSON.stringify(existingBranchIds) !== JSON.stringify(sortedNew)) {
      branchesChanged = true;
    }
    
    // Only update locations if they actually changed
    if (branchesChanged) {
      await admin
        .from("vendor_locations")
        .delete()
        .eq("vendor_id", id)
        .eq("organization_id", organizationId);

      if (branch_ids.length > 0) {
        await admin.from("vendor_locations").insert(
          branch_ids.map((bid) => ({
            vendor_id: id,
            organization_id: organizationId,
            branch_id: bid,
          }))
        );
      } else {
        // Global (sin sucursal específica)
        await admin.from("vendor_locations").insert({
          vendor_id: id,
          organization_id: organizationId,
          branch_id: null,
        });
      }
    }
  }

  // Calculate actual changes to log
  const changedFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updatePayload)) {
    if (existing[k] !== v) {
      // Small workaround to prevent logging empty string vs null as a change
      if (!v && !existing[k]) continue;
      changedFields[k] = v;
    }
  }

  const isDeactivation = updatePayload.is_active === false && existing.is_active !== false;

  await logAuditEvent({
    action: isDeactivation ? "vendor.deactivate" : "vendor.update",
    entityType: "vendor",
    entityId: id,
    organizationId,
    actorId: access.userId,
    eventDomain: "company",
    outcome: "success",
    severity: isDeactivation ? "medium" : "low",
    metadata: { 
      name: existing.name, 
      changes: Object.keys(changedFields).length > 0 ? changedFields : null,
      ...(branchesChanged ? { branch_ids } : {})
    },
  });

  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/company/vendors/[id] ─────────────────────────────────────────
export async function DELETE(_req: Request, { params }: RouteParams) {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const { organizationId } = access.tenant;
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("vendors")
    .select("id, name")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  // Hard delete — cascade removes vendor_locations via FK
  const { error: deleteError } = await admin
    .from("vendors")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (deleteError) {
    return NextResponse.json({ error: "Error al eliminar proveedor" }, { status: 500 });
  }

  await logAuditEvent({
    action: "vendor.delete",
    entityType: "vendor",
    entityId: id,
    organizationId,
    actorId: access.userId,
    eventDomain: "company",
    outcome: "success",
    severity: "high",
    metadata: { name: existing.name },
  });

  return NextResponse.json({ ok: true });
}

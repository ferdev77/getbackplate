import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { notifyVendorEvent, sucursalesDelProveedor } from "@/modules/vendors/notifications";
import { mapVendorMutationError, saveVendorTransaction } from "@/modules/vendors/mutation";

// Coerce empty string / null → null before further validation
const nullableStr = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : String(v).trim()),
    z.string().max(max).nullable().optional()
  );

const vendorUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  contact_name: nullableStr(200),
  contact_email: nullableStr(300),
  contact_phone: nullableStr(50),
  contact_whatsapp: nullableStr(50),
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
  const { data: existing, error: existingError } = await admin
    .from("vendors")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existingError) {
    console.error("[vendors PUT] existing vendor error:", existingError);
    return NextResponse.json({ error: "No se pudo consultar el proveedor" }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  const { branch_ids, ...updateFields } = parsed.data;

  // Build update payload (only provided fields)
  const updatePayload: Record<string, unknown> = {};
  if (updateFields.name !== undefined) updatePayload.name = updateFields.name;
  if (updateFields.category !== undefined) updatePayload.category = updateFields.category;
  if ("contact_name" in updateFields) updatePayload.contact_name = updateFields.contact_name || null;
  if ("contact_email" in updateFields) updatePayload.contact_email = updateFields.contact_email || null;
  if ("contact_phone" in updateFields) updatePayload.contact_phone = updateFields.contact_phone || null;
  if ("contact_whatsapp" in updateFields) updatePayload.contact_whatsapp = updateFields.contact_whatsapp || null;
  if ("website_url" in updateFields) updatePayload.website_url = updateFields.website_url || null;
  if ("address" in updateFields) updatePayload.address = updateFields.address || null;
  if ("notes" in updateFields) updatePayload.notes = updateFields.notes || null;
  if (updateFields.is_active !== undefined) updatePayload.is_active = updateFields.is_active;

  const { data: savedVendor, error: saveError } = await saveVendorTransaction(admin, {
    organizationId,
    vendorId: id,
    actorId: access.userId,
    patch: updatePayload,
    replaceLocations: branch_ids !== undefined,
    branchIds: branch_ids ?? null,
    employeeScopeIds: null,
  });

  if (saveError || !savedVendor) {
    console.error("[vendors PUT] save_vendor_transaction error:", saveError);
    const mapped = mapVendorMutationError(saveError ?? { message: "invalid_vendor_rpc_result" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  // Calculate actual changes to log
  const changedFields: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(updatePayload)) {
    if (existing[k] !== v) {
      // Small workaround to prevent logging empty string vs null as a change
      if (!v && !existing[k]) continue;
      changedFields[k] = { old: existing[k], new: v };
    }
  }

  const isDeactivation = updatePayload.is_active === false && existing.is_active !== false;

  try {
    await logAuditEvent({
      action: isDeactivation ? "vendor.deactivate" : "vendor.update",
      entityType: "vendor",
      entityId: id,
      organizationId,
      actorId: access.userId,
      eventDomain: "settings",
      outcome: "success",
      severity: isDeactivation ? "medium" : "low",
      metadata: {
        name: existing.name,
        changes: Object.keys(changedFields).length > 0 ? changedFields : null,
        ...(savedVendor.branchesChanged
          ? { branch_ids: savedVendor.branchIds, is_global: savedVendor.isGlobal }
          : {}),
      },
    });
  } catch (error) {
    console.error("[vendors PUT] logAuditEvent error after commit:", error);
  }

  void notifyVendorEvent({
    supabase: admin,
    organizationId,
    actorId: access.userId,
    title: isDeactivation ? "Proveedor desactivado" : "Proveedor actualizado",
    body: savedVendor.vendorName,
    source: isDeactivation ? "vendor_deactivated" : "vendor_updated",
    locationScope: { branchIds: savedVendor.branchIds, isGlobal: savedVendor.isGlobal },
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

  // Las locaciones se leen antes del delete: el cascade se las lleva, y sin
  // ellas el aviso no sabria a quien le importaba este proveedor.
  let locationScope;
  try {
    locationScope = await sucursalesDelProveedor(admin, organizationId, id);
  } catch (error) {
    console.error("[vendors DELETE] vendor scope error:", error);
    return NextResponse.json({ error: "No se pudo resolver el alcance del proveedor" }, { status: 500 });
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
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
    metadata: { name: existing.name },
  });

  void notifyVendorEvent({
    supabase: admin,
    organizationId,
    actorId: access.userId,
    title: "Proveedor eliminado",
    body: existing.name,
    source: "vendor_deleted",
    locationScope,
  });

  return NextResponse.json({ ok: true });
}

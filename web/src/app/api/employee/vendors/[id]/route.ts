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
import {
  deleteEmployeeVendorTransaction,
  mapVendorMutationError,
  saveEmployeeVendorTransaction,
} from "@/modules/vendors/mutation";

const nullableStr = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : String(v).trim()),
    z.string().max(max).nullable().optional(),
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

export async function PUT(request: Request, { params }: RouteParams) {
  const access = await assertEmployeeCapabilityApi("vendors", "edit");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (access.tenant.roleCode !== "employee") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const { organizationId } = access.tenant;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const parsed = vendorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 422 });
  }

  const admin = createSupabaseAdminClient();

  // Un empleado solo toca proveedores de sus locaciones.
  let alcance;
  try {
    alcance = await resolveEmployeeVendorScope(admin, organizationId, access.userId);
  } catch (error) {
    console.error("[employee vendors PUT] scope error:", error);
    return NextResponse.json({ error: "No se pudo resolver el alcance de locaciones" }, { status: 500 });
  }
  if (alcance.allowedLocationIds.length === 0) {
    return NextResponse.json(
      { error: "No tienes locaciones habilitadas para gestionar proveedores", code: "vendor_employee_scope_empty" },
      { status: 403 },
    );
  }
  if (!alcance.visibleVendorIds.has(id)) {
    return NextResponse.json({ error: "Este proveedor no pertenece a tus locaciones" }, { status: 403 });
  }


  const { data: existing, error: existingError } = await admin
    .from("vendors")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existingError) {
    console.error("[employee vendors PUT] existing vendor error:", existingError);
    return NextResponse.json({ error: "No se pudo consultar el proveedor" }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

  const { branch_ids, ...updateFields } = parsed.data;

  if (branch_ids !== undefined) {
    const fuera = locacionesFueraDeAlcance(branch_ids, alcance.allowedLocationIds);
    if (fuera.length > 0) {
      return NextResponse.json(
        { error: "No puedes asignar el proveedor a locaciones fuera de tu alcance" },
        { status: 403 },
      );
    }
  }

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

  const requestedBranchIds = branch_ids === undefined
    ? null
    : branch_ids.length > 0 ? branch_ids : alcance.allowedLocationIds;
  const { data: savedVendor, error: saveError } = await saveEmployeeVendorTransaction(admin, {
    organizationId,
    vendorId: id,
    actorId: access.userId,
    patch: updatePayload,
    replaceLocations: branch_ids !== undefined,
    branchIds: requestedBranchIds,
    employeeScopeIds: alcance.allowedLocationIds,
  });

  if (saveError || !savedVendor) {
    console.error("[employee vendors PUT] save_vendor_transaction error:", saveError);
    const mapped = mapVendorMutationError(saveError ?? { message: "invalid_vendor_rpc_result" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const changedFields: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(updatePayload)) {
    if (existing[k] !== v) {
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
        source: "employee",
        name: existing.name,
        changes: Object.keys(changedFields).length > 0 ? changedFields : null,
        ...(savedVendor.branchesChanged
          ? { branch_ids: savedVendor.branchIds, is_global: savedVendor.isGlobal }
          : {}),
      },
    });
  } catch (error) {
    console.error("[employee vendors PUT] logAuditEvent error after commit:", error);
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

export async function DELETE(_request: Request, { params }: RouteParams) {
  const access = await assertEmployeeCapabilityApi("vendors", "delete");
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
    console.error("[employee vendors DELETE] scope error:", error);
    return NextResponse.json({ error: "No se pudo resolver el alcance de locaciones" }, { status: 500 });
  }
  if (alcance.allowedLocationIds.length === 0) {
    return NextResponse.json(
      { error: "No tienes locaciones habilitadas para gestionar proveedores", code: "vendor_employee_scope_empty" },
      { status: 403 },
    );
  }
  if (!alcance.visibleVendorIds.has(id)) {
    return NextResponse.json({ error: "Este proveedor no pertenece a tus locaciones" }, { status: 403 });
  }


  const { data: deletedVendor, error: deleteError } = await deleteEmployeeVendorTransaction(admin, {
    organizationId,
    vendorId: id,
    actorId: access.userId,
    employeeScopeIds: alcance.allowedLocationIds,
  });
  if (deleteError || !deletedVendor) {
    const mapped = mapVendorMutationError(deleteError ?? { message: "invalid_vendor_rpc_result" });
    return NextResponse.json(mapped.body, { status: mapped.status });
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
    metadata: { source: "employee", name: deletedVendor.vendorName },
  });

  void notifyVendorEvent({
    supabase: admin,
    organizationId,
    actorId: access.userId,
    title: "Proveedor eliminado",
    body: deletedVendor.vendorName,
    source: "vendor_deleted",
    locationScope: { branchIds: deletedVendor.branchIds, isGlobal: deletedVendor.isGlobal },
  });

  return NextResponse.json({ ok: true });
}

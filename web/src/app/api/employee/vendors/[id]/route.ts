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

  if (parsed.data.category) {
    const { data: category } = await admin
      .from("vendor_categories")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("code", parsed.data.category)
      .maybeSingle();

    if (!category) {
      return NextResponse.json({ error: "Categoría inválida" }, { status: 422 });
    }
  }

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

  let branchesChanged = false;
  if (branch_ids !== undefined) {
    const sortedNew = [...branch_ids].sort();
    if (JSON.stringify(existingBranchIds) !== JSON.stringify(sortedNew)) {
      branchesChanged = true;
    }

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
          })),
        );
      } else {
        await admin.from("vendor_locations").insert({
          vendor_id: id,
          organization_id: organizationId,
          branch_id: null,
        });
      }
    }
  }

  const changedFields: Record<string, { old: unknown; new: unknown }> = {};
  for (const [k, v] of Object.entries(updatePayload)) {
    if (existing[k] !== v) {
      if (!v && !existing[k]) continue;
      changedFields[k] = { old: existing[k], new: v };
    }
  }

  const isDeactivation = updatePayload.is_active === false && existing.is_active !== false;

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
      ...(branchesChanged ? { branch_ids } : {}),
    },
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

  const { data: existing } = await admin
    .from("vendors")
    .select("id, name")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  }

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
    metadata: { source: "employee", name: existing.name },
  });

  return NextResponse.json({ ok: true });
}

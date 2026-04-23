import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { buildUniqueCategoryCode } from "@/modules/vendors/category-utils";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 422 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const organizationId = access.tenant.organizationId;

  const { data: existing } = await admin
    .from("vendor_categories")
    .select("id, code")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
  }

  const code = await buildUniqueCategoryCode(admin, organizationId, parsed.data.name, id);

  const { data, error } = await admin
    .from("vendor_categories")
    .update({ name: parsed.data.name, code })
    .eq("organization_id", organizationId)
    .eq("id", id)
    .select("id, code, name, is_system")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "No se pudo actualizar" }, { status: 400 });
  }

  if (existing.code !== code) {
    await admin
      .from("vendors")
      .update({ category: code })
      .eq("organization_id", organizationId)
      .eq("category", existing.code);
  }

  return NextResponse.json({ category: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const organizationId = access.tenant.organizationId;

  const { data: target } = await admin
    .from("vendor_categories")
    .select("id, code")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
  }

  if (target.code === "otro") {
    return NextResponse.json({ error: "No puedes eliminar la categoría base 'otro'" }, { status: 400 });
  }

  const { data: fallback } = await admin
    .from("vendor_categories")
    .select("id, code")
    .eq("organization_id", organizationId)
    .eq("code", "otro")
    .maybeSingle();

  if (!fallback) {
    return NextResponse.json({ error: "Falta categoría base 'otro'" }, { status: 409 });
  }

  await admin
    .from("vendors")
    .update({ category: fallback.code })
    .eq("organization_id", organizationId)
    .eq("category", target.code);

  const { error } = await admin
    .from("vendor_categories")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

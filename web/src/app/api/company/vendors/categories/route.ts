import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { buildUniqueCategoryCode } from "@/modules/vendors/category-utils";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function GET() {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const admin = createSupabaseAdminClient();
  const { data: categories } = await admin
    .from("vendor_categories")
    .select("id, code, name, is_system, sort_order")
    .eq("organization_id", access.tenant.organizationId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return NextResponse.json({ categories: categories ?? [] });
}

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("vendors");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 422 });
  }

  const admin = createSupabaseAdminClient();
  const organizationId = access.tenant.organizationId;
  const code = await buildUniqueCategoryCode(admin, organizationId, parsed.data.name);

  const { data, error } = await admin
    .from("vendor_categories")
    .insert({
      organization_id: organizationId,
      code,
      name: parsed.data.name,
      is_system: false,
      sort_order: 500,
      created_by: access.userId,
    })
    .select("id, code, name, is_system")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "No se pudo crear la categoría" }, { status: 400 });
  }

  return NextResponse.json({ category: data }, { status: 201 });
}

import type { SupabaseClient } from "@supabase/supabase-js";

export function slugifyCategoryName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function buildUniqueCategoryCode(
  supabase: SupabaseClient,
  organizationId: string,
  name: string,
  excludeId?: string,
) {
  const base = slugifyCategoryName(name) || "categoria";

  const { data: existingRows } = await supabase
    .from("vendor_categories")
    .select("id, code")
    .eq("organization_id", organizationId)
    .ilike("code", `${base}%`)
    .limit(200);

  const existing = new Set(
    (existingRows ?? [])
      .filter((row) => (excludeId ? row.id !== excludeId : true))
      .map((row) => row.code),
  );

  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

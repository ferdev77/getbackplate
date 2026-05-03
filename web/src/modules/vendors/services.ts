import { cache } from "react";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { DEFAULT_VENDOR_CATEGORIES, type VendorCategoryOption, type VendorRow } from "./types";

type RawVendor = {
  id: string;
  organization_id: string;
  name: string;
  category: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  website_url: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
};

export const getVendorDirectoryView = cache(async (
  organizationId: string,
  options: {
    forEmployee?: boolean;
    branchId?: string | null;
    branchIds?: string[];
  } = {}
) => {
  const supabase = await createSupabaseServerClient();

  const [
    { data: customBrandingEnabled },
    { data: vendors },
    { data: branches },
    { data: vendorLocations },
    { data: categories },
  ] = await Promise.all([
    supabase.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    options.forEmployee
      ? supabase
          .from("vendors")
          .select("id, organization_id, name, category, contact_name, contact_email, contact_phone, contact_whatsapp, website_url, address, notes, is_active, created_at, updated_at")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name")
      : supabase
          .from("vendors")
          .select("id, organization_id, name, category, contact_name, contact_email, contact_phone, contact_whatsapp, website_url, address, notes, is_active, created_at, updated_at")
          .eq("organization_id", organizationId)
          .order("name"),
    supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("vendor_locations")
      .select("vendor_id, branch_id")
      .eq("organization_id", organizationId),
    supabase
      .from("vendor_categories")
      .select("id, code, name, is_system, sort_order")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const branchById = new Map(
    (branches ?? []).map((b) => [b.id, customBrandingEnabled && b.city ? b.city : b.name])
  );

  // Build vendor → branch_ids map
  const locationsByVendor = new Map<string, string[]>();
  for (const loc of vendorLocations ?? []) {
    if (!locationsByVendor.has(loc.vendor_id)) {
      locationsByVendor.set(loc.vendor_id, []);
    }
    if (loc.branch_id) {
      locationsByVendor.get(loc.vendor_id)!.push(loc.branch_id);
    }
  }

  const mapVendor = (v: RawVendor): VendorRow => {
    const branchIds = locationsByVendor.get(v.id) ?? [];
    const branchNames = branchIds
      .map((id) => branchById.get(id))
      .filter(Boolean) as string[];

    return {
      id: v.id,
      organizationId: v.organization_id,
      name: v.name,
      category: v.category ?? "",
      contactName: v.contact_name,
      contactEmail: v.contact_email,
      contactPhone: v.contact_phone,
      contactWhatsapp: v.contact_whatsapp,
      websiteUrl: v.website_url,
      address: v.address,
      notes: v.notes,
      isActive: v.is_active,
      createdAt: v.created_at,
      updatedAt: v.updated_at ?? "",
      branchIds,
      branchNames,
    };
  };

  let mappedVendors = (vendors ?? []).map(mapVendor);

  // For employee view: filter by their allowed branches
  if (options.forEmployee) {
    const allowedIds = new Set([
      ...(options.branchIds ?? []),
      ...(options.branchId ? [options.branchId] : []),
    ]);
    if (allowedIds.size > 0) {
      mappedVendors = mappedVendors.filter((v) => {
        const hasLocations = v.branchIds.length > 0;
        if (!hasLocations) return true; // global vendor — visible to all
        return v.branchIds.some((id) => allowedIds.has(id));
      });
    }
  }

  return {
    vendors: mappedVendors,
    branches: (branches ?? []).map((b) => ({
      id: b.id,
      name: customBrandingEnabled && b.city ? b.city : b.name,
    })),
    categories: ((categories ?? []).length
      ? (categories ?? []).map((category) => ({
          id: category.id,
          code: category.code,
          name: category.name,
          isSystem: category.is_system,
        }))
      : DEFAULT_VENDOR_CATEGORIES.map((category) => ({
          id: `default-${category.value}`,
          code: category.value,
          name: category.label,
          isSystem: true,
        }))) as VendorCategoryOption[],
  };
});

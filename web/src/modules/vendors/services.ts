/* eslint-disable @typescript-eslint/no-explicit-any */
import { cache } from "react";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { type VendorRow } from "./types";

export const getVendorDirectoryView = cache(async (
  organizationId: string,
  options: {
    forEmployee?: boolean;
    branchId?: string | null;
  } = {}
) => {
  const supabase = await createSupabaseServerClient();

  const [
    { data: vendors },
    { data: branches },
    { data: vendorLocations },
  ] = await Promise.all([
    options.forEmployee
      ? supabase
          .from("vendors")
          .select("id, organization_id, name, category, contact_name, contact_email, contact_phone, website_url, address, notes, is_active, created_at, updated_at")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name")
      : supabase
          .from("vendors")
          .select("id, organization_id, name, category, contact_name, contact_email, contact_phone, website_url, address, notes, is_active, created_at, updated_at")
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
  ]);

  const branchById = new Map(
    (branches ?? []).map((b) => [b.id, b.name])
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

  const mapVendor = (v: any): VendorRow => {
    const branchIds = locationsByVendor.get(v.id) ?? [];
    const branchNames = branchIds
      .map((id) => branchById.get(id))
      .filter(Boolean) as string[];

    return {
      id: v.id,
      organizationId: v.organization_id,
      name: v.name,
      category: v.category,
      contactName: v.contact_name,
      contactEmail: v.contact_email,
      contactPhone: v.contact_phone,
      websiteUrl: v.website_url,
      address: v.address,
      notes: v.notes,
      isActive: v.is_active,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
      branchIds,
      branchNames,
    };
  };

  let mappedVendors = (vendors ?? []).map(mapVendor);

  // For employee view: filter by their branch (if branchId provided)
  if (options.forEmployee && options.branchId) {
    mappedVendors = mappedVendors.filter((v) => {
      // Show if vendor is global (no locations) OR assigned to this branch
      const hasLocations = v.branchIds.length > 0;
      if (!hasLocations) return true; // global
      return v.branchIds.includes(options.branchId!);
    });
  }

  return {
    vendors: mappedVendors,
    branches: (branches ?? []).map((b) => ({ id: b.id, name: b.name })),
  };
});

export const DEFAULT_VENDOR_CATEGORIES = [
  { value: "alimentos", label: "Alimentos" },
  { value: "bebidas", label: "Bebidas" },
  { value: "equipos", label: "Equipos" },
  { value: "limpieza", label: "Limpieza" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "empaque", label: "Empaque" },
  { value: "otro", label: "Otro" },
] as const;

export type VendorCategory = string;

export type VendorCategoryOption = {
  id: string;
  code: string;
  name: string;
  isSystem?: boolean;
};

export type VendorRow = {
  id: string;
  organizationId: string;
  name: string;
  category: VendorCategory;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  websiteUrl: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** branch IDs assigned; empty array = visible en todas las locaciones */
  branchIds: string[];
  /** branch names for display */
  branchNames: string[];
};

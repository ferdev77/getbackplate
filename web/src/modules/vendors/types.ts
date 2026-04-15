export const VENDOR_CATEGORIES = [
  { value: "alimentos", label: "Alimentos" },
  { value: "bebidas", label: "Bebidas" },
  { value: "equipos", label: "Equipos" },
  { value: "limpieza", label: "Limpieza" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "empaque", label: "Empaque" },
  { value: "otro", label: "Otro" },
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number]["value"];

export type VendorRow = {
  id: string;
  organizationId: string;
  name: string;
  category: VendorCategory;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** branch IDs assigned; empty array = visible en todas las sucursales */
  branchIds: string[];
  /** branch names for display */
  branchNames: string[];
};

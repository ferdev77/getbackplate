type BranchDisplayInput = {
  name: string | null;
  city?: string | null;
};

export function getBranchDisplayName(
  branch: BranchDisplayInput,
  customBrandingEnabled: boolean,
  fallback = "Sucursal",
) {
  if (customBrandingEnabled) {
    const cityName = branch.city?.trim();
    if (cityName) return cityName;
  }

  const branchName = branch.name?.trim();
  if (branchName) return branchName;

  return fallback;
}

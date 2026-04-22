export const EMPLOYEE_DOCUMENTS_ROOT_NAME = "Carpetas de empleados";
export const SYSTEM_SCOPE_FOLDER_TYPE_KEY = "_system_folder_type";
export const COMPANY_ONLY_SCOPE_USER_TOKEN = "__company_admin_only__";

export type SystemFolderType = "employees_root" | "employee_home";

export function getSystemFolderType(scope: unknown): SystemFolderType | null {
  if (!scope || typeof scope !== "object") return null;
  const value = (scope as Record<string, unknown>)[SYSTEM_SCOPE_FOLDER_TYPE_KEY];
  if (value === "employees_root" || value === "employee_home") return value;
  return null;
}

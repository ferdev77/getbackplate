export const EMPLOYEES_MESSAGES = {
  ACCESS_EMAIL_REQUIRED: "Email de acceso obligatorio",
  ACCESS_PASSWORD_MIN: "La contrasena de acceso debe tener al menos 8 caracteres",
  ROLE_EMPLOYEE_UNAVAILABLE: "Rol employee no disponible",
  AUTH_USER_UNRESOLVED: "No se pudo resolver usuario auth",
  USER_CREATE_FAILED_PREFIX: "No se pudo crear usuario",
  EMPLOYEE_ACCOUNT_CREATE_FAILED_PREFIX: "No se pudo crear cuenta del empleado",
  PLAN_LIMIT_EMPLOYEES: "Limite de empleados alcanzado. Actualiza tu plan para continuar.",
  PLAN_LIMIT_USERS: "Limite de usuarios alcanzado. Actualiza tu plan para continuar.",
  ATTACHMENTS_SAVE_WARNING: "No se pudieron guardar los documentos adjuntos en esta operacion.",
} as const;

export function employeesStorageLimitForSlot(slotLabel: string) {
  return `Limite de almacenamiento alcanzado para ${slotLabel}. Actualiza tu plan para continuar.`;
}

export const USERS_API_MESSAGES = {
  MEMBERSHIP_INVALID: "Membresia invalida",
  ROLE_INVALID: "Rol invalido",
  STATUS_INVALID: "Estado invalido",
  ROLE_RESOLUTION_FAILED: "No se pudo resolver rol",
  LOCATION_INVALID: "Locacion invalida",
  USER_UPDATE_FAILED_PREFIX: "No se pudo actualizar usuario",
  USER_DELETE_FAILED_PREFIX: "No se pudo eliminar usuario",
} as const;

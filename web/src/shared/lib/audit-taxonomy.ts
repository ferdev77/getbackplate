export const AUDIT_EVENT_DOMAINS = [
  "auth",
  "security",
  "superadmin",
  "employees",
  "documents",
  "announcements",
  "checklists",
  "settings",
  "onboarding",
] as const;

export type AuditEventDomain = (typeof AUDIT_EVENT_DOMAINS)[number];

export const AUDIT_REASON_CODES = {
  MISSING_AUTH_SESSION: "missing_authenticated_session",
  MISSING_SUPERADMIN_ROLE: "missing_superadmin_role",
  MISSING_ACTIVE_MEMBERSHIP: "missing_active_membership",
  MISSING_COMPANY_ROLE: "missing_company_role",
  MISSING_EMPLOYEE_ROLE: "missing_employee_role",
  MODULE_DISABLED_FOR_TENANT: "module_disabled_for_tenant",
  MISSING_CREDENTIALS: "missing_credentials",
  INVALID_CREDENTIALS: "invalid_credentials",
  SESSION_VALIDATION_FAILED: "session_validation_failed",
  MEMBERSHIPS_QUERY_FAILED: "memberships_query_failed",
  NO_ACTIVE_MEMBERSHIPS: "no_active_memberships",
  ROLES_QUERY_FAILED: "roles_query_failed",
  UNEXPECTED_LOGIN_EXCEPTION: "unexpected_login_exception",
} as const;

export type AuditReasonCode = (typeof AUDIT_REASON_CODES)[keyof typeof AUDIT_REASON_CODES];

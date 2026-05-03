import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import type { AuditEventDomain, AuditReasonCode } from "@/shared/lib/audit-taxonomy";

export type AuditSeverity = "low" | "medium" | "high" | "critical";
export type AuditOutcome = "success" | "denied" | "error";

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  organizationId?: string | null;
  branchId?: string | null;
  eventDomain?: AuditEventDomain;
  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  reasonCode?: AuditReasonCode | string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_METADATA_KEYS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "service_role_key",
]);

export function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
      const normalizedKey = key.toLowerCase();
      if (SENSITIVE_METADATA_KEYS.has(normalizedKey)) {
        return [key, "[redacted]"];
      }

      return [key, sanitizeMetadataValue(nestedValue)];
    });

    return Object.fromEntries(entries);
  }

  return value;
}

export async function logAuditEvent(input: AuditInput) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const { data: authData } = await supabaseAuth.auth.getUser();

    // Extraer actorId de metadata si no viene en el input principal (soporte legacy)
    const effectiveActorId = input.actorId ?? (input.metadata?.actor_user_id as string | undefined) ?? authData.user?.id ?? null;

    const supabase = createSupabaseAdminClient();
    await supabase.from("audit_logs").insert({
      organization_id: input.organizationId ?? null,
      branch_id: input.branchId ?? null,
      actor_user_id: effectiveActorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      metadata: sanitizeMetadataValue({
        event_domain: input.eventDomain ?? null,
        outcome: input.outcome ?? "success",
        severity: input.severity ?? "low",
        reason_code: input.reasonCode ?? null,
        ...(input.metadata ?? {}),
      }),
    });
  } catch {
    // Nunca romper flujo principal por auditoria.
  }
}

type AccessDeniedAuditInput = {
  area: "auth" | "superadmin" | "company" | "employee" | "module";
  reasonCode: AuditReasonCode | string;
  organizationId?: string | null;
  branchId?: string | null;
  requiredRole?: string;
  requiredModule?: string;
  pathHint?: string;
};

export async function logAccessDeniedEvent(input: AccessDeniedAuditInput) {
  await logAuditEvent({
    action: `access.denied.${input.area}`,
    entityType: "security",
    organizationId: input.organizationId ?? null,
    branchId: input.branchId ?? null,
    eventDomain: "security",
    outcome: "denied",
    severity: "high",
    reasonCode: input.reasonCode,
    metadata: {
      required_role: input.requiredRole ?? null,
      required_module: input.requiredModule ?? null,
      path_hint: input.pathHint ?? null,
    },
  });
}

type ModuleAccessDeniedAuditInput = {
  organizationId: string;
  branchId?: string | null;
  moduleCode: string;
  pathHint: string;
  reasonCode?: AuditReasonCode | string;
};

export async function logModuleAccessDeniedEvent(input: ModuleAccessDeniedAuditInput) {
  await logAuditEvent({
    action: "module.access_denied",
    entityType: "module",
    organizationId: input.organizationId,
    branchId: input.branchId ?? null,
    eventDomain: "security",
    outcome: "denied",
    severity: "high",
    reasonCode: input.reasonCode ?? "module_disabled_for_tenant",
    metadata: {
      module_code: input.moduleCode,
      path_hint: input.pathHint,
      commercial_intent_signal: true,
      blocked_copy_key: "module_not_included_plan",
    },
  });
}

type AuthAuditInput = {
  action: "login.success" | "login.failed" | "logout.success";
  organizationId?: string | null;
  outcome: AuditOutcome;
  severity?: AuditSeverity;
  reasonCode?: AuditReasonCode | string | null;
  metadata?: Record<string, unknown>;
};

export async function logAuthEvent(input: AuthAuditInput) {
  await logAuditEvent({
    action: input.action,
    entityType: "auth_session",
    organizationId: input.organizationId ?? null,
    eventDomain: "auth",
    outcome: input.outcome,
    severity: input.severity ?? "medium",
    reasonCode: input.reasonCode ?? null,
    metadata: input.metadata,
  });
}

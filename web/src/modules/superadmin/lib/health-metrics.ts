import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

const SCORE_PENALTIES = {
  inactiveTenant: 20,
  noAdmin: 35,
  noModules: 25,
  noEmployees: 15,
  noActivity: 10,
} as const;

export type TenantHealthRow = {
  organizationId: string;
  name: string;
  status: string;
  planId: string | null;
  activeAdmins: number;
  activeMembers: number;
  activeEmployees: number;
  enabledModules: number;
  docs30d: number;
  storageMb: number;
  storageLimitMb: number | null;
  checklist7d: number;
  activeAnnouncements: number;
  invitedAdminEmail: string | null;
  invitedAdminFirstLoginAt: string | null;
  invitedAdminFirstLoginStatus: "pending" | "completed" | "none";
  score: number;
  issues: string[];
};

export type TenantOperationalAlert = {
  organizationId: string;
  organizationName: string;
  severity: "medium" | "high" | "critical";
  code:
    | "tenant_not_active"
    | "missing_active_admin"
    | "no_enabled_modules"
    | "no_active_employees"
    | "no_recent_activity";
  message: string;
};

export type SuperadminOperationalMetrics = {
  windowDays: number;
  totalEvents: number;
  previousTotalEvents: number;
  deniedEvents: number;
  previousDeniedEvents: number;
  errorEvents: number;
  previousErrorEvents: number;
  failedAuthEvents: number;
  securityDeniedEvents: number;
  superadminMutationEvents: number;
  activeOrganizations: number;
  organizationsWithAnyModule: number;
  moduleAdoptionRatePct: number;
  avgEnabledModulesPerOrg: number;
  deniedRatePct: number;
  errorRatePct: number;
  authFailureRatePct: number;
  eventsTrendPct: number;
  deniedTrendPct: number;
  errorTrendPct: number;
};

export type ObservabilityDomainStatus = "ok" | "warning" | "critical";

export type ObservabilityDomainRow = {
  domain: string;
  label: string;
  totalEvents: number;
  errorEvents: number;
  deniedEvents: number;
  incidentEvents: number;
  incidentRatePct: number;
  avgResponseMs: number | null;
  p95ResponseMs: number | null;
  status: ObservabilityDomainStatus;
};

export type SuperadminObservabilityMetrics = {
  windowDays: number;
  totalEvents: number;
  errorEvents: number;
  deniedEvents: number;
  failedAuthEvents: number;
  avgResponseMs: number | null;
  p95ResponseMs: number | null;
  criticalDomains: ObservabilityDomainRow[];
};

type HealthSnapshotRow = {
  organization_id: string;
  name: string;
  status: string;
  plan_id: string | null;
  active_admins: number | string;
  active_members: number | string;
  active_employees: number | string;
  enabled_modules: number | string;
  docs_30d: number | string;
  storage_mb: number | string;
  checklist_7d: number | string;
  active_announcements: number | string;
  storage_limit_mb: number | string | null;
};

type InvitationFirstLoginRow = {
  organization_id: string;
  email: string;
  first_login_completed_at: string | null;
  created_at: string;
};

function computeScore(
  row: HealthSnapshotRow,
  invitationState?: {
    email: string;
    firstLoginAt: string | null;
  } | null,
) {
  const activeAdmins = Number(row.active_admins ?? 0);
  const activeMembers = Number(row.active_members ?? 0);
  const activeEmployees = Number(row.active_employees ?? 0);
  const enabledModules = Number(row.enabled_modules ?? 0);
  const docs30d = Number(row.docs_30d ?? 0);
  const storageMb = Number(row.storage_mb ?? 0);
  const storageLimitMb = row.storage_limit_mb == null ? null : Number(row.storage_limit_mb);
  const checklist7d = Number(row.checklist_7d ?? 0);
  const activeAnnouncements = Number(row.active_announcements ?? 0);

  const issues: string[] = [];
  let score = 100;

  if (row.status !== "active") {
    issues.push(`tenant ${row.status}`);
    score -= SCORE_PENALTIES.inactiveTenant;
  }
  if (activeAdmins === 0) {
    issues.push("sin admin");
    score -= SCORE_PENALTIES.noAdmin;
  }
  if (enabledModules === 0) {
    issues.push("sin módulos");
    score -= SCORE_PENALTIES.noModules;
  }
  if (activeEmployees === 0) {
    issues.push("sin empleados");
    score -= SCORE_PENALTIES.noEmployees;
  }
  if (docs30d === 0 && checklist7d === 0 && activeAnnouncements === 0) {
    issues.push("sin actividad");
    score -= SCORE_PENALTIES.noActivity;
  }

  return {
    organizationId: row.organization_id,
    name: row.name,
    status: row.status,
    planId: row.plan_id,
    activeAdmins,
    activeMembers,
    activeEmployees,
    enabledModules,
    docs30d,
    storageMb,
    storageLimitMb,
    checklist7d,
    activeAnnouncements,
    invitedAdminEmail: invitationState?.email ?? null,
    invitedAdminFirstLoginAt: invitationState?.firstLoginAt ?? null,
    invitedAdminFirstLoginStatus: invitationState
      ? invitationState.firstLoginAt
        ? "completed"
        : "pending"
      : "none",
    score: Math.max(0, score),
    issues,
  } satisfies TenantHealthRow;
}

export async function getSuperadminHealthMetrics() {
  const supabase = createSupabaseAdminClient();

  const [{ data: snapshotRows }, { data: moduleCatalog }, { data: invitationRows }] = await Promise.all([
    supabase.rpc("superadmin_org_health_snapshot"),
    supabase.from("module_catalog").select("id"),
    supabase
      .from("organization_invitations")
      .select("organization_id, email, first_login_completed_at, created_at")
      .eq("source", "superadmin")
      .eq("role_code", "company_admin")
      .contains("metadata", { mode: "superadmin_invite" })
      .order("created_at", { ascending: true }),
  ]);

  const firstInvitationByOrg = new Map<string, { email: string; firstLoginAt: string | null }>();
  for (const row of (invitationRows ?? []) as InvitationFirstLoginRow[]) {
    if (!row.organization_id || firstInvitationByOrg.has(row.organization_id)) continue;
    firstInvitationByOrg.set(row.organization_id, {
      email: row.email,
      firstLoginAt: row.first_login_completed_at,
    });
  }

  const tenantRows = ((snapshotRows ?? []) as HealthSnapshotRow[]).map((row) =>
    computeScore(row, firstInvitationByOrg.get(row.organization_id) ?? null),
  );

  const orgCount = tenantRows.length;
  const modulesCount = moduleCatalog?.length ?? 0;
  const healthyOrgs = tenantRows.filter((row) => row.score >= 85).length;
  const orgsWithRisk = tenantRows.filter((row) => row.score < 65).length;
  const topByRisk = [...tenantRows].sort((a, b) => a.score - b.score).slice(0, 10);
  const docs30dTotal = tenantRows.reduce((sum, row) => sum + row.docs30d, 0);
  const storageMbTotal = tenantRows.reduce((sum, row) => sum + row.storageMb, 0);
  const checklist7dTotal = tenantRows.reduce((sum, row) => sum + row.checklist7d, 0);
  const announcementsTotal = tenantRows.reduce((sum, row) => sum + row.activeAnnouncements, 0);

  return {
    tenantRows,
    orgCount,
    modulesCount,
    healthyOrgs,
    orgsWithRisk,
    topByRisk,
    docs30dTotal,
    storageMbTotal,
    checklist7dTotal,
    announcementsTotal,
  };
}

export function buildTenantOperationalAlerts(tenantRows: TenantHealthRow[]) {
  const alerts: TenantOperationalAlert[] = [];

  for (const row of tenantRows) {
    if (row.status !== "active") {
      alerts.push({
        organizationId: row.organizationId,
        organizationName: row.name,
        severity: "critical",
        code: "tenant_not_active",
        message: `Tenant en estado ${row.status}`,
      });
    }

    if (row.activeAdmins === 0) {
      alerts.push({
        organizationId: row.organizationId,
        organizationName: row.name,
        severity: "critical",
        code: "missing_active_admin",
        message: "Sin admins activos",
      });
    }

    if (row.enabledModules === 0) {
      alerts.push({
        organizationId: row.organizationId,
        organizationName: row.name,
        severity: "high",
        code: "no_enabled_modules",
        message: "Sin módulos habilitados",
      });
    }

    if (row.activeEmployees === 0) {
      alerts.push({
        organizationId: row.organizationId,
        organizationName: row.name,
        severity: "medium",
        code: "no_active_employees",
        message: "Sin empleados activos",
      });
    }

    if (row.docs30d === 0 && row.checklist7d === 0 && row.activeAnnouncements === 0) {
      alerts.push({
        organizationId: row.organizationId,
        organizationName: row.name,
        severity: "medium",
        code: "no_recent_activity",
        message: "Sin actividad reciente",
      });
    }
  }

  return alerts;
}

function toSafeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

type AuditLogRow = {
  created_at: string;
  action: string;
  metadata: Record<string, unknown> | null;
};

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function computeTrendPct(currentValue: number, previousValue: number) {
  if (previousValue <= 0) {
    return currentValue > 0 ? 100 : 0;
  }
  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(2));
}

function parseMetadataNumber(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return null;
  const safePercentile = Math.max(0, Math.min(100, percentileValue));
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((safePercentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? null;
}

const DOMAIN_LABELS: Record<string, string> = {
  auth: "Acceso",
  security: "Seguridad",
  superadmin: "Superadmin",
  employees: "Empleados",
  documents: "Documentos",
  announcements: "Avisos",
  checklists: "Checklists",
  settings: "Configuracion",
  onboarding: "Onboarding",
};

function getDomainLabel(domain: string) {
  return DOMAIN_LABELS[domain] ?? domain;
}

function getObservabilityStatus(incidentRatePct: number): ObservabilityDomainStatus {
  if (incidentRatePct >= 15) return "critical";
  if (incidentRatePct >= 5) return "warning";
  return "ok";
}

export async function getSuperadminObservabilityMetrics(windowDays = 7) {
  const supabase = createSupabaseAdminClient();
  const days = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : 7;
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: auditRows } = await supabase
    .from("audit_logs")
    .select("created_at, action, metadata")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(10000);

  const rows = (auditRows ?? []) as AuditLogRow[];

  let errorEvents = 0;
  let deniedEvents = 0;
  let failedAuthEvents = 0;
  const allDurations: number[] = [];

  type DomainAccumulator = {
    domain: string;
    totalEvents: number;
    errorEvents: number;
    deniedEvents: number;
    durations: number[];
  };

  const byDomain = new Map<string, DomainAccumulator>();

  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const domain = String(metadata.event_domain ?? "unknown");
    const outcome = String(metadata.outcome ?? "").toLowerCase();

    if (!byDomain.has(domain)) {
      byDomain.set(domain, {
        domain,
        totalEvents: 0,
        errorEvents: 0,
        deniedEvents: 0,
        durations: [],
      });
    }

    const domainRef = byDomain.get(domain);
    if (!domainRef) {
      continue;
    }

    domainRef.totalEvents += 1;

    if (outcome === "error") {
      errorEvents += 1;
      domainRef.errorEvents += 1;
    }
    if (outcome === "denied") {
      deniedEvents += 1;
      domainRef.deniedEvents += 1;
    }
    if (row.action === "login.failed") {
      failedAuthEvents += 1;
    }

    const durationMs = parseMetadataNumber(metadata, [
      "duration_ms",
      "response_time_ms",
      "latency_ms",
      "elapsed_ms",
    ]);
    if (durationMs != null) {
      allDurations.push(durationMs);
      domainRef.durations.push(durationMs);
    }
  }

  const criticalDomains = [...byDomain.values()]
    .map((domainRow) => {
      const incidentEvents = domainRow.errorEvents + domainRow.deniedEvents;
      const incidentRatePct = toPercent(incidentEvents, domainRow.totalEvents);
      const avgResponseMs =
        domainRow.durations.length > 0
          ? Number(
              (
                domainRow.durations.reduce((sum, duration) => sum + duration, 0) /
                domainRow.durations.length
              ).toFixed(2),
            )
          : null;
      const p95ResponseMs = percentile(domainRow.durations, 95);

      return {
        domain: domainRow.domain,
        label: getDomainLabel(domainRow.domain),
        totalEvents: domainRow.totalEvents,
        errorEvents: domainRow.errorEvents,
        deniedEvents: domainRow.deniedEvents,
        incidentEvents,
        incidentRatePct,
        avgResponseMs,
        p95ResponseMs,
        status: getObservabilityStatus(incidentRatePct),
      } satisfies ObservabilityDomainRow;
    })
    .sort((a, b) => {
      if (b.incidentEvents !== a.incidentEvents) {
        return b.incidentEvents - a.incidentEvents;
      }
      return b.totalEvents - a.totalEvents;
    })
    .slice(0, 5);

  const avgResponseMs =
    allDurations.length > 0
      ? Number((allDurations.reduce((sum, value) => sum + value, 0) / allDurations.length).toFixed(2))
      : null;

  return {
    windowDays: days,
    totalEvents: rows.length,
    errorEvents,
    deniedEvents,
    failedAuthEvents,
    avgResponseMs,
    p95ResponseMs: percentile(allDurations, 95),
    criticalDomains,
  } satisfies SuperadminObservabilityMetrics;
}

export async function getSuperadminOperationalMetrics(windowDays = 7) {
  const supabase = createSupabaseAdminClient();
  const days = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : 7;
  const nowMs = Date.now();
  const currentSinceMs = nowMs - days * 24 * 60 * 60 * 1000;
  const previousSinceMs = nowMs - days * 2 * 24 * 60 * 60 * 1000;
  const previousSinceIso = new Date(previousSinceMs).toISOString();

  const [
    { data: auditRows },
    { count: activeOrganizations },
    { data: enabledModulesRows },
  ] = await Promise.all([
    supabase
      .from("audit_logs")
      .select("created_at, action, metadata")
      .gte("created_at", previousSinceIso)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .eq("status", "active"),
    supabase
      .from("organization_modules")
      .select("organization_id")
      .eq("is_enabled", true),
  ]);

  const rows = (auditRows ?? []) as AuditLogRow[];

  let deniedEvents = 0;
  let previousDeniedEvents = 0;
  let errorEvents = 0;
  let previousErrorEvents = 0;
  let failedAuthEvents = 0;
  let securityDeniedEvents = 0;
  let superadminMutationEvents = 0;

  for (const row of rows) {
    const createdAtMs = Date.parse(row.created_at);
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }

    const isCurrentWindow = createdAtMs >= currentSinceMs;

    const metadata = row.metadata ?? {};
    const outcome = String(metadata.outcome ?? "").toLowerCase();
    if (isCurrentWindow) {
      if (outcome === "denied") {
        deniedEvents += 1;
      }
      if (outcome === "error") {
        errorEvents += 1;
      }

      if (row.action === "login.failed") {
        failedAuthEvents += 1;
      }

      if (row.action.startsWith("access.denied.")) {
        securityDeniedEvents += 1;
      }

      if (
        row.action.startsWith("organization.") ||
        row.action.startsWith("plan.") ||
        row.action.startsWith("module.")
      ) {
        superadminMutationEvents += 1;
      }
      continue;
    }

    if (outcome === "denied") {
      previousDeniedEvents += 1;
    }
    if (outcome === "error") {
      previousErrorEvents += 1;
    }
  }

  const totalEvents = rows.filter((row) => {
    const createdAtMs = Date.parse(row.created_at);
    return Number.isFinite(createdAtMs) && createdAtMs >= currentSinceMs;
  }).length;
  const previousTotalEvents = rows.length - totalEvents;

  const enabledRows = enabledModulesRows ?? [];
  const orgsWithAnyModuleSet = new Set(enabledRows.map((row) => row.organization_id));
  const organizationsWithAnyModule = orgsWithAnyModuleSet.size;
  const activeOrgs = toSafeNumber(activeOrganizations);
  const moduleAdoptionRatePct =
    activeOrgs > 0 ? Number(((organizationsWithAnyModule / activeOrgs) * 100).toFixed(2)) : 0;
  const avgEnabledModulesPerOrg =
    activeOrgs > 0 ? Number((enabledRows.length / activeOrgs).toFixed(2)) : 0;

  return {
    windowDays: days,
    totalEvents,
    previousTotalEvents,
    deniedEvents,
    previousDeniedEvents,
    errorEvents,
    previousErrorEvents,
    failedAuthEvents,
    securityDeniedEvents,
    superadminMutationEvents,
    activeOrganizations: activeOrgs,
    organizationsWithAnyModule,
    moduleAdoptionRatePct,
    avgEnabledModulesPerOrg,
    deniedRatePct: toPercent(deniedEvents, totalEvents),
    errorRatePct: toPercent(errorEvents, totalEvents),
    authFailureRatePct: toPercent(failedAuthEvents, totalEvents),
    eventsTrendPct: computeTrendPct(totalEvents, previousTotalEvents),
    deniedTrendPct: computeTrendPct(deniedEvents, previousDeniedEvents),
    errorTrendPct: computeTrendPct(errorEvents, previousErrorEvents),
  } satisfies SuperadminOperationalMetrics;
}

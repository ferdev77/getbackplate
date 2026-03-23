import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export type PlanLimitResource = "sucursales" | "usuarios" | "empleados" | "almacenamiento";

export class PlanLimitExceededError extends Error {
  readonly resource: PlanLimitResource;
  readonly current: number;
  readonly limit: number;
  readonly adding: number;

  constructor({
    resource,
    current,
    limit,
    adding,
  }: {
    resource: PlanLimitResource;
    current: number;
    limit: number;
    adding: number;
  }) {
    const prefix = `Limite de ${resource} alcanzado`;
    const detail = resource === "almacenamiento" ? `${current}/${limit} bytes` : `${current}/${limit}`;
    super(`${prefix} (${detail}). Actualiza tu plan para continuar.`);
    this.name = "PlanLimitExceededError";
    this.resource = resource;
    this.current = current;
    this.limit = limit;
    this.adding = adding;
  }
}

export function getPlanLimitErrorMessage(error: unknown, fallback: string) {
  if (error instanceof PlanLimitExceededError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export class PlanDowngradeBlockedError extends Error {
  readonly organizationId: string;
  readonly targetPlanId: string;
  readonly violations: string[];

  constructor({
    organizationId,
    targetPlanId,
    violations,
  }: {
    organizationId: string;
    targetPlanId: string;
    violations: string[];
  }) {
    super(`No se puede bajar de plan: ${violations.join(" ")}`);
    this.name = "PlanDowngradeBlockedError";
    this.organizationId = organizationId;
    this.targetPlanId = targetPlanId;
    this.violations = violations;
  }
}

type OrganizationLimits = {
  maxBranches: number | null;
  maxUsers: number | null;
  maxEmployees: number | null;
  maxStorageMb: number | null;
};

type OrganizationUsage = {
  branches: number;
  users: number;
  employees: number;
  storageBytes: number;
};

type UsageCacheEntry = {
  usage: OrganizationUsage;
  fetchedAt: number;
};

const USAGE_CACHE_TTL_MS = 15 * 1000;
const usageCache = new Map<string, UsageCacheEntry>();

type PlanLimits = {
  maxBranches: number | null;
  maxUsers: number | null;
  maxEmployees: number | null;
  maxStorageMb: number | null;
};

function toSafeInt(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

async function getLimits(orgId: string): Promise<OrganizationLimits> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("organization_limits")
    .select("max_branches, max_users, max_employees, max_storage_mb")
    .eq("organization_id", orgId)
    .maybeSingle();

  return {
    maxBranches: data?.max_branches ?? null,
    maxUsers: data?.max_users ?? null,
    maxEmployees: data?.max_employees ?? null,
    maxStorageMb: data?.max_storage_mb ?? null,
  };
}

async function getUsage(orgId: string): Promise<OrganizationUsage> {
  const cached = usageCache.get(orgId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt <= USAGE_CACHE_TTL_MS) {
    return cached.usage;
  }

  const admin = createSupabaseAdminClient();

  const [{ count: branches }, { count: users }, { count: employees }, { data: docs }] = await Promise.all([
    admin.from("branches").select("id", { head: true, count: "exact" }).eq("organization_id", orgId),
    admin
      .from("memberships")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", orgId)
      .in("status", ["active", "invited"]),
    admin.from("employees").select("id", { head: true, count: "exact" }).eq("organization_id", orgId),
    admin.from("documents").select("file_size_bytes").eq("organization_id", orgId),
  ]);

  const storageBytes = (docs ?? []).reduce((sum, row) => sum + toSafeInt(row.file_size_bytes), 0);

  const usage = {
    branches: toSafeInt(branches),
    users: toSafeInt(users),
    employees: toSafeInt(employees),
    storageBytes,
  };

  usageCache.set(orgId, { usage, fetchedAt: now });

  return usage;
}

function bumpUsageCache(orgId: string, updates: Partial<OrganizationUsage>) {
  const cached = usageCache.get(orgId);
  if (!cached) return;

  const next: OrganizationUsage = {
    branches: Math.max(0, cached.usage.branches + (updates.branches ?? 0)),
    users: Math.max(0, cached.usage.users + (updates.users ?? 0)),
    employees: Math.max(0, cached.usage.employees + (updates.employees ?? 0)),
    storageBytes: Math.max(0, cached.usage.storageBytes + (updates.storageBytes ?? 0)),
  };

  usageCache.set(orgId, {
    usage: next,
    fetchedAt: cached.fetchedAt,
  });
}

async function getPlanLimitsById(planId: string): Promise<PlanLimits | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("plans")
    .select("max_branches, max_users, max_employees, max_storage_mb")
    .eq("id", planId)
    .maybeSingle();

  if (!data) return null;

  return {
    maxBranches: data.max_branches ?? null,
    maxUsers: data.max_users ?? null,
    maxEmployees: data.max_employees ?? null,
    maxStorageMb: data.max_storage_mb ?? null,
  };
}

export async function getOrganizationUsageSnapshot(orgId: string) {
  const [limits, usage] = await Promise.all([getLimits(orgId), getUsage(orgId)]);

  return {
    limits,
    usage,
    usageStorageMb: Number((usage.storageBytes / (1024 * 1024)).toFixed(2)),
  };
}

function validateLimit({
  resource,
  current,
  adding,
  limit,
}: {
  resource: PlanLimitResource;
  current: number;
  adding: number;
  limit: number | null;
}) {
  if (limit == null || limit <= 0) return;
  if (current + adding <= limit) return;
  throw new PlanLimitExceededError({
    resource,
    current,
    limit,
    adding,
  });
}

export async function assertPlanLimitForBranches(orgId: string, adding = 1) {
  const [limits, usage] = await Promise.all([getLimits(orgId), getUsage(orgId)]);
  validateLimit({
    resource: "sucursales",
    current: usage.branches,
    adding,
    limit: limits.maxBranches,
  });
}

export async function assertPlanLimitForUsers(orgId: string, adding = 1) {
  const [limits, usage] = await Promise.all([getLimits(orgId), getUsage(orgId)]);
  validateLimit({
    resource: "usuarios",
    current: usage.users,
    adding,
    limit: limits.maxUsers,
  });
}

export async function assertPlanLimitForEmployees(orgId: string, adding = 1) {
  const [limits, usage] = await Promise.all([getLimits(orgId), getUsage(orgId)]);
  validateLimit({
    resource: "empleados",
    current: usage.employees,
    adding,
    limit: limits.maxEmployees,
  });
}

export async function assertPlanLimitForStorage(orgId: string, addingBytes: number) {
  if (!Number.isFinite(addingBytes) || addingBytes <= 0) return;

  const [limits, usage] = await Promise.all([getLimits(orgId), getUsage(orgId)]);

  const maxStorageBytes =
    limits.maxStorageMb == null || limits.maxStorageMb <= 0
      ? null
      : Math.floor(limits.maxStorageMb * 1024 * 1024);

  validateLimit({
    resource: "almacenamiento",
    current: usage.storageBytes,
    adding: Math.floor(addingBytes),
    limit: maxStorageBytes,
  });

  bumpUsageCache(orgId, { storageBytes: Math.floor(addingBytes) });
}

export async function assertOrganizationCanSwitchToPlan(orgId: string, targetPlanId: string) {
  const [usageSnapshot, targetPlanLimits] = await Promise.all([
    getOrganizationUsageSnapshot(orgId),
    getPlanLimitsById(targetPlanId),
  ]);

  if (!targetPlanLimits) {
    throw new Error("Plan destino no encontrado");
  }

  const violations: string[] = [];

  if (
    targetPlanLimits.maxBranches != null &&
    targetPlanLimits.maxBranches > 0 &&
    usageSnapshot.usage.branches > targetPlanLimits.maxBranches
  ) {
    violations.push(`sucursales ${usageSnapshot.usage.branches}/${targetPlanLimits.maxBranches}.`);
  }

  if (
    targetPlanLimits.maxUsers != null &&
    targetPlanLimits.maxUsers > 0 &&
    usageSnapshot.usage.users > targetPlanLimits.maxUsers
  ) {
    violations.push(`usuarios ${usageSnapshot.usage.users}/${targetPlanLimits.maxUsers}.`);
  }

  if (
    targetPlanLimits.maxEmployees != null &&
    targetPlanLimits.maxEmployees > 0 &&
    usageSnapshot.usage.employees > targetPlanLimits.maxEmployees
  ) {
    violations.push(`empleados ${usageSnapshot.usage.employees}/${targetPlanLimits.maxEmployees}.`);
  }

  const targetStorageMb = targetPlanLimits.maxStorageMb ?? null;
  if (targetStorageMb != null && targetStorageMb > 0 && usageSnapshot.usageStorageMb > targetStorageMb) {
    violations.push(`storage ${usageSnapshot.usageStorageMb}MB/${targetStorageMb}MB.`);
  }

  if (violations.length > 0) {
    throw new PlanDowngradeBlockedError({
      organizationId: orgId,
      targetPlanId,
      violations,
    });
  }
}

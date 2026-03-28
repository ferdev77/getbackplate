import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { planChangeDecisionTemplate } from "@/shared/lib/email-templates/billing";

type PlanRow = {
  id: string;
  name: string;
  code: string;
  price_amount: number | null;
  billing_period: string | null;
  max_branches: number | null;
  max_users: number | null;
  max_employees: number | null;
  max_storage_mb: number | null;
};

type ModuleRow = {
  plan_id: string;
  module_catalog: {
    code: string;
    name: string;
  } | null;
};

function formatPlanPrice(plan: Pick<PlanRow, "price_amount" | "billing_period">) {
  if (typeof plan.price_amount !== "number") return "Precio no definido";
  const period = plan.billing_period === "yearly" || plan.billing_period === "annual" ? "anual" : "mensual";
  return `$${plan.price_amount} / ${period}`;
}

function normalizeModuleName(code: string, fallbackName?: string | null) {
  if (fallbackName && fallbackName.trim()) return fallbackName.trim();

  const labels: Record<string, string> = {
    announcements: "Avisos",
    checklists: "Checklists",
    documents: "Documentos",
    employees: "Usuarios y Empleados",
    reports: "Reportes",
    ai_assistant: "Asistente IA",
    settings: "Ajustes",
    dashboard: "Dashboard",
    company_portal: "Portal Empresa",
  };

  return labels[code] ?? code;
}

async function getPlanById(planId: string): Promise<PlanRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("plans")
    .select("id, name, code, price_amount, billing_period, max_branches, max_users, max_employees, max_storage_mb")
    .eq("id", planId)
    .maybeSingle();

  return (data as PlanRow | null) ?? null;
}

async function getPlanByStripePriceId(priceId: string): Promise<PlanRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("plans")
    .select("id, name, code, price_amount, billing_period, max_branches, max_users, max_employees, max_storage_mb")
    .eq("stripe_price_id", priceId)
    .maybeSingle();

  return (data as PlanRow | null) ?? null;
}

async function getOrganizationAndCurrentPlan(organizationId: string): Promise<{ orgName: string; currentPlanId: string | null }> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("organizations")
    .select("name, plan_id")
    .eq("id", organizationId)
    .maybeSingle();

  return {
    orgName: data?.name ?? "Tu organizacion",
    currentPlanId: data?.plan_id ?? null,
  };
}

async function getEnabledModuleNamesByPlanId(planId: string | null): Promise<string[]> {
  if (!planId) return [];

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("plan_modules")
    .select("plan_id, module_catalog!inner(code, name)")
    .eq("plan_id", planId)
    .eq("is_enabled", true);

  const rows = (data ?? []) as ModuleRow[];

  return rows
    .map((row) => normalizeModuleName(row.module_catalog?.code ?? "", row.module_catalog?.name ?? null))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function sendPlanChangeDecisionEmail(params: {
  organizationId: string;
  actorEmail: string | null;
  actorFullName: string;
  targetPlanId?: string | null;
  targetPriceId?: string | null;
}) {
  if (!params.actorEmail) {
    return { ok: false as const, error: "No se encontro email del actor" };
  }

  const [{ orgName, currentPlanId }, targetFromId, targetFromPrice] = await Promise.all([
    getOrganizationAndCurrentPlan(params.organizationId),
    params.targetPlanId ? getPlanById(params.targetPlanId) : Promise.resolve(null),
    params.targetPriceId ? getPlanByStripePriceId(params.targetPriceId) : Promise.resolve(null),
  ]);

  const targetPlan = targetFromId ?? targetFromPrice;
  if (!targetPlan) {
    return { ok: false as const, error: "No se pudo resolver el plan destino" };
  }

  const currentPlan = currentPlanId ? await getPlanById(currentPlanId) : null;

  const [currentModules, targetModules] = await Promise.all([
    getEnabledModuleNamesByPlanId(currentPlan?.id ?? null),
    getEnabledModuleNamesByPlanId(targetPlan.id),
  ]);

  const currentSet = new Set(currentModules);
  const targetSet = new Set(targetModules);

  const modulesToEnable = targetModules.filter((name) => !currentSet.has(name));
  const modulesToDisable = currentModules.filter((name) => !targetSet.has(name));

  const direction: "upgrade" | "downgrade" =
    (targetPlan.price_amount ?? 0) < (currentPlan?.price_amount ?? 0) ? "downgrade" : "upgrade";

  const limits = [
    { label: "Sucursales", value: targetPlan.max_branches != null ? String(targetPlan.max_branches) : "Sin limite" },
    { label: "Usuarios", value: targetPlan.max_users != null ? String(targetPlan.max_users) : "Sin limite" },
    { label: "Empleados", value: targetPlan.max_employees != null ? String(targetPlan.max_employees) : "Sin limite" },
    { label: "Storage", value: targetPlan.max_storage_mb != null ? `${targetPlan.max_storage_mb} MB` : "Sin limite" },
  ];

  const html = planChangeDecisionTemplate({
    orgName,
    actorName: params.actorFullName,
    actorEmail: params.actorEmail,
    previousPlanName: currentPlan?.name ?? "Sin plan",
    targetPlanName: targetPlan.name,
    targetPlanPrice: formatPlanPrice(targetPlan),
    targetPlanLimits: limits,
    modulesToEnable,
    modulesToDisable,
    direction,
    happenedAt: new Date().toLocaleString("es-AR"),
  });

  const result = await sendTransactionalEmail({
    to: params.actorEmail,
    subject: `Cambio de plan solicitado: ${targetPlan.name}`,
    html,
  });

  return result;
}

import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { stripe } from "@/infrastructure/stripe/client";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { getTenantEmailBranding } from "@/shared/lib/email-branding";
import { planChangeAppliedTemplate, planChangeDecisionTemplate } from "@/shared/lib/email-templates/billing";

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
  module_catalog:
    | {
        code: string;
        name: string;
      }
    | {
        code: string;
        name: string;
      }[]
    | null;
};

function getModuleCatalogValue(value: ModuleRow["module_catalog"]) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

type ModuleCatalogValue = {
  code: string;
  name: string;
};

function formatPlanPrice(plan: Pick<PlanRow, "price_amount" | "billing_period">) {
  if (typeof plan.price_amount !== "number") return "Precio no definido";
  const period = plan.billing_period === "yearly" || plan.billing_period === "annual" ? "anual" : "mensual";
  return `$${plan.price_amount} / ${period}`;
}

async function resolvePricePresentation(params: {
  targetPriceId?: string | null;
  fallbackPlan: Pick<PlanRow, "price_amount" | "billing_period">;
}) {
  if (!params.targetPriceId) {
    return {
      label: formatPlanPrice(params.fallbackPlan),
      amount: typeof params.fallbackPlan.price_amount === "number" ? params.fallbackPlan.price_amount : null,
      period: params.fallbackPlan.billing_period === "yearly" || params.fallbackPlan.billing_period === "annual" ? "yearly" : "monthly",
    } as const;
  }

  try {
    const price = await stripe.prices.retrieve(params.targetPriceId);
    const amount = typeof price.unit_amount === "number" ? price.unit_amount / 100 : null;
    const period = price.recurring?.interval === "year" ? "yearly" : "monthly";

    if (amount == null) {
      return {
        label: formatPlanPrice(params.fallbackPlan),
        amount: typeof params.fallbackPlan.price_amount === "number" ? params.fallbackPlan.price_amount : null,
        period,
      } as const;
    }

    return {
      label: `$${amount} / ${period === "yearly" ? "anual" : "mensual"}`,
      amount,
      period,
    } as const;
  } catch {
    return {
      label: formatPlanPrice(params.fallbackPlan),
      amount: typeof params.fallbackPlan.price_amount === "number" ? params.fallbackPlan.price_amount : null,
      period: params.fallbackPlan.billing_period === "yearly" || params.fallbackPlan.billing_period === "annual" ? "yearly" : "monthly",
    } as const;
  }
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

  const rows = (data ?? []) as unknown as ModuleRow[];

  return rows
    .map((row) => {
      const catalog = getModuleCatalogValue(row.module_catalog) as ModuleCatalogValue | null;
      return normalizeModuleName(catalog?.code ?? "", catalog?.name ?? null);
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function getActorIdentity(params: { actorUserId?: string | null; actorEmail?: string | null; actorFullName?: string | null }) {
  if (params.actorEmail && params.actorEmail.trim()) {
    return {
      actorEmail: params.actorEmail.trim(),
      actorName: params.actorFullName?.trim() || params.actorEmail.trim(),
    };
  }

  if (!params.actorUserId) {
    return { actorEmail: null, actorName: params.actorFullName?.trim() || "Administrador" };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(params.actorUserId);

  if (error || !data.user?.email) {
    return { actorEmail: null, actorName: params.actorFullName?.trim() || "Administrador" };
  }

  const metadata = data.user.user_metadata as Record<string, unknown> | null;
  const fullName = typeof metadata?.full_name === "string" ? metadata.full_name.trim() : "";

  return {
    actorEmail: data.user.email,
    actorName: fullName || params.actorFullName?.trim() || data.user.email,
  };
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

  const currentPricePresentation = await resolvePricePresentation({
    targetPriceId: currentPlan?.id ? null : null,
    fallbackPlan: currentPlan ?? targetPlan,
  });

  const pricePresentation = await resolvePricePresentation({
    targetPriceId: params.targetPriceId,
    fallbackPlan: targetPlan,
  });

  const direction: "upgrade" | "downgrade" =
    (pricePresentation.amount ?? targetPlan.price_amount ?? 0) < (currentPricePresentation.amount ?? currentPlan?.price_amount ?? 0)
      ? "downgrade"
      : "upgrade";

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
    targetPlanPrice: pricePresentation.label,
    targetPlanLimits: limits,
    modulesToEnable,
    modulesToDisable,
    direction,
    happenedAt: new Date().toLocaleString("es-AR"),
    branding: await getTenantEmailBranding(params.organizationId),
  });

  const result = await sendTransactionalEmail({
    to: params.actorEmail,
    subject: `Cambio de plan solicitado: ${targetPlan.name}`,
    html,
  });

  return result;
}

export async function sendPlanChangeAppliedEmail(params: {
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorFullName?: string | null;
  previousPlanId?: string | null;
  previousPriceId?: string | null;
  targetPlanId?: string | null;
  targetPriceId?: string | null;
}) {
  const actor = await getActorIdentity({
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorFullName: params.actorFullName,
  });

  if (!actor.actorEmail) {
    return { ok: false as const, error: "No se encontro email del actor para notificacion aplicada" };
  }

  const [{ orgName }, prevById, prevByPrice, targetById, targetByPrice] = await Promise.all([
    getOrganizationAndCurrentPlan(params.organizationId),
    params.previousPlanId ? getPlanById(params.previousPlanId) : Promise.resolve(null),
    params.previousPriceId ? getPlanByStripePriceId(params.previousPriceId) : Promise.resolve(null),
    params.targetPlanId ? getPlanById(params.targetPlanId) : Promise.resolve(null),
    params.targetPriceId ? getPlanByStripePriceId(params.targetPriceId) : Promise.resolve(null),
  ]);

  const previousPlan = prevById ?? prevByPrice;
  const targetPlan = targetById ?? targetByPrice;

  if (!targetPlan) {
    return { ok: false as const, error: "No se pudo resolver el plan aplicado" };
  }

  const [previousModules, targetModules] = await Promise.all([
    getEnabledModuleNamesByPlanId(previousPlan?.id ?? null),
    getEnabledModuleNamesByPlanId(targetPlan.id),
  ]);

  const previousSet = new Set(previousModules);
  const targetSet = new Set(targetModules);

  const modulesToEnable = targetModules.filter((name) => !previousSet.has(name));
  const modulesToDisable = previousModules.filter((name) => !targetSet.has(name));

  const previousPricePresentation = await resolvePricePresentation({
    targetPriceId: params.previousPriceId,
    fallbackPlan: previousPlan ?? targetPlan,
  });

  const pricePresentation = await resolvePricePresentation({
    targetPriceId: params.targetPriceId,
    fallbackPlan: targetPlan,
  });

  const direction: "upgrade" | "downgrade" =
    (pricePresentation.amount ?? targetPlan.price_amount ?? 0) < (previousPricePresentation.amount ?? previousPlan?.price_amount ?? 0)
      ? "downgrade"
      : "upgrade";

  const limits = [
    { label: "Sucursales", value: targetPlan.max_branches != null ? String(targetPlan.max_branches) : "Sin limite" },
    { label: "Usuarios", value: targetPlan.max_users != null ? String(targetPlan.max_users) : "Sin limite" },
    { label: "Empleados", value: targetPlan.max_employees != null ? String(targetPlan.max_employees) : "Sin limite" },
    { label: "Storage", value: targetPlan.max_storage_mb != null ? `${targetPlan.max_storage_mb} MB` : "Sin limite" },
  ];

  const html = planChangeAppliedTemplate({
    orgName,
    actorName: actor.actorName,
    actorEmail: actor.actorEmail,
    previousPlanName: previousPlan?.name ?? "Sin plan",
    targetPlanName: targetPlan.name,
    targetPlanPrice: pricePresentation.label,
    targetPlanLimits: limits,
    modulesToEnable,
    modulesToDisable,
    direction,
    appliedAt: new Date().toLocaleString("es-AR"),
    branding: await getTenantEmailBranding(params.organizationId),
  });

  const result = await sendTransactionalEmail({
    to: actor.actorEmail,
    subject: `Cambio de plan aplicado: ${targetPlan.name}`,
    html,
  });

  return result;
}

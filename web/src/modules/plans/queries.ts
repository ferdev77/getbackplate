import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export async function getActivePlans() {
  const supabase = createSupabaseAdminClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select("id, code, name, description, price_amount, currency_code, billing_period, max_branches, max_users, max_storage_mb, max_employees, stripe_price_id")
    .eq("is_active", true)
    .order("price_amount", { ascending: true });

  if (error) {
    console.error("Error fetching plans:", error);
    return [];
  }

  // Fetch counts of enabled modules for these plans
  const { data: modulesData, error: modulesError } = await supabase
    .from("plan_modules")
    .select("plan_id")
    .eq("is_enabled", true)
    .in("plan_id", plans.map(p => p.id));

  if (!modulesError && modulesData) {
    const counts = modulesData.reduce((acc: Record<string, number>, curr) => {
      acc[curr.plan_id] = (acc[curr.plan_id] || 0) + 1;
      return acc;
    }, {});

    return plans.map(plan => ({
      ...plan,
      modules_count: counts[plan.id] || 0
    }));
  }

  return plans;
}

export async function getActivePlansForLanding() {
  const supabase = createSupabaseAdminClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select("id, code, name, description, price_amount, currency_code, billing_period, max_branches, max_users, max_storage_mb, max_employees, stripe_price_id")
    .eq("is_active", true)
    .order("price_amount", { ascending: true });

  if (error || !plans) {
    return [];
  }

  const { data: modulesData } = await supabase
    .from("plan_modules")
    .select("plan_id, module_catalog!inner(code, name)")
    .eq("is_enabled", true)
    .in("plan_id", plans.map((plan) => plan.id));

  const mapByPlanId: Record<string, Array<{ code: string; name: string }>> = {};
  const countsByPlanId: Record<string, number> = {};

  for (const row of modulesData ?? []) {
    const planId = typeof row.plan_id === "string" ? row.plan_id : "";
    const catalog = row.module_catalog as unknown as { code?: string | null; name?: string | null } | null;
    const code = typeof catalog?.code === "string" ? catalog.code : "";
    const name = typeof catalog?.name === "string" ? catalog.name : code;

    if (!planId || !code || !name) continue;
    if (!mapByPlanId[planId]) mapByPlanId[planId] = [];
    if (!mapByPlanId[planId].some((item) => item.code === code)) {
      mapByPlanId[planId].push({ code, name });
      countsByPlanId[planId] = (countsByPlanId[planId] || 0) + 1;
    }
  }

  return plans.map((plan) => ({
    ...plan,
    modules_count: countsByPlanId[plan.id] || 0,
    modules: mapByPlanId[plan.id] || [],
  }));
}

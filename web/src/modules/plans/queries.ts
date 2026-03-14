import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export async function getActivePlans() {
  const supabase = createSupabaseAdminClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select("id, code, name, description, price_amount, currency_code, billing_period, max_branches, max_users, max_storage_mb, max_employees")
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

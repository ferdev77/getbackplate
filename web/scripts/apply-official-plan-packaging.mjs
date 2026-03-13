import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OFFICIAL_PLANS = [
  {
    code: "starter",
    name: "Starter",
    description: "Plan base para operaciones pequenas",
    price_amount: 49,
    currency_code: "USD",
    billing_period: "monthly",
    max_branches: 1,
    max_users: 10,
    max_employees: 25,
    max_storage_mb: 1024,
    is_active: true,
  },
  {
    code: "growth",
    name: "Pro",
    description: "Plan profesional para operaciones multi-sucursal",
    price_amount: 129,
    currency_code: "USD",
    billing_period: "monthly",
    max_branches: 5,
    max_users: 40,
    max_employees: 200,
    max_storage_mb: 5120,
    is_active: true,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "Plan avanzado para operaciones de gran escala",
    price_amount: 399,
    currency_code: "USD",
    billing_period: "monthly",
    max_branches: 20,
    max_users: 200,
    max_employees: 1000,
    max_storage_mb: 20480,
    is_active: true,
  },
];

const PLAN_MODULE_CODES = {
  starter: ["dashboard", "settings", "employees", "documents", "announcements", "onboarding"],
  growth: ["dashboard", "settings", "employees", "documents", "announcements", "onboarding", "checklists"],
  enterprise: [
    "dashboard",
    "settings",
    "employees",
    "documents",
    "announcements",
    "onboarding",
    "checklists",
    "reports",
  ],
};

async function main() {
  const { data: modulesCatalog, error: modulesError } = await supabase
    .from("module_catalog")
    .select("id, code, is_core");

  if (modulesError) {
    throw new Error(`No se pudo leer module_catalog: ${modulesError.message}`);
  }

  const moduleByCode = new Map((modulesCatalog ?? []).map((module) => [module.code, module]));

  for (const plan of OFFICIAL_PLANS) {
    const { data: upsertedPlan, error } = await supabase
      .from("plans")
      .upsert(plan, { onConflict: "code" })
      .select("id")
      .single();

    if (error) {
      throw new Error(`No se pudo upsert plan ${plan.code}: ${error.message}`);
    }

    if (!upsertedPlan?.id) {
      throw new Error(`No se pudo resolver id del plan ${plan.code} tras upsert`);
    }

    const selectedCodes = new Set(PLAN_MODULE_CODES[plan.code] ?? []);
    const moduleIdsForPlan = (modulesCatalog ?? [])
      .filter((module) => module.is_core || selectedCodes.has(module.code))
      .map((module) => module.id);

    const missingCodes = [...selectedCodes].filter((code) => !moduleByCode.has(code));
    if (missingCodes.length) {
      throw new Error(
        `El plan ${plan.code} referencia modulos inexistentes: ${missingCodes.join(", ")}`,
      );
    }

    const { error: deletePlanModulesError } = await supabase
      .from("plan_modules")
      .delete()
      .eq("plan_id", upsertedPlan.id);

    if (deletePlanModulesError) {
      throw new Error(
        `No se pudo limpiar modulos del plan ${plan.code}: ${deletePlanModulesError.message}`,
      );
    }

    if (moduleIdsForPlan.length > 0) {
      const { error: insertPlanModulesError } = await supabase.from("plan_modules").insert(
        moduleIdsForPlan.map((moduleId) => ({
          plan_id: upsertedPlan.id,
          module_id: moduleId,
          is_enabled: true,
        })),
      );

      if (insertPlanModulesError) {
        throw new Error(
          `No se pudo guardar modulos del plan ${plan.code}: ${insertPlanModulesError.message}`,
        );
      }
    }
  }

  console.log("OK: packaging oficial de planes aplicado (starter/growth-pro/enterprise).");
}

main().catch((error) => {
  console.error("ERROR apply-official-plan-packaging:", error.message);
  process.exit(1);
});

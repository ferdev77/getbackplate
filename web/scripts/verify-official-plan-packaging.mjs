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

const EXPECTED = {
  starter: { max_branches: 1, max_users: 10, max_employees: 25, max_storage_mb: 1024, expected_name: "Starter" },
  growth: { max_branches: 5, max_users: 40, max_employees: 200, max_storage_mb: 5120, expected_name: "Pro" },
  enterprise: {
    max_branches: 20,
    max_users: 200,
    max_employees: 1000,
    max_storage_mb: 20480,
    expected_name: "Enterprise",
  },
};

const EXPECTED_OPTIONAL_MODULES = {
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

  const codeByModuleId = new Map((modulesCatalog ?? []).map((module) => [module.id, module.code]));
  const coreCodes = new Set((modulesCatalog ?? []).filter((module) => module.is_core).map((module) => module.code));

  const { data, error } = await supabase
    .from("plans")
    .select("code, name, is_active, max_branches, max_users, max_employees, max_storage_mb")
    .in("code", Object.keys(EXPECTED));

  if (error) {
    throw new Error(`No se pudo leer planes: ${error.message}`);
  }

  const byCode = new Map((data ?? []).map((row) => [row.code, row]));

  const { data: planRows } = await supabase
    .from("plans")
    .select("id, code")
    .in("code", Object.keys(EXPECTED));

  const planIdByCode = new Map((planRows ?? []).map((plan) => [plan.code, plan.id]));

  const { data: planModulesRows, error: planModulesError } = await supabase
    .from("plan_modules")
    .select("plan_id, module_id")
    .in("plan_id", [...planIdByCode.values()]);

  if (planModulesError) {
    throw new Error(`No se pudo leer plan_modules: ${planModulesError.message}`);
  }

  const moduleCodesByPlanCode = new Map();
  for (const [code, planId] of planIdByCode.entries()) {
    const codes = new Set(
      (planModulesRows ?? [])
        .filter((row) => row.plan_id === planId)
        .map((row) => codeByModuleId.get(row.module_id))
        .filter(Boolean),
    );
    moduleCodesByPlanCode.set(code, codes);
  }
  const result = [];

  for (const [code, expected] of Object.entries(EXPECTED)) {
    const row = byCode.get(code);
    const ok =
      Boolean(row) &&
      row.is_active === true &&
      Number(row.max_branches ?? 0) === expected.max_branches &&
      Number(row.max_users ?? 0) === expected.max_users &&
      Number(row.max_employees ?? 0) === expected.max_employees &&
      Number(row.max_storage_mb ?? 0) === expected.max_storage_mb &&
      String(row.name ?? "") === expected.expected_name;

    const expectedCodes = new Set([
      ...coreCodes,
      ...(EXPECTED_OPTIONAL_MODULES[code] ?? []),
    ]);
    const currentCodes = moduleCodesByPlanCode.get(code) ?? new Set();
    const missingModules = [...expectedCodes].filter((moduleCode) => !currentCodes.has(moduleCode));
    const modulesOk = missingModules.length === 0;

    result.push({
      code,
      exists: Boolean(row),
      active: row?.is_active ?? false,
      name: row?.name ?? null,
      max_branches: row?.max_branches ?? null,
      max_users: row?.max_users ?? null,
      max_employees: row?.max_employees ?? null,
      max_storage_mb: row?.max_storage_mb ?? null,
      modules_ok: modulesOk,
      missing_modules: missingModules.join(", "),
      ok: ok && modulesOk,
    });
  }

  console.table(result);

  if (result.some((row) => !row.ok)) {
    throw new Error("Packaging oficial no coincide con el contrato definido.");
  }

  console.log("OK: packaging oficial de planes verificado.");
}

main().catch((error) => {
  console.error("ERROR verify-official-plan-packaging:", error.message);
  process.exit(1);
});

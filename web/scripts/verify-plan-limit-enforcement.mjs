import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const EXPECTED_GUARDS = [
  {
    file: "src/modules/settings/actions.ts",
    mustInclude: ["assertPlanLimitForBranches"],
  },
  {
    file: "src/app/api/company/users/route.ts",
    mustInclude: ["assertPlanLimitForUsers"],
  },
  {
    file: "src/app/api/company/employees/route.ts",
    mustInclude: ["assertPlanLimitForEmployees", "assertPlanLimitForUsers", "assertPlanLimitForStorage"],
  },
  {
    file: "src/app/api/company/documents/route.ts",
    mustInclude: ["assertPlanLimitForStorage"],
  },
];

async function main() {
  const result = [];

  for (const check of EXPECTED_GUARDS) {
    const filePath = path.join(ROOT, check.file);
    const source = await fs.readFile(filePath, "utf8");
    const missing = check.mustInclude.filter((token) => !source.includes(token));

    result.push({
      file: check.file,
      required_guards: check.mustInclude.join(", "),
      missing_guards: missing.join(", "),
      ok: missing.length === 0,
    });
  }

  console.table(result);

  if (result.some((row) => !row.ok)) {
    throw new Error("Enforcement de limites por plan incompleto en uno o mas endpoints/actions.");
  }

  console.log("OK: enforcement de limites por plan detectado en rutas y acciones criticas.");
}

main().catch((error) => {
  console.error("ERROR verify-plan-limit-enforcement:", error.message);
  process.exit(1);
});

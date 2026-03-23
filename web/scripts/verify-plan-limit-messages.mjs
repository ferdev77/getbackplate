import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const FILES = [
  "src/modules/settings/actions.ts",
  "src/app/api/company/users/route.ts",
  "src/app/api/company/employees/route.ts",
  "src/app/api/company/documents/route.ts",
];

async function main() {
  const rows = [];

  for (const relativePath of FILES) {
    const absPath = path.join(ROOT, relativePath);
    const source = await fs.readFile(absPath, "utf8");

    const hasLimitAsserts = source.includes("assertPlanLimitFor");
    const hasMessageHelper = source.includes("getPlanLimitErrorMessage(");

    rows.push({
      file: relativePath,
      has_limit_asserts: hasLimitAsserts,
      has_message_helper: hasMessageHelper,
      ok: !hasLimitAsserts || hasMessageHelper,
    });
  }

  console.table(rows);

  if (rows.some((row) => !row.ok)) {
    throw new Error("Hay acciones/API con enforcement de limites sin mensajes consistentes.");
  }

  console.log("OK: mensajes de limites por plan consistentes en acciones y APIs criticas.");
}

main().catch((error) => {
  console.error("ERROR verify-plan-limit-messages:", error.message);
  process.exit(1);
});

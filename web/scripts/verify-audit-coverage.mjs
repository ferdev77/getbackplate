import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, "src", "modules");

const MUTATION_HINTS = [
  "create",
  "update",
  "delete",
  "toggle",
  "submit",
  "review",
  "upsert",
  "archive",
  "mark",
];

function isPotentialMutation(functionName) {
  const lower = functionName.toLowerCase();
  return MUTATION_HINTS.some((hint) => lower.includes(hint));
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walk(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name === "actions.ts") {
      results.push(fullPath);
    }
  }

  return results;
}

function extractFunctions(sourceText) {
  const matches = [...sourceText.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)];
  return matches.map((m) => ({ name: m[1], index: m.index ?? 0 }));
}

function extractFunctionBlock(sourceText, startIndex) {
  const openBrace = sourceText.indexOf("{", startIndex);
  if (openBrace < 0) return "";

  let depth = 0;
  for (let i = openBrace; i < sourceText.length; i += 1) {
    if (sourceText[i] === "{") depth += 1;
    if (sourceText[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(openBrace, i + 1);
      }
    }
  }

  return sourceText.slice(openBrace);
}

async function main() {
  const files = await walk(MODULES_DIR);
  const rows = [];

  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf8");
    const functions = extractFunctions(source);

    for (const fn of functions) {
      if (!isPotentialMutation(fn.name)) continue;
      const block = extractFunctionBlock(source, fn.index);
      const hasAudit =
        block.includes("logAuditEvent(") ||
        block.includes("logAuthEvent(") ||
        block.includes("logAccessDeniedEvent(");

      rows.push({
        file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
        function: fn.name,
        has_audit: hasAudit,
      });
    }
  }

  const uncovered = rows.filter((row) => !row.has_audit);

  console.table([
    {
      mutation_actions_checked: rows.length,
      missing_audit_actions: uncovered.length,
    },
  ]);

  if (uncovered.length > 0) {
    console.log("Funciones sin auditoria detectadas (max 30):");
    console.table(uncovered.slice(0, 30));
    throw new Error(`Cobertura de auditoria incompleta: ${uncovered.length} accion(es) sin log.`);
  }

  console.log("OK: cobertura de auditoria validada para acciones mutables en modules/*/actions.ts.");
}

main().catch((error) => {
  console.error("ERROR verify-audit-coverage:", error.message);
  process.exit(1);
});

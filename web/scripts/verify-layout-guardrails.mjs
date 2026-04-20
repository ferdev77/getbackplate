import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const TARGET_SEGMENTS = [
  `${path.sep}src${path.sep}app${path.sep}(company)${path.sep}app${path.sep}`,
  `${path.sep}src${path.sep}app${path.sep}(employee)${path.sep}portal${path.sep}`,
  `${path.sep}src${path.sep}app${path.sep}(superadmin)${path.sep}superadmin${path.sep}`,
  `${path.sep}src${path.sep}modules${path.sep}`,
];

const ALLOWLIST = new Set([
  path.join("src", "shared", "ui", "page-content.tsx"),
]);

const RULES = [
  {
    id: "no-main-padding",
    pattern: /<main\s+className=\"[^\"]*\b(?:px-|pl-|pr-)\"/g,
    message: "No uses padding horizontal en <main>. Usa PageContent.",
  },
  {
    id: "no-pagecontent-padding-override",
    pattern: /<PageContent[^>]*className=\"[^\"]*\b(?:px-|pl-|pr-)\"/g,
    message: "No sobrescribas padding horizontal en PageContent.",
  },
  {
    id: "no-manual-content-max",
    pattern: /\b(?:max-w-7xl|max-w-\[var\(--gbp-content-max\)\])\b/g,
    message: "No uses max-width manual de contenido. Usa PageContent.",
  },
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === ".next" || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
    files.push(fullPath);
  }

  return files;
}

function isTargetFile(filePath) {
  return TARGET_SEGMENTS.some((segment) => filePath.includes(segment));
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath);
}

async function main() {
  const srcDir = path.join(ROOT, "src");
  const allFiles = await collectFiles(srcDir);
  const violations = [];

  for (const file of allFiles) {
    if (!isTargetFile(file)) continue;
    const relativePath = toRelative(file);
    if (ALLOWLIST.has(relativePath)) continue;

    const content = await readFile(file, "utf8");

    for (const rule of RULES) {
      const matches = [...content.matchAll(rule.pattern)];
      if (matches.length === 0) continue;
      for (const match of matches) {
        const index = match.index ?? 0;
        const line = content.slice(0, index).split("\n").length;
        violations.push(`${relativePath}:${line} [${rule.id}] ${rule.message}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("\nLayout guardrails: se detectaron violaciones.\n");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    console.error("\nSolucion: usa PageContent y evita px/pl/pr o max-w manual en root de pagina.\n");
    process.exit(1);
  }

  console.log("Layout guardrails OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

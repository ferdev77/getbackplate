import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT, "src");
const PUBLIC_ROOT = path.join(ROOT, "public");

const USER_VISIBLE_ROOTS = [
  path.join("src", "app"),
  path.join("src", "modules"),
  path.join("src", "shared", "lib"),
  path.join("src", "shared", "ui"),
  path.join("src", "infrastructure", "email"),
  path.join("src", "infrastructure", "notifications"),
  path.join("src", "infrastructure", "push"),
  path.join("public"),
];

const EXCLUDED_SEGMENTS = new Set([
  "__fixtures__",
  "__mocks__",
  "__tests__",
  "fixtures",
  "mocks",
]);

const EXCLUDED_PREFIXES = [];

// These are established product terms, not regionalisms to neutralize.
const ALLOWED_PRODUCT_TERMS = new Set(["email", "locación", "locaciones"]);

const VOSEO_FORMS = [
  "vos",
  "tenés", "podés", "querés", "debés", "sabés", "necesitás", "manejás", "preferís",
  "hacé", "ingresá", "seleccioná", "elegí", "completá", "configurá", "agregá",
  "revisá", "verificá", "activá", "desactivá", "guardá", "confirmá", "cancelá",
  "creá", "editá", "eliminá", "descargá", "subí", "iniciá", "probá", "usá",
  "consultá", "contactá", "enviá", "volvé", "continuá", "accedé", "conectá",
  "administrá", "gestioná", "mantené", "obtené", "permití", "definí", "registrá",
  "recordá", "buscá", "cargá", "actualizá", "cambiá", "copiá", "pegá", "añadí",
  "arrastrá", "mostrá", "cerrá", "sumá", "comprá", "contratá", "solicitá",
  "programá", "publicá", "asigná", "indicá", "mirá", "dejá", "seguí", "decidí",
  "recibí", "descubrí", "conocé", "resolvé", "intentá", "empezá", "gestionás",
  "necesitás", "crecés", "cargalos", "cargalas",
  "creás", "cargás", "probás", "usás", "escribís", "hacés", "marcás",
  "entrás", "conservás", "configurás", "agregás", "dejás",
  "sos", "vení", "andá", "decime", "avisame", "fijate", "poné", "sacá",
  "mandá", "abrí", "salí", "acá",
].filter((term) => !ALLOWED_PRODUCT_TERMS.has(term));

const VOSEO_PATTERN = new RegExp(`\\b(?:${VOSEO_FORMS.join("|")})\\b`, "giu");
const REGIONALISMS_PATTERN = /\b(?:legajo|legajos)\b/giu;

function toRelative(filePath) {
  return path.relative(ROOT, filePath);
}

function isExcluded(relativePath) {
  const segments = relativePath.split(path.sep);
  const fileName = segments.at(-1) ?? "";

  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) return true;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(fileName)) return true;
  if (/\.(?:fixture|fixtures|mock|mocks)\.[cm]?[jt]sx?$/.test(fileName)) return true;
  if (fileName.endsWith(".d.ts") || fileName === "database.types.ts") return true;
  return EXCLUDED_PREFIXES.some(
    (prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}${path.sep}`),
  );
}

function isUserVisibleSource(relativePath) {
  return USER_VISIBLE_ROOTS.some(
    (root) => relativePath === root || relativePath.startsWith(`${root}${path.sep}`),
  );
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function literalText(node) {
  if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) return node.text;
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text;
  return null;
}

function localeArgument(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    if (/^toLocale(?:String|DateString|TimeString)$/.test(node.expression.name.text)) {
      return node.arguments[0];
    }
  }

  if (!ts.isNewExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== "Intl") return null;
  if (!/^(?:DateTime|Number|RelativeTime|List|DisplayNames)Format$/.test(node.expression.name.text)) return null;
  return node.arguments?.[0] ?? null;
}

function containsLocaleLiteral(node, locale) {
  if (!node) return false;
  if (ts.isStringLiteralLike(node) && node.text === locale) return true;
  return node.getChildren().some((child) => containsLocaleLiteral(child, locale));
}

function scanFile(filePath, sourceText) {
  const relativePath = toRelative(filePath);
  const scriptKind = filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const findings = [];
  const seen = new Set();

  function addFinding(node, rule, detail) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const key = `${position.line}:${position.character}:${rule}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(`${relativePath}:${position.line + 1}:${position.character + 1} [${rule}] ${detail}`);
  }

  function visit(node) {
    const text = literalText(node);
    if (text !== null) {
      VOSEO_PATTERN.lastIndex = 0;
      const voseoMatches = [...text.matchAll(VOSEO_PATTERN)].map((match) => match[0]);
      const uniqueVoseoForms = [...new Set(voseoMatches.map((match) => match.toLocaleLowerCase()))];
      if (uniqueVoseoForms.length > 0) {
        addFinding(node, "voseo", `formas no neutrales: ${uniqueVoseoForms.map((form) => `"${form}"`).join(", ")}`);
      }
      REGIONALISMS_PATTERN.lastIndex = 0;
      const regionalisms = [...text.matchAll(REGIONALISMS_PATTERN)].map((match) => match[0]);
      if (regionalisms.length > 0) {
        addFinding(node, "regionalism", `regionalismos no mexicanos: ${[...new Set(regionalisms)].map((form) => `"${form}"`).join(", ")}`);
      }
      if (/(^|\D)\+54(?:\D|$)/.test(text)) {
        addFinding(node, "phone-example", "ejemplo visible con código argentino +54");
      }
      if (/\bes-AR\b/.test(text)) addFinding(node, "locale-es-ar", "usa es-AR; usa es-MX");
    }

    const locale = localeArgument(node);
    if (containsLocaleLiteral(locale, "es-US")) {
      addFinding(locale, "locale-es-us", "usa es-US para contenido en español");
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

async function main() {
  const allFiles = [
    ...await collectSourceFiles(SRC_ROOT),
    ...await collectSourceFiles(PUBLIC_ROOT),
  ];
  const targetFiles = allFiles.filter((filePath) => {
    const relativePath = toRelative(filePath);
    return isUserVisibleSource(relativePath) && !isExcluded(relativePath);
  });
  const findings = [];

  for (const filePath of targetFiles) {
    findings.push(...scanFile(filePath, await readFile(filePath, "utf8")));
  }

  if (findings.length > 0) {
    console.error("\nSpanish copy guard: se detectaron regresiones regionales.\n");
    for (const finding of findings.sort()) console.error(`- ${finding}`);
    const countFor = (rule) => findings.filter((finding) => finding.includes(`[${rule}]`)).length;
    console.error(
      `\nTotal: ${findings.length} `
      + `(voseo: ${countFor("voseo")}, es-AR: ${countFor("locale-es-ar")}, `
      + `es-US: ${countFor("locale-es-us")}, regionalismos: ${countFor("regionalism")}, `
      + `+54: ${countFor("phone-example")}).`,
    );
    console.error("\nUsa español mexicano. locación, locaciones y email están permitidos.\n");
    process.exitCode = 1;
    return;
  }

  console.log("Spanish copy guard OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

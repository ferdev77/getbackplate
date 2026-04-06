import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..");
const localMigrationsDir = path.resolve(repoRoot, "supabase", "migrations");
const productionEnvTmpPath = path.resolve(webRoot, ".env.production.verify.tmp");

function parseEnvFile(content) {
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function listLocalMigrationVersions() {
  if (!existsSync(localMigrationsDir)) {
    throw new Error(`No existe carpeta de migraciones local: ${localMigrationsDir}`);
  }

  return readdirSync(localMigrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .map((fileName) => fileName.split("_")[0])
    .sort();
}

function parseLinkedRemoteVersions(supabaseOutput) {
  const versions = [];
  const lines = supabaseOutput.split(/\r?\n/);

  for (const rawLine of lines) {
    if (!rawLine.includes("|")) continue;

    const [local, remote] = rawLine.split("|").map((part) => part.trim());

    if (!local || !remote) continue;
    if (local.toLowerCase() === "local" || local.startsWith("-")) continue;

    versions.push(remote);
  }

  return Array.from(new Set(versions)).sort();
}

function getLinkedProjectMigrationVersions() {
  const output = execSync("npx supabase migration list --linked", {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const versions = parseLinkedRemoteVersions(output);
  if (versions.length === 0) {
    throw new Error("No se pudieron leer migraciones remotas del proyecto linkeado (dev). Verifica login/link de Supabase CLI.");
  }
  return versions;
}

function getProductionMigrationVersions() {
  execSync(`vercel env pull "${productionEnvTmpPath}" --environment=production`, {
    cwd: webRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const envContent = readFileSync(productionEnvTmpPath, "utf8");
  const env = parseEnvFile(envContent);
  const connectionString = env.SUPABASE_DB_POOLER_URL;

  if (!connectionString) {
    throw new Error("No se encontro SUPABASE_DB_POOLER_URL en variables de production.");
  }

  return new Promise((resolve, reject) => {
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });

    client
      .connect()
      .then(() => client.query("select version from supabase_migrations.schema_migrations order by version"))
      .then((result) => result.rows.map((row) => String(row.version)).sort())
      .then(async (versions) => {
        await client.end();
        resolve(versions);
      })
      .catch(async (error) => {
        try {
          await client.end();
        } catch {
          // no-op
        }
        reject(error);
      });
  });
}

function diffVersions(localVersions, remoteVersions) {
  const localSet = new Set(localVersions);
  const remoteSet = new Set(remoteVersions);

  return {
    localCount: localVersions.length,
    remoteCount: remoteVersions.length,
    missing: localVersions.filter((version) => !remoteSet.has(version)),
    extra: remoteVersions.filter((version) => !localSet.has(version)),
  };
}

function printResult(label, result) {
  console.log(`\n${label}`);
  console.log(`- local:  ${result.localCount}`);
  console.log(`- remote: ${result.remoteCount}`);
  console.log(`- missing: ${result.missing.length ? result.missing.join(", ") : "none"}`);
  console.log(`- extra:   ${result.extra.length ? result.extra.join(", ") : "none"}`);
}

async function main() {
  const localVersions = listLocalMigrationVersions();
  let devVersions = [];
  let prodVersions = [];

  try {
    devVersions = getLinkedProjectMigrationVersions();
    prodVersions = await getProductionMigrationVersions();
  } finally {
    rmSync(productionEnvTmpPath, { force: true });
  }

  const devResult = diffVersions(localVersions, devVersions);
  const prodResult = diffVersions(localVersions, prodVersions);

  printResult("DEV (Supabase linked project)", devResult);
  printResult("PROD (Vercel production env + SQL)", prodResult);

  const hasDrift =
    devResult.missing.length > 0 ||
    devResult.extra.length > 0 ||
    prodResult.missing.length > 0 ||
    prodResult.extra.length > 0;

  if (hasDrift) {
    console.error("\nResultado: DRIFT detectado.");
    process.exit(1);
  }

  console.log("\nResultado: OK. Dev y Prod estan alineadas con supabase/migrations.");
}

main().catch((error) => {
  console.error("ERROR verify-migrations-sync:", error.message);
  rmSync(productionEnvTmpPath, { force: true });
  process.exit(1);
});

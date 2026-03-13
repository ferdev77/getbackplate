import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

const ORGANIZATIONS_ACTIONS_FILE = path.join(
  process.cwd(),
  "src",
  "modules",
  "organizations",
  "actions.ts",
);

async function verifyGuardCallPresence() {
  const source = await fs.readFile(ORGANIZATIONS_ACTIONS_FILE, "utf8");
  const hasSwitchGuard = source.includes("assertOrganizationCanSwitchToPlan(");

  if (!hasSwitchGuard) {
    throw new Error("Falta guardia de downgrade/upgrade seguro en organizations/actions.ts");
  }
}

function violates(limit, value) {
  if (limit == null || Number(limit) <= 0) return false;
  return Number(value ?? 0) > Number(limit);
}

async function evaluateImpact(client) {
  const { rows: plans } = await client.query(
    `select id, code, name, max_branches, max_users, max_employees, max_storage_mb from public.plans where is_active = true`,
  );

  const { rows: orgs } = await client.query(`
    select
      o.id as organization_id,
      o.name as organization_name,
      o.plan_id,
      coalesce((select count(*) from public.branches b where b.organization_id = o.id), 0)::int as branches,
      coalesce((select count(*) from public.memberships m where m.organization_id = o.id and m.status in ('active', 'invited')), 0)::int as users,
      coalesce((select count(*) from public.employees e where e.organization_id = o.id), 0)::int as employees,
      coalesce((select sum(d.file_size_bytes) from public.documents d where d.organization_id = o.id), 0)::bigint as storage_bytes
    from public.organizations o
  `);

  const rows = [];
  for (const org of orgs) {
    for (const plan of plans) {
      const storageMb = Number(org.storage_bytes ?? 0) / (1024 * 1024);
      const planViolations = [];

      if (violates(plan.max_branches, org.branches)) {
        planViolations.push(`branches ${org.branches}/${plan.max_branches}`);
      }
      if (violates(plan.max_users, org.users)) {
        planViolations.push(`users ${org.users}/${plan.max_users}`);
      }
      if (violates(plan.max_employees, org.employees)) {
        planViolations.push(`employees ${org.employees}/${plan.max_employees}`);
      }
      if (violates(plan.max_storage_mb, storageMb)) {
        planViolations.push(`storage ${storageMb.toFixed(2)}MB/${plan.max_storage_mb}MB`);
      }

      rows.push({
        organization_id: org.organization_id,
        organization_name: org.organization_name,
        target_plan: `${plan.code} (${plan.name})`,
        would_block: planViolations.length > 0,
        reasons: planViolations.join("; "),
      });
    }
  }

  return rows;
}

async function main() {
  await verifyGuardCallPresence();

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const rows = await evaluateImpact(client);
    const blocked = rows.filter((row) => row.would_block);

    console.table([
      {
        total_org_plan_pairs: rows.length,
        blocked_pairs: blocked.length,
        allowed_pairs: rows.length - blocked.length,
      },
    ]);

    if (blocked.length > 0) {
      console.log("Ejemplos de cambios bloqueados por consistencia (max 20):");
      console.table(blocked.slice(0, 20));
    }

    console.log("OK: reglas de cambio de plan verificadas (guardia + evaluacion de impacto).");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR verify-plan-change-rules:", error.message);
  process.exit(1);
});

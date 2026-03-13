import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

function parseArgs(argv) {
  const formatArg = argv.find((arg) => arg.startsWith("--format="));
  const format = formatArg ? formatArg.split("=")[1] : "table";
  if (!["table", "json", "csv"].includes(format)) {
    throw new Error("Formato invalido. Usa --format=table|json|csv");
  }
  return { format };
}

function percent(used, limit) {
  if (limit == null || Number(limit) <= 0) return null;
  return Number(((Number(used ?? 0) / Number(limit)) * 100).toFixed(2));
}

function riskLabel(row) {
  const pcts = [
    row.branches_usage_pct,
    row.users_usage_pct,
    row.employees_usage_pct,
    row.storage_usage_pct,
  ].filter((value) => value != null);

  const maxPct = pcts.length ? Math.max(...pcts) : 0;
  if (maxPct >= 100) return "critical";
  if (maxPct >= 90) return "high";
  if (maxPct >= 75) return "medium";
  return "low";
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map((header) => {
      const raw = row[header] == null ? "" : String(row[header]);
      if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
        return `"${raw.replace(/\"/g, "\"\"")}"`;
      }
      return raw;
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

async function loadReportRows(client) {
  const { rows } = await client.query(`
    with plan_info as (
      select id, code, name
      from public.plans
    ),
    limits as (
      select organization_id, max_branches, max_users, max_employees, max_storage_mb
      from public.organization_limits
    ),
    usage_branches as (
      select organization_id, count(*)::int as branches_used
      from public.branches
      where is_active = true
      group by organization_id
    ),
    usage_users as (
      select organization_id, count(*)::int as users_used
      from public.memberships
      where status in ('active', 'invited')
      group by organization_id
    ),
    usage_employees as (
      select organization_id, count(*)::int as employees_used
      from public.employees
      where status = 'active'
      group by organization_id
    ),
    usage_storage as (
      select organization_id, coalesce(sum(file_size_bytes), 0)::bigint as storage_bytes_used
      from public.documents
      group by organization_id
    ),
    usage_modules as (
      select organization_id, count(*)::int as modules_enabled
      from public.organization_modules
      where is_enabled = true
      group by organization_id
    ),
    last_activity as (
      select organization_id, max(created_at) as last_audit_event_at
      from public.audit_logs
      group by organization_id
    )
    select
      o.id as organization_id,
      o.name as organization_name,
      o.status,
      p.code as plan_code,
      p.name as plan_name,
      l.max_branches,
      l.max_users,
      l.max_employees,
      l.max_storage_mb,
      coalesce(ub.branches_used, 0)::int as branches_used,
      coalesce(uu.users_used, 0)::int as users_used,
      coalesce(ue.employees_used, 0)::int as employees_used,
      round(coalesce(us.storage_bytes_used, 0)::numeric / (1024 * 1024), 2) as storage_mb_used,
      coalesce(um.modules_enabled, 0)::int as modules_enabled,
      la.last_audit_event_at
    from public.organizations o
    left join plan_info p on p.id = o.plan_id
    left join limits l on l.organization_id = o.id
    left join usage_branches ub on ub.organization_id = o.id
    left join usage_users uu on uu.organization_id = o.id
    left join usage_employees ue on ue.organization_id = o.id
    left join usage_storage us on us.organization_id = o.id
    left join usage_modules um on um.organization_id = o.id
    left join last_activity la on la.organization_id = o.id
    order by o.created_at desc
  `);

  return rows.map((row) => {
    const enriched = {
      organization_id: row.organization_id,
      organization_name: row.organization_name,
      status: row.status,
      plan_code: row.plan_code ?? null,
      plan_name: row.plan_name ?? null,
      branches_used: Number(row.branches_used ?? 0),
      max_branches: row.max_branches == null ? null : Number(row.max_branches),
      branches_usage_pct: percent(row.branches_used, row.max_branches),
      users_used: Number(row.users_used ?? 0),
      max_users: row.max_users == null ? null : Number(row.max_users),
      users_usage_pct: percent(row.users_used, row.max_users),
      employees_used: Number(row.employees_used ?? 0),
      max_employees: row.max_employees == null ? null : Number(row.max_employees),
      employees_usage_pct: percent(row.employees_used, row.max_employees),
      storage_mb_used: Number(row.storage_mb_used ?? 0),
      max_storage_mb: row.max_storage_mb == null ? null : Number(row.max_storage_mb),
      storage_usage_pct: percent(row.storage_mb_used, row.max_storage_mb),
      modules_enabled: Number(row.modules_enabled ?? 0),
      last_audit_event_at: row.last_audit_event_at,
    };

    return {
      ...enriched,
      support_risk: riskLabel(enriched),
    };
  });
}

async function main() {
  const { format } = parseArgs(process.argv.slice(2));

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const rows = await loadReportRows(client);

    const summary = {
      tenants: rows.length,
      active_tenants: rows.filter((row) => row.status === "active").length,
      high_or_critical_risk: rows.filter((row) => row.support_risk === "high" || row.support_risk === "critical").length,
    };

    if (format === "json") {
      console.log(JSON.stringify({ summary, rows }, null, 2));
      return;
    }

    if (format === "csv") {
      console.log(toCsv(rows));
      return;
    }

    console.table([summary]);
    console.table(rows);
    console.log("OK: reporte de uso por tenant generado para soporte comercial.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR generate-tenant-usage-report:", error.message);
  process.exit(1);
});

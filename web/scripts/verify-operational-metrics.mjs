import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;
const WINDOW_DAYS = Number(process.env.METRICS_WINDOW_DAYS ?? "7");

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

function safeDays(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 7;
  }
  return Math.floor(value);
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const days = safeDays(WINDOW_DAYS);

    const { rows: summaryRows } = await client.query(
      `
      with base as (
        select action, metadata
        from public.audit_logs
        where created_at >= now() - make_interval(days => $1::int)
      )
      select
        count(*)::int as total_events,
        count(*) filter (where lower(coalesce(metadata->>'outcome', '')) = 'denied')::int as denied_events,
        count(*) filter (where lower(coalesce(metadata->>'outcome', '')) = 'error')::int as error_events,
        count(*) filter (where action = 'login.failed')::int as failed_auth_events,
        count(*) filter (where action like 'access.denied.%')::int as security_denied_events,
        count(*) filter (
          where action like 'organization.%'
             or action like 'plan.%'
             or action like 'module.%'
        )::int as superadmin_mutation_events
      from base
      `,
      [days],
    );

    const { rows: adoptionRows } = await client.query(`
      with active_orgs as (
        select id
        from public.organizations
        where status = 'active'
      ), enabled as (
        select organization_id
        from public.organization_modules
        where is_enabled = true
      )
      select
        (select count(*)::int from active_orgs) as active_organizations,
        (select count(distinct organization_id)::int from enabled) as organizations_with_any_module,
        (select count(*)::int from enabled) as total_enabled_module_rows
    `);

    const summary = summaryRows[0] ?? {};
    const adoption = adoptionRows[0] ?? {};

    const activeOrganizations = Number(adoption.active_organizations ?? 0);
    const organizationsWithAnyModule = Number(adoption.organizations_with_any_module ?? 0);
    const totalEnabledModuleRows = Number(adoption.total_enabled_module_rows ?? 0);

    const moduleAdoptionRatePct =
      activeOrganizations > 0
        ? Number(((organizationsWithAnyModule / activeOrganizations) * 100).toFixed(2))
        : 0;
    const avgEnabledModulesPerOrg =
      activeOrganizations > 0
        ? Number((totalEnabledModuleRows / activeOrganizations).toFixed(2))
        : 0;

    console.log(`Ventana de metricas: ${days} dias`);
    console.table([
      {
        total_events: Number(summary.total_events ?? 0),
        denied_events: Number(summary.denied_events ?? 0),
        error_events: Number(summary.error_events ?? 0),
        failed_auth_events: Number(summary.failed_auth_events ?? 0),
        security_denied_events: Number(summary.security_denied_events ?? 0),
        superadmin_mutation_events: Number(summary.superadmin_mutation_events ?? 0),
        active_organizations: activeOrganizations,
        organizations_with_any_module: organizationsWithAnyModule,
        module_adoption_rate_pct: moduleAdoptionRatePct,
        avg_enabled_modules_per_org: avgEnabledModulesPerOrg,
      },
    ]);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR verify-operational-metrics:", error.message);
  process.exit(1);
});

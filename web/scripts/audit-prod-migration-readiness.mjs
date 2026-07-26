import { readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const EXPECTED_PROJECT_REF = "mfhyemwypuzsqjqxtbjf";
const DEVELOPMENT_PROJECT_REF = "uubdslmtfxwraszinpao";
const EXPECTED_MISSING = [
  "20260726000003",
  "20260726000004",
  "20260726000005",
  "20260726000006",
  "20260726000007",
  "20260726000008",
];
const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (!databaseUrl.includes(EXPECTED_PROJECT_REF) || !apiUrl.includes(EXPECTED_PROJECT_REF)) {
  throw new Error("Production audit refused: expected production project");
}
if (databaseUrl.includes(DEVELOPMENT_PROJECT_REF) || apiUrl.includes(DEVELOPMENT_PROJECT_REF)) {
  throw new Error("Production audit refused: development project detected");
}

const files = await readdir(path.resolve("..", "supabase", "migrations"));
const localVersions = files.filter((name) => name.endsWith(".sql")).map((name) => name.split("_")[0]).sort();
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  await client.query("begin transaction read only");
  await client.query("set local statement_timeout = '30s'");

  const { rows: migrationRows } = await client.query(
    "select version::text from supabase_migrations.schema_migrations order by version",
  );
  const remoteSet = new Set(migrationRows.map((row) => row.version));
  const missing = localVersions.filter((version) => !remoteSet.has(version));
  const isPreDeploy = JSON.stringify(missing) === JSON.stringify(EXPECTED_MISSING);
  const isPostDeploy = missing.length === 0;
  if (!isPreDeploy && !isPostDeploy) {
    throw new Error(`Unexpected production migration drift: ${missing.join(", ") || "none"}`);
  }

  const { rows: requiredColumns } = await client.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and (table_name, column_name) in (
      ('employees', 'location_scope_ids'),
      ('employees', 'all_locations'),
      ('memberships', 'location_scope_ids'),
      ('memberships', 'all_locations'),
      ('employee_module_permissions', 'can_view'),
      ('documents', 'access_scope'),
      ('documents', 'folder_id')
    )
  `);
  if (requiredColumns.length !== 7) {
    throw new Error(`Production schema is missing required columns (${requiredColumns.length}/7 found)`);
  }

  const { rows: stats } = await client.query(`
    select
      (select count(*)::int from public.organizations) as organizations,
      (select count(*)::int from public.employees) as employees,
      (select count(*)::int from public.employee_contracts) as contracts,
      (select count(*)::int from public.documents) as documents,
      (select count(*)::int from public.employee_module_permissions
        where module_code = 'employees' and can_view) as delegated_hr_view,
      (select count(*)::int from public.integration_connections
        where status = 'connected') as connected_integrations,
      (select count(*)::int from public.integration_connections
        where provider = 'quickbooks_online' and status = 'connected') as connected_qbo_integrations
  `);
  const { rows: rls } = await client.query(`
    select count(*) filter (where not class.relrowsecurity)::int as disabled
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and class.relkind = 'r'
  `);
  if (rls[0].disabled !== 0) {
    throw new Error(`${rls[0].disabled} public tables have RLS disabled`);
  }
  const { rows: functions } = await client.query(`
    select
      signature,
      to_regprocedure(signature) is not null as present,
      case when to_regprocedure(signature) is null then null
        else has_function_privilege('anon', to_regprocedure(signature), 'execute') end as anon_execute,
      case when to_regprocedure(signature) is null then null
        else has_function_privilege('authenticated', to_regprocedure(signature), 'execute') end as authenticated_execute,
      case when to_regprocedure(signature) is null then null
        else has_function_privilege('service_role', to_regprocedure(signature), 'execute') end as service_execute
    from unnest(array[
      'public.increment_invoice_balance(uuid,integer)',
      'public.increment_r365_slots(uuid,integer)',
      'public.apply_r365_connection_purchase(uuid)',
      'public.cleanup_ai_assistant_data(integer,integer,integer)',
      'public.get_user_id_by_email(text)',
      'public.create_employee_transaction(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamp with time zone,date,text,text,text,text,text,text,text,text,text,text,text,boolean,uuid,text,text,text,date,date,numeric,text,text,text,text,timestamp with time zone,jsonb)',
      'public.submit_checklist_transaction(uuid,uuid,uuid,uuid,uuid,jsonb,timestamp with time zone)'
    ]) signature
  `);
  if (isPostDeploy) {
    const privileged = functions.filter((fn) => fn.present && fn.signature !== "public.get_company_users(uuid)");
    if (privileged.some((fn) => fn.anon_execute || fn.authenticated_execute || !fn.service_execute)) {
      throw new Error("Unexpected post-deploy grants on privileged functions");
    }
    const { rows: policies } = await client.query(`
      select policyname
      from pg_policies
      where schemaname = 'public'
        and policyname in ('employees_tenant_select', 'employee_contracts_tenant_select', 'documents_tenant_select')
    `);
    if (policies.length !== 3) {
      throw new Error(`Expected 3 hardened policies, found ${policies.length}`);
    }
  }

  console.log(JSON.stringify({
    projectRef: EXPECTED_PROJECT_REF,
    migrations: { local: localVersions.length, production: migrationRows.length, missing },
    requiredColumns: "7/7",
    rlsDisabledTables: rls[0].disabled,
    impactCounts: stats[0],
    privilegedFunctions: functions,
    stage: isPostDeploy ? "post-deploy" : "pre-deploy",
    readiness: "PASS",
  }, null, 2));
  await client.query("rollback");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.split("=");
    return [key, value ?? "true"];
  }),
);

const organizationId = args.get("--org") || "";
const apply = args.get("--apply") === "true";

if (!organizationId) {
  console.error("Uso: node scripts/backfill-orphan-employee-memberships.mjs --org=<organization_id> [--apply=true]");
  process.exit(1);
}

const connectionString = process.env.SUPABASE_DB_POOLER_URL;
if (!connectionString) {
  console.error("Falta SUPABASE_DB_POOLER_URL en entorno.");
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const orphanSql = `
  select m.organization_id, m.user_id, coalesce(u.email, '') as email
  from public.memberships m
  join public.roles r on r.id = m.role_id and r.code = 'employee'
  left join auth.users u on u.id = m.user_id
  where m.organization_id = $1
    and m.status = 'active'
    and not exists (
      select 1
      from public.employees e
      where e.organization_id = m.organization_id
        and e.user_id = m.user_id
    )
    and not exists (
      select 1
      from public.organization_user_profiles p
      where p.organization_id = m.organization_id
        and p.user_id = m.user_id
    )
`;

const insertSql = `
  insert into public.organization_user_profiles (
    organization_id,
    user_id,
    first_name,
    last_name,
    email,
    is_employee,
    status,
    source
  )
  select
    m.organization_id,
    m.user_id,
    coalesce(nullif(split_part(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), ' ', 1), ''), 'Usuario') as first_name,
    '' as last_name,
    coalesce(u.email, null) as email,
    false as is_employee,
    'active' as status,
    'backfill' as source
  from public.memberships m
  join public.roles r on r.id = m.role_id and r.code = 'employee'
  left join auth.users u on u.id = m.user_id
  where m.organization_id = $1
    and m.status = 'active'
    and not exists (
      select 1
      from public.employees e
      where e.organization_id = m.organization_id
        and e.user_id = m.user_id
    )
    and not exists (
      select 1
      from public.organization_user_profiles p
      where p.organization_id = m.organization_id
        and p.user_id = m.user_id
    )
  on conflict (organization_id, user_id)
  do nothing
`;

try {
  await client.connect();
  const preview = await client.query(orphanSql, [organizationId]);
  console.log(`Orphans detectados: ${preview.rowCount}`);
  console.log(JSON.stringify(preview.rows.slice(0, 30), null, 2));

  if (!apply) {
    console.log("Dry-run: no se aplicaron cambios. Usa --apply=true para ejecutar.");
    process.exit(0);
  }

  await client.query("begin");
  const result = await client.query(insertSql, [organizationId]);
  await client.query("commit");
  console.log(`Backfill aplicado. Filas insertadas: ${result.rowCount}`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  console.error("Error en backfill:", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end();
}

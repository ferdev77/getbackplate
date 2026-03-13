import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEnvValue(content, key) {
  const prefix = `${key}=`;
  const line = content.split(/\r?\n/).find((row) => row.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

async function main() {
  const env = await readFile(path.resolve(__dirname, "../.env.local"), "utf8");
  const connectionString = process.env.SUPABASE_DB_POOLER_URL || getEnvValue(env, "SUPABASE_DB_POOLER_URL");
  if (!connectionString) throw new Error("SUPABASE_DB_POOLER_URL no encontrado");

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const sql = `
    with org as (
      select id, name, status
      from public.organizations
    ), role_admin as (
      select id
      from public.roles
      where code = 'company_admin'
      limit 1
    ), members as (
      select organization_id, count(*) filter (where status = 'active') as active_members
      from public.memberships
      group by organization_id
    ), admins as (
      select m.organization_id, count(*) as active_admins
      from public.memberships m
      join role_admin r on r.id = m.role_id
      where m.status = 'active'
      group by m.organization_id
    ), employees as (
      select organization_id, count(*) filter (where status = 'active') as active_employees
      from public.employees
      group by organization_id
    ), mods as (
      select organization_id, count(*) filter (where is_enabled = true) as enabled_modules
      from public.organization_modules
      group by organization_id
    ), docs as (
      select organization_id, count(*) as docs_30d
      from public.documents
      where created_at >= now() - interval '30 days'
      group by organization_id
    ), chk as (
      select organization_id, count(*) as checklist_7d
      from public.checklist_submissions
      where created_at >= now() - interval '7 days'
      group by organization_id
    ), anns as (
      select organization_id, count(*) as active_announcements
      from public.announcements
      where (publish_at is null or publish_at <= now())
        and (expires_at is null or expires_at >= now())
      group by organization_id
    )
    select
      o.name,
      o.status,
      coalesce(a.active_admins, 0) as admins,
      coalesce(m.active_members, 0) as members,
      coalesce(e.active_employees, 0) as employees,
      coalesce(md.enabled_modules, 0) as modules,
      coalesce(d.docs_30d, 0) as docs30d,
      coalesce(c.checklist_7d, 0) as checklist7d,
      coalesce(an.active_announcements, 0) as announcements
    from org o
    left join admins a on a.organization_id = o.id
    left join members m on m.organization_id = o.id
    left join employees e on e.organization_id = o.id
    left join mods md on md.organization_id = o.id
    left join docs d on d.organization_id = o.id
    left join chk c on c.organization_id = o.id
    left join anns an on an.organization_id = o.id
    order by o.name
  `;

  const { rows } = await client.query(sql);
  console.table(rows);

  await client.end();
}

main().catch((error) => {
  console.error("ERROR verify-superadmin-radar:", error.message);
  process.exit(1);
});

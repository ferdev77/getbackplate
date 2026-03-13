import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env.local");

function getEnvValue(content, key) {
  const prefix = `${key}=`;
  const line = content.split(/\r?\n/).find((row) => row.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

async function main() {
  const envText = await readFile(envPath, "utf8");
  const connectionString = process.env.SUPABASE_DB_POOLER_URL || getEnvValue(envText, "SUPABASE_DB_POOLER_URL");
  if (!connectionString) throw new Error("SUPABASE_DB_POOLER_URL no encontrado");

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const organizationRes = await client.query(
    "select id, name from public.organizations where lower(name) like '%burger%king%' or lower(name) like '%burguer%king%' order by created_at desc limit 1",
  );
  const organization = organizationRes.rows[0];
  if (!organization) throw new Error("No encontre organizacion Burger King");

  const announcementRes = await client.query(
    `select id, title, target_scope, publish_at, expires_at
     from public.announcements
     where organization_id = $1
     order by coalesce(publish_at, created_at) desc
     limit 1`,
    [organization.id],
  );
  const announcement = announcementRes.rows[0];
  if (!announcement) throw new Error("No hay anuncios para Burger King");

  const rowsRes = await client.query(
    `with emp as (
       select e.user_id, e.first_name, e.last_name, e.department_id, e.position
       from public.employees e
       where e.organization_id = $1 and e.user_id is not null
     ), mem as (
       select m.user_id, m.branch_id
       from public.memberships m
       where m.organization_id = $1 and m.status = 'active'
     ), pos as (
       select e.user_id,
              coalesce(array_agg(dp.id::text) filter (where dp.id is not null), '{}'::text[]) as position_ids
       from emp e
       left join public.department_positions dp
         on dp.organization_id = $1
        and dp.is_active = true
        and lower(trim(dp.name)) = lower(trim(coalesce(e.position, '')))
        and (e.department_id is null or dp.department_id = e.department_id)
       group by e.user_id
     ), aud as (
       select aa.user_id, aa.branch_id
       from public.announcement_audiences aa
       where aa.organization_id = $1 and aa.announcement_id = $2
     ), aud_any as (
       select exists(select 1 from aud) as has_any
     )
     select emp.first_name,
            emp.last_name,
            emp.position,
            mem.branch_id,
            emp.department_id,
            pos.position_ids,
            case
              when not (select has_any from aud_any) then true
              else exists(
                select 1 from aud
                where aud.user_id = emp.user_id
                   or (aud.user_id is null and aud.branch_id is null)
                   or (aud.user_id is null and aud.branch_id is not null and mem.branch_id is not null and aud.branch_id = mem.branch_id)
              )
            end as audience_ok,
            public.announcement_scope_match($3::jsonb, emp.user_id, mem.branch_id, emp.department_id, pos.position_ids) as scope_ok
     from emp
     left join mem on mem.user_id = emp.user_id
     left join pos on pos.user_id = emp.user_id
     order by emp.first_name, emp.last_name`,
    [organization.id, announcement.id, JSON.stringify(announcement.target_scope ?? {})],
  );

  console.log("ORG:", organization.name);
  console.log("ANN:", announcement.title, announcement.id);
  console.log("SCOPE:", announcement.target_scope);
  console.table(
    rowsRes.rows.map((row) => ({
      empleado: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
      puesto: row.position ?? "-",
      audience_ok: row.audience_ok,
      scope_ok: row.scope_ok,
      visible: row.audience_ok && row.scope_ok,
    })),
  );

  await client.end();
}

main().catch((error) => {
  console.error("ERROR debug-announcement-visibility:", error.message);
  process.exit(1);
});

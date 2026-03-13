import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const { rows: employees } = await client.query(`
      select distinct
        m.organization_id,
        o.name as organization_name,
        m.user_id,
        u.email
      from public.memberships m
      join public.roles r
        on r.id = m.role_id
      join public.organizations o
        on o.id = m.organization_id
      left join auth.users u
        on u.id = m.user_id
      where m.status = 'active'
        and r.code = 'employee'
      order by o.name, u.email nulls last
    `);

    if (!employees.length) {
      console.log("No se encontraron usuarios con rol employee.");
      return;
    }

    await client.query("begin");

    for (const row of employees) {
      await client.query(
        `
          insert into public.user_preferences (user_id, organization_id, onboarding_seen_at)
          values ($1::uuid, $2::uuid, null)
          on conflict (user_id)
          do update set
            organization_id = excluded.organization_id,
            onboarding_seen_at = null
        `,
        [row.user_id, row.organization_id],
      );
    }

    await client.query("commit");

    const byOrg = new Map();
    for (const row of employees) {
      const list = byOrg.get(row.organization_name) ?? [];
      list.push({ email: row.email ?? row.user_id, userId: row.user_id });
      byOrg.set(row.organization_name, list);
    }

    console.log("OK: onboarding_seen_at reseteado para empleados activos.");
    for (const [orgName, users] of byOrg.entries()) {
      console.log(`- ${orgName} (${users.length})`);
      for (const user of users) {
        console.log(`  • ${user.email} (${user.userId})`);
      }
    }
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // ignore rollback error
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR reset-onboarding-seen-for-employees:", error.message);
  process.exit(1);
});

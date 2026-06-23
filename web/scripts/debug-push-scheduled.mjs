import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;
if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const now = await client.query("select now() as server_now");
    console.log("server now (UTC):", now.rows[0].server_now);

    const scheduled = await client.query(`
      select id, created_at, created_by, title, target_type, target_all, org_ids, user_ids, scheduled_at, status, sent, expired, failed
      from push_scheduled_sends
      order by created_at desc
      limit 10
    `);
    console.log("\n--- push_scheduled_sends (ultimos 10) ---");
    console.log(JSON.stringify(scheduled.rows, null, 2));

    const logs = await client.query(`
      select id, created_at, sent_by, title, target_type, org_ids, orgs_count, user_ids, user_count, sent, expired, failed
      from push_send_logs
      order by created_at desc
      limit 10
    `);
    console.log("\n--- push_send_logs (ultimos 10) ---");
    console.log(JSON.stringify(logs.rows, null, 2));

    const subs = await client.query(`
      select count(*)::int as active_count from push_subscriptions where is_active = true
    `);
    console.log("\n--- push_subscriptions activas ---");
    console.log(JSON.stringify(subs.rows[0]));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR debug-push-scheduled:", error.message);
  process.exit(1);
});

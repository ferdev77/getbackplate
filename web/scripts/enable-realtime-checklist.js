const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const sql = `
-- Enable realtime replication for checklist_submissions table
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'checklist_submissions'
  ) then
    alter publication supabase_realtime add table checklist_submissions;
  end if;
end
$$;
`;

(async () => {
  const c = new Client({
    connectionString: process.env.SUPABASE_DB_POOLER_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await c.connect();
    console.log("Connected to DB");
    await c.query(sql);
    console.log("SUCCESS: enabled realtime replication for checklist_submissions table");
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();

const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.SUPABASE_DB_POOLER_URL
});

async function main() {
  await client.connect();
  
  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  
  for (const row of tables.rows) {
    const tableName = row.table_name;
    try {
      await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE "${tableName}";`);
      console.log("Enabled realtime for:", tableName);
    } catch (err) {
      if (err.message.includes("already in publication")) {
        console.log("Already enabled realtime for:", tableName);
      } else {
        console.error("Failed to enable for:", tableName, err.message);
      }
    }
  }

  await client.end();
}

main().catch(console.error);

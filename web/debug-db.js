const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.SUPABASE_DB_POOLER_URL
});

async function main() {
  await client.connect();
  
  // Try enabling realtime
  try {
    await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE feedback_messages;`);
    console.log("Realtime enabled successfully");
  } catch (err) {
    if (err.message.includes("already in publication")) {
      console.log("Realtime already enabled");
    } else {
      console.log("Error enabling realtime:", err.message);
    }
  }

  // Check columns
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'feedback_messages'
  `);
  console.log("\nSchema columns:");
  console.log(res.rows);

  // Check data
  const dataRes = await client.query(`
    SELECT id, status, resolved_at FROM feedback_messages LIMIT 5
  `);
  console.log("\nSample data:");
  console.log(dataRes.rows);

  await client.end();
}

main().catch(console.error);

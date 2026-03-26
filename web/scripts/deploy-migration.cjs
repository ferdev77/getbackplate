// Deploy SQL migration via Supabase PostgREST
// Uses the service role key to call a raw SQL function
const fs = require('fs');
const https = require('https');

const sql = fs.readFileSync(
  'supabase/migrations/20260326010000_count_accessible_documents_rpc.sql',
  'utf8'
);

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Use the database pooler URL directly
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to database');
    const result = await client.query(sql);
    console.log('Migration deployed successfully!');
    console.log('Result:', JSON.stringify(result).substring(0, 200));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();

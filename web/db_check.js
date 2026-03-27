const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.mfhyemwypuzsqjqxtbjf:dy.7nci4Mfbfv%2Bv@aws-0-us-west-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'checklist_templates' AND column_name = 'id';
  `);
  console.log('checklist_templates.id type:', res.rows[0]);

  const funcs = await client.query(`
    SELECT pg_get_functiondef(oid) 
    FROM pg_proc 
    WHERE proname = 'submit_checklist_transaction';
  `);
  console.log('Functions found:', funcs.rows.length);
  for (const f of funcs.rows) {
      console.log('Signature:', f.pg_get_functiondef.split('RETURNS')[0]);
  }

  await client.end();
}

run().catch(console.error);

import pg from 'pg';

const { Client } = pg;

async function runMigration() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_POOLER_URL
  });

  try {
    await client.connect();
    console.log("Connected to the database. Running migration...");

    await client.query(`
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
      
      -- Add index to speed up filtering of non-deleted documents
      CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
    `);

    console.log("Documents table soft-delete columns added successfully!");
  } catch(e) {
    console.error("Migration failed:", e);
  } finally {
    await client.end();
  }
}

runMigration();

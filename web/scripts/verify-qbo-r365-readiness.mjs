import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL;
const TARGET_ORG_ID = process.env.TARGET_ORG_ID || null;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL o DATABASE_URL en el entorno.");
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const orgResult = TARGET_ORG_ID
      ? await client.query(
          "select id, name from public.organizations where id = $1 limit 1",
          [TARGET_ORG_ID],
        )
      : await client.query(
          "select id, name from public.organizations where status = 'active' order by created_at asc limit 1",
        );

    const org = orgResult.rows[0];
    if (!org) {
      throw new Error("No se encontro organizacion para verificar readiness QBO/R365.");
    }

    const tableChecks = await client.query(
      `
      select
        to_regclass('public.integration_connections') as integration_connections,
        to_regclass('public.integration_settings') as integration_settings,
        to_regclass('public.integration_runs') as integration_runs,
        to_regclass('public.integration_run_items') as integration_run_items,
        to_regclass('public.integration_outbox_files') as integration_outbox_files,
        to_regclass('public.integration_audit_logs') as integration_audit_logs
      `,
    );

    const tables = tableChecks.rows[0];
    const missingTables = Object.entries(tables)
      .filter(([, value]) => value === null)
      .map(([name]) => name);

    const settingsResult = await client.query(
      `
      select qbo_r365_template, tax_mode, timezone, file_prefix, ftp_remote_path, incremental_lookback_hours, max_retry_attempts, is_enabled
      from public.integration_settings
      where organization_id = $1
      limit 1
      `,
      [org.id],
    );

    const qboConnection = await client.query(
      `
      select status, config, (secrets_ciphertext is not null) as has_secrets
      from public.integration_connections
      where organization_id = $1 and provider = 'quickbooks_online'
      limit 1
      `,
      [org.id],
    );

    const ftpConnection = await client.query(
      `
      select status, config, (secrets_ciphertext is not null) as has_secrets
      from public.integration_connections
      where organization_id = $1 and provider = 'restaurant365_ftp'
      limit 1
      `,
      [org.id],
    );

    const qboRow = qboConnection.rows[0] ?? null;
    const ftpRow = ftpConnection.rows[0] ?? null;

    const summary = {
      organization: `${org.name} (${org.id})`,
      migration_tables_present: missingTables.length === 0,
      missing_tables: missingTables,
      env_integrations_encryption_key: Boolean(process.env.INTEGRATIONS_ENCRYPTION_KEY),
      env_qbo_oauth_state_secret: Boolean(process.env.QBO_OAUTH_STATE_SECRET),
      has_settings_row: Boolean(settingsResult.rows[0]),
      qbo_connection_configured: Boolean(qboRow),
      qbo_connection_status: qboRow?.status ?? null,
      qbo_has_secrets_blob: Boolean(qboRow?.has_secrets),
      qbo_has_global_client_id: Boolean(process.env.QBO_CLIENT_ID),
      qbo_has_global_client_secret: Boolean(process.env.QBO_CLIENT_SECRET),
      qbo_has_global_redirect_uri: Boolean(process.env.QBO_REDIRECT_URI),
      qbo_has_realm_id: Boolean(qboRow?.config?.realmId),
      r365_ftp_configured: Boolean(ftpRow),
      r365_ftp_status: ftpRow?.status ?? null,
      r365_ftp_has_secrets_blob: Boolean(ftpRow?.has_secrets),
      r365_ftp_has_host: Boolean(ftpRow?.config?.host),
      r365_ftp_has_username: Boolean(ftpRow?.config?.username),
      r365_ftp_has_remote_path: Boolean(ftpRow?.config?.remotePath),
    };

    console.table([summary]);

    if (missingTables.length > 0) {
      throw new Error(`Faltan tablas de integracion: ${missingTables.join(", ")}`);
    }

    console.log("OK: readiness base QBO/R365 verificada.");
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("ERROR verify-qbo-r365-readiness:", error.message);
  process.exit(1);
});

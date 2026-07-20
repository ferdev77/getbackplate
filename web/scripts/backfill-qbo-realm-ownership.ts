import pg from "pg";
import {
  decryptJsonPayload,
  encryptJsonPayload,
  hashQboRealmId,
} from "../src/modules/integrations/qbo-r365/crypto";
import type { QboStoredSecrets } from "../src/modules/integrations/qbo-r365/types";

const { Client } = pg;
const apply = process.argv.includes("--apply");
const connectionString = process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DB_POOLER_URL or DATABASE_URL is required.");
}

type ConnectionRow = {
  id: string;
  organization_id: string;
  status: "connected" | "error" | "disconnected";
  config: Record<string, unknown> | null;
  secrets_ciphertext: string | null;
  secrets_iv: string | null;
  secrets_tag: string | null;
  updated_at: string;
};

type PlannedUpdate = {
  row: ConnectionRow;
  realmIdHash: string | null;
  config: Record<string, unknown>;
  encrypted: ReturnType<typeof encryptJsonPayload> | null;
};

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const result = await client.query<ConnectionRow>(`
      select id, organization_id, status, config,
             secrets_ciphertext, secrets_iv, secrets_tag, updated_at::text as updated_at
      from public.integration_connections
      where provider = 'quickbooks_online'
      order by organization_id
    `);

    const updates: PlannedUpdate[] = [];
    const unresolved: Array<{ organizationId: string; reason: string }> = [];
    const owners = new Map<string, { organizationId: string; connectionId: string }>();
    const duplicates: Array<{
      organizationId: string;
      connectionId: string;
      otherOrganizationId: string;
      otherConnectionId: string;
    }> = [];

    for (const row of result.rows) {
      const config = { ...(row.config ?? {}) };
      let secrets: QboStoredSecrets | null = null;
      try {
        secrets = decryptJsonPayload<QboStoredSecrets>({
          ciphertext: row.secrets_ciphertext,
          iv: row.secrets_iv,
          tag: row.secrets_tag,
        });
      } catch {
        if (row.secrets_ciphertext || typeof config.realmId === "string") {
          unresolved.push({ organizationId: row.organization_id, reason: "encrypted payload cannot be decrypted" });
        }
        continue;
      }

      const configRealmId = typeof config.realmId === "string" ? config.realmId.trim() : "";
      const realmId = secrets?.realmId?.trim() || configRealmId;
      const active = row.status === "connected" || row.status === "error";
      if (!realmId) {
        if (active) unresolved.push({ organizationId: row.organization_id, reason: "active row has no realmId" });
        continue;
      }

      const realmIdHash = hashQboRealmId(realmId);
      if (active) {
        const owner = owners.get(realmIdHash);
        if (owner) {
          duplicates.push({
            organizationId: row.organization_id,
            connectionId: row.id,
            otherOrganizationId: owner.organizationId,
            otherConnectionId: owner.connectionId,
          });
        } else {
          owners.set(realmIdHash, { organizationId: row.organization_id, connectionId: row.id });
        }
      }

      delete config.realmId;
      updates.push({
        row,
        realmIdHash: active ? realmIdHash : null,
        config,
        encrypted: encryptJsonPayload({ ...(secrets ?? {}), realmId }),
      });
    }

    console.table([{
      mode: apply ? "apply" : "dry-run",
      qboRows: result.rowCount ?? result.rows.length,
      plannedUpdates: updates.length,
      unresolved: unresolved.length,
      duplicateOwners: duplicates.length,
    }]);
    if (unresolved.length) console.table(unresolved);
    if (duplicates.length) console.table(duplicates);
    if (unresolved.length || duplicates.length) {
      throw new Error("Backfill aborted; resolve the reported QBO rows first.");
    }

    if (!apply) {
      console.log("Dry-run complete. Re-run with --apply to write changes.");
      return;
    }

    await client.query("begin");
    try {
      for (const update of updates) {
        const updateResult = await client.query(
          `update public.integration_connections
           set realm_id_hash = $2,
               config = $3::jsonb,
               secrets_ciphertext = coalesce($4, secrets_ciphertext),
               secrets_iv = coalesce($5, secrets_iv),
               secrets_tag = coalesce($6, secrets_tag)
           where id = $1
             and updated_at = $7`,
          [
            update.row.id,
            update.realmIdHash,
            JSON.stringify(update.config),
            update.encrypted?.ciphertext ?? null,
            update.encrypted?.iv ?? null,
            update.encrypted?.tag ?? null,
            update.row.updated_at,
          ],
        );
        if ((updateResult.rowCount ?? 0) !== 1) {
          throw new Error(`QBO connection changed during backfill for organization ${update.row.organization_id}`);
        }
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    console.log(`Applied realm ownership backfill to ${updates.length} QBO rows.`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("QBO realm ownership backfill failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

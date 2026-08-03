import assert from "node:assert/strict";
import pg from "pg";

const EXPECTED_PROJECT_REF = "mfhyemwypuzsqjqxtbjf";
const DEVELOPMENT_PROJECT_REF = "uubdslmtfxwraszinpao";
const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (!databaseUrl.includes(EXPECTED_PROJECT_REF) || !apiUrl.includes(EXPECTED_PROJECT_REF)) {
  throw new Error("Prodel verification refused: expected the production Supabase project");
}
if (databaseUrl.includes(DEVELOPMENT_PROJECT_REF) || apiUrl.includes(DEVELOPMENT_PROJECT_REF)) {
  throw new Error("Prodel verification refused: development project detected");
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin transaction read only");
  await client.query("set local statement_timeout = '30s'");
  const { rows } = await client.query(`
    select
      organization.id,
      organization.name,
      organization.slug,
      integration_plan.code as integration_plan_code,
      integration_plan.name as integration_plan_name,
      (select count(*)::int from public.organization_addons addon
        join public.module_catalog module on module.id = addon.module_id
        where addon.organization_id = organization.id
          and module.code = 'qbo_r365' and addon.status = 'active') as active_qbo_addons,
      (select count(*)::int from public.organization_modules organization_module
        join public.module_catalog module on module.id = organization_module.module_id
        where organization_module.organization_id = organization.id
          and module.code = 'qbo_r365' and organization_module.is_enabled = true) as enabled_qbo_modules,
      (select count(*)::int from public.integration_connections connection
        where connection.organization_id = organization.id
          and connection.provider = 'quickbooks_online' and connection.status = 'connected') as connected_qbo,
      (select count(*)::int from public.qbo_r365_sync_configs config
        where config.organization_id = organization.id and config.status = 'active') as active_sync_configs,
      (select count(*)::int from public.checklist_templates row where row.organization_id = organization.id) as checklists,
      (select count(*)::int from public.vendors row where row.organization_id = organization.id) as vendors,
      (select count(*)::int from public.documents row where row.organization_id = organization.id) as documents,
      (select count(*)::int from public.announcements row where row.organization_id = organization.id) as announcements,
      (select count(*)::int from public.announcement_deliveries row where row.organization_id = organization.id) as announcement_deliveries
    from public.organizations organization
    left join public.plans integration_plan on integration_plan.id = organization.integration_plan_id
    where lower(organization.name) like '%prodel%' or lower(organization.slug) like '%prodel%'
  `);

  assert.equal(rows.length, 1, "Expected exactly one Prodel organization");
  const snapshot = rows[0];
  assert.match(
    `${snapshot.integration_plan_code ?? ""} ${snapshot.integration_plan_name ?? ""}`,
    /connect/i,
    "Prodel must remain on Connect",
  );
  assert.equal(snapshot.active_qbo_addons, 1, "Prodel QBO addon must remain active");
  assert.equal(snapshot.enabled_qbo_modules, 1, "Prodel QBO module must remain enabled");
  assert.equal(snapshot.connected_qbo, 1, "Prodel QBO connection must remain connected");
  assert.equal(snapshot.active_sync_configs, 2, "Prodel must retain its two active sync configs");
  assert.equal(snapshot.checklists, 0, "Prodel checklist data must remain untouched");
  assert.equal(snapshot.vendors, 0, "Prodel vendor data must remain untouched");
  assert.equal(snapshot.documents, 0, "Prodel document data must remain untouched");
  assert.equal(snapshot.announcements, 0, "Prodel announcement data must remain untouched");
  assert.equal(snapshot.announcement_deliveries, 0, "Prodel announcement delivery data must remain untouched");

  console.log(JSON.stringify({
    projectRef: EXPECTED_PROJECT_REF,
    organization: snapshot.name,
    integrationPlan: snapshot.integration_plan_name,
    activeQboAddons: snapshot.active_qbo_addons,
    enabledQboModules: snapshot.enabled_qbo_modules,
    connectedQbo: snapshot.connected_qbo,
    activeSyncConfigs: snapshot.active_sync_configs,
    touchedModuleRows: {
      checklists: snapshot.checklists,
      vendors: snapshot.vendors,
      documents: snapshot.documents,
      announcements: snapshot.announcements,
      announcementDeliveries: snapshot.announcement_deliveries,
    },
    status: "PASS",
  }, null, 2));
  await client.query("rollback");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}

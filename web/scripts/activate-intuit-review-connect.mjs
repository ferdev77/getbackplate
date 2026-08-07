import { readFileSync } from "node:fs";
import pg from "pg";

const envFile = process.env.ENV_FILE?.trim() || ".env.production.local";
for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (!match || process.env[match[1]]) continue;
  const raw = match[2].trim();
  process.env[match[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw;
}

const databaseUrl = process.env.SUPABASE_DB_POOLER_URL;
if (!databaseUrl?.includes("mfhyemwypuzsqjqxtbjf")) {
  throw new Error("Refusing activation outside the expected production project.");
}

const organizationName = process.env.INTUIT_REVIEW_ORGANIZATION?.trim() || "intuit review";
if (organizationName.toLowerCase().includes("prodel")) {
  throw new Error("Refusing to target Prodel.");
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const organizations = await client.query(`
    select o.id, o.name
    from public.organizations o
    join public.memberships membership on membership.organization_id = o.id and membership.status = 'active'
    join public.roles role on role.id = membership.role_id and role.code = 'company_admin'
    where lower(o.name) = lower($1)
  `, [organizationName]);
  if (organizations.rowCount !== 1) {
    throw new Error(`Expected exactly one active reviewer organization named '${organizationName}', found ${organizations.rowCount}.`);
  }
  const organization = organizations.rows[0];

  const plans = await client.query(`
    select id, name from public.plans
    where plan_type = 'qbo_r365'
      and (lower(code) like '%connect%' or lower(name) = 'connect')
      and is_active = true
  `);
  if (plans.rowCount !== 1) throw new Error(`Expected exactly one active Connect plan, found ${plans.rowCount}.`);
  const plan = plans.rows[0];

  await client.query("begin");
  try {
    await client.query(`
      update public.organizations
      set plan_id = null,
          integration_plan_id = $2,
          billing_activation_status = 'active',
          billing_onboarding_required = false,
          updated_at = now()
      where id = $1
    `, [organization.id, plan.id]);

    await client.query(`
      insert into public.organization_modules (organization_id, module_id, is_enabled, enabled_at)
      select $1, module.id,
             coalesce(plan_module.is_enabled, false),
             case when plan_module.is_enabled then now() else null end
      from public.module_catalog module
      left join public.plan_modules plan_module
        on plan_module.module_id = module.id and plan_module.plan_id = $2
      on conflict (organization_id, module_id) do update
      set is_enabled = excluded.is_enabled,
          enabled_at = excluded.enabled_at
    `, [organization.id, plan.id]);

    await client.query(`
      insert into public.organization_addons (organization_id, module_id, integration_plan_id, status)
      select $1, id, $2, 'active' from public.module_catalog where code = 'qbo_r365'
      on conflict (organization_id, module_id) do update
      set integration_plan_id = excluded.integration_plan_id,
          status = 'active',
          updated_at = now()
    `, [organization.id, plan.id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  const verification = await client.query(`
    select
      array_agg(module.code order by module.code) filter (where organization_module.is_enabled) as enabled_modules,
      (select count(*)::int from public.organization_addons addon
       join public.module_catalog catalog on catalog.id = addon.module_id
       where addon.organization_id = $1 and catalog.code = 'qbo_r365'
         and addon.integration_plan_id = $2 and addon.status = 'active') as active_connect_addons,
      (select count(*)::int from public.stripe_customers where organization_id = $1) as stripe_customers,
      (select count(*)::int from public.subscriptions where organization_id = $1) as subscriptions
    from public.organization_modules organization_module
    join public.module_catalog module on module.id = organization_module.module_id
    where organization_module.organization_id = $1
  `, [organization.id, plan.id]);
  const result = verification.rows[0];
  const expectedModules = ["custom_branding", "qbo_r365", "settings"];
  if (JSON.stringify(result.enabled_modules) !== JSON.stringify(expectedModules)
      || result.active_connect_addons !== 1
      || result.stripe_customers !== 0
      || result.subscriptions !== 0) {
    throw new Error(`Unexpected reviewer entitlement state: ${JSON.stringify(result)}`);
  }

  console.log(JSON.stringify({ organization: organization.name, plan: plan.name, ...result }, null, 2));
} finally {
  await client.end();
}

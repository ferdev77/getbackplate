import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV = [
  "PROD_SUPABASE_URL",
  "PROD_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing env var: ${key}`);
  }
}

const PROD_ORG_SLUG = process.env.PROD_ORG_SLUG ?? "juans-restaurants";
const TEMP_USER_PASSWORD = process.env.TEMP_USER_PASSWORD ?? "TempSync_2026!";

const prod = createClient(
  process.env.PROD_SUPABASE_URL,
  process.env.PROD_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const dev = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function fetchAll(client, table, queryBuilder, pageSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryBuilder(client.from(table)).range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function upsertByCode(table, rows) {
  if (!rows.length) return;
  const { error } = await dev.from(table).upsert(rows, { onConflict: "code" });
  if (error) throw new Error(`${table} upsertByCode: ${error.message}`);
}

async function syncPlansAndPlanModules() {
  const prodPlans = await fetchAll(prod, "plans", (q) => q.select("*").order("code"));
  await upsertByCode("plans", prodPlans);

  const prodPlanModules = await fetchAll(
    prod,
    "plan_modules",
    (q) => q.select("is_enabled, plans!inner(code), module_catalog!inner(code)")
  );

  const { data: devPlans, error: devPlansError } = await dev.from("plans").select("id, code");
  if (devPlansError) throw new Error(`plans map: ${devPlansError.message}`);
  const { data: devModules, error: devModulesError } = await dev.from("module_catalog").select("id, code");
  if (devModulesError) throw new Error(`module map: ${devModulesError.message}`);

  const planIdByCode = new Map((devPlans ?? []).map((p) => [p.code, p.id]));
  const moduleIdByCode = new Map((devModules ?? []).map((m) => [m.code, m.id]));

  const upserts = [];
  for (const row of prodPlanModules) {
    const planCode = row.plans?.code;
    const moduleCode = row.module_catalog?.code;
    const planId = planIdByCode.get(planCode);
    const moduleId = moduleIdByCode.get(moduleCode);
    if (!planId || !moduleId) continue;
    upserts.push({ plan_id: planId, module_id: moduleId, is_enabled: row.is_enabled });
  }

  if (upserts.length) {
    const { error } = await dev.from("plan_modules").upsert(upserts, { onConflict: "plan_id,module_id" });
    if (error) throw new Error(`plan_modules upsert: ${error.message}`);
  }

  console.log(`Plans synced: ${prodPlans.length}, plan_modules synced: ${upserts.length}`);
}

function collectUserIds(rowsByTable, orgRow) {
  const ids = new Set();
  const userKeyPattern = /(_user_id|^user_id$|created_by|reviewed_by|submitted_by|reported_by|author_id|uploaded_by|resolved_by)$/;

  const visit = (value, key = "") => {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, k);
      return;
    }
    if (typeof value === "string" && userKeyPattern.test(key) && value.length >= 32) {
      ids.add(value);
    }
  };

  for (const rows of Object.values(rowsByTable)) {
    for (const row of rows) visit(row);
  }

  if (orgRow?.created_by) ids.add(orgRow.created_by);
  return [...ids];
}

async function listAllAuthUsers(client) {
  const all = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth listUsers page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < perPage) break;
    page += 1;
  }
  return all;
}

async function ensureAuthUsersInDev(requiredUserIds) {
  if (!requiredUserIds.length) return;
  const prodUsers = await listAllAuthUsers(prod);
  const devUsers = await listAllAuthUsers(dev);

  const prodById = new Map(prodUsers.map((u) => [u.id, u]));
  const devIds = new Set(devUsers.map((u) => u.id));

  let created = 0;
  let placeholders = 0;
  for (const userId of requiredUserIds) {
    if (devIds.has(userId)) continue;
    const src = prodById.get(userId);
    const email = src?.email ?? `restored-${userId}@local.invalid`;

    const { error } = await dev.auth.admin.createUser({
      id: userId,
      email,
      password: TEMP_USER_PASSWORD,
      email_confirm: true,
      user_metadata: src?.user_metadata ?? { restored_placeholder: true },
      app_metadata: src?.app_metadata ?? {},
      phone: src?.phone ?? undefined,
    });

    if (error && !String(error.message).toLowerCase().includes("already")) {
      throw new Error(`createUser ${src.email}: ${error.message}`);
    }
    created += 1;
    if (!src?.email) placeholders += 1;
  }

  console.log(`Auth users ensured in dev: ${created} created (${placeholders} placeholder), ${requiredUserIds.length} required`);
}

async function getCodeIdMap(client, table) {
  const { data, error } = await client.from(table).select("id, code");
  if (error) throw new Error(`${table} map: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.id, r.code]));
}

async function getIdByCodeMap(client, table) {
  const { data, error } = await client.from(table).select("id, code");
  if (error) throw new Error(`${table} reverse map: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.code, r.id]));
}

function remapForeignKeys(row, maps) {
  const next = { ...row };
  if (next.plan_id && maps.planCodeByProdId.has(next.plan_id)) {
    const code = maps.planCodeByProdId.get(next.plan_id);
    next.plan_id = maps.devPlanIdByCode.get(code) ?? next.plan_id;
  }
  if (next.role_id && maps.roleCodeByProdId.has(next.role_id)) {
    const code = maps.roleCodeByProdId.get(next.role_id);
    next.role_id = maps.devRoleIdByCode.get(code) ?? next.role_id;
  }
  if (next.module_id && maps.moduleCodeByProdId.has(next.module_id)) {
    const code = maps.moduleCodeByProdId.get(next.module_id);
    next.module_id = maps.devModuleIdByCode.get(code) ?? next.module_id;
  }
  return next;
}

async function main() {
  await syncPlansAndPlanModules();

  const { data: orgRow, error: orgError } = await prod
    .from("organizations")
    .select("*")
    .eq("slug", PROD_ORG_SLUG)
    .maybeSingle();

  if (orgError) throw new Error(`load prod org: ${orgError.message}`);
  if (!orgRow) throw new Error(`Organization not found in prod: ${PROD_ORG_SLUG}`);

  const tablesInOrder = [
    "organization_limits",
    "organization_settings",
    "branches",
    "organization_departments",
    "department_positions",
    "organization_modules",
    "memberships",
    "organization_user_profiles",
    "employees",
    "employee_contracts",
    "document_folders",
    "documents",
    "document_processing_jobs",
    "document_access_rules",
    "employee_documents",
    "announcements",
    "announcement_audiences",
    "announcement_deliveries",
    "checklist_templates",
    "checklist_template_sections",
    "checklist_template_items",
    "checklist_submissions",
    "checklist_submission_items",
    "checklist_item_comments",
    "checklist_item_attachments",
    "checklist_flags",
    "organization_invitations",
    "feedback_messages",
    "user_preferences",
    "superadmin_impersonation_sessions",
    "audit_logs",
  ];

  const onConflictByTable = {
    organization_settings: "organization_id",
    user_preferences: "organization_id,user_id",
  };

  const rowsByTable = {};
  for (const table of tablesInOrder) {
    rowsByTable[table] = await fetchAll(
      prod,
      table,
      (q) => q.select("*").eq("organization_id", orgRow.id).order("created_at", { ascending: true }),
    );
  }

  const requiredUserIds = collectUserIds(rowsByTable, orgRow);
  await ensureAuthUsersInDev(requiredUserIds);

  const [
    planCodeByProdId,
    roleCodeByProdId,
    moduleCodeByProdId,
    devPlanIdByCode,
    devRoleIdByCode,
    devModuleIdByCode,
  ] = await Promise.all([
    getCodeIdMap(prod, "plans"),
    getCodeIdMap(prod, "roles"),
    getCodeIdMap(prod, "module_catalog"),
    getIdByCodeMap(dev, "plans"),
    getIdByCodeMap(dev, "roles"),
    getIdByCodeMap(dev, "module_catalog"),
  ]);

  const maps = {
    planCodeByProdId,
    roleCodeByProdId,
    moduleCodeByProdId,
    devPlanIdByCode,
    devRoleIdByCode,
    devModuleIdByCode,
  };

  const orgUpsert = [remapForeignKeys(orgRow, maps)];
  const { error: orgUpsertError } = await dev.from("organizations").upsert(orgUpsert, { onConflict: "id" });
  if (orgUpsertError) throw new Error(`upsert organizations: ${orgUpsertError.message}`);

  for (const table of tablesInOrder) {
    const rows = rowsByTable[table];
    if (!rows.length) continue;
    const payload = rows.map((row) => remapForeignKeys(row, maps));
    const onConflict = onConflictByTable[table] ?? "id";
    const { error } = await dev.from(table).upsert(payload, { onConflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
    console.log(`Synced ${table}: ${payload.length}`);
  }

  console.log(`Done. Organization synced: ${orgRow.name} (${orgRow.slug})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

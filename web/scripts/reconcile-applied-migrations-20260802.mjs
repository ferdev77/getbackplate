import pg from "pg";

const DEV_REF = "uubdslmtfxwraszinpao";
const PROD_REF = "mfhyemwypuzsqjqxtbjf";
const target = process.argv[2];
const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (target !== "dev" && target !== "prod") {
  throw new Error("Usage: reconcile-applied-migrations-20260802.mjs <dev|prod>");
}

const expectedRef = target === "dev" ? DEV_REF : PROD_REF;
const forbiddenRef = target === "dev" ? PROD_REF : DEV_REF;
if (!databaseUrl.includes(expectedRef) || !apiUrl.includes(expectedRef)) {
  throw new Error(`Reconciliation refused: expected ${target} project ${expectedRef}`);
}
if (databaseUrl.includes(forbiddenRef) || apiUrl.includes(forbiddenRef)) {
  throw new Error(`Reconciliation refused: detected the wrong project for ${target}`);
}

const versions = [
  ["20260727000001", "fix_document_folder_rls_recursion"],
  ["20260729000001", "notifications_in_app_channel"],
  ["20260731000001", "checklist_deletable_with_history"],
];

function assert(condition, message) {
  if (!condition) throw new Error(`Schema precondition failed: ${message}`);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");
  await client.query("set transaction isolation level serializable");

  const constraint = await client.query(`
    select pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'notifications'
      and constraint_row.conname = 'notifications_channel_check'
  `);
  const channelDefinition = constraint.rows[0]?.definition ?? "";
  assert(channelDefinition.includes("email") && channelDefinition.includes("push") && channelDefinition.includes("in_app"),
    "notifications_channel_check must allow email, push, and in_app");

  const folderFunction = await client.query(`
    select function_row.prosecdef,
           function_row.proconfig,
           has_function_privilege('authenticated', function_row.oid, 'EXECUTE') as authenticated_execute
    from pg_proc function_row
    join pg_namespace schema_row on schema_row.oid = function_row.pronamespace
    where schema_row.nspname = 'public'
      and function_row.proname = 'resolve_folder_effective_scope'
      and pg_get_function_identity_arguments(function_row.oid) = 'p_org_id uuid, p_folder_id uuid'
  `);
  assert(folderFunction.rowCount === 1, "resolve_folder_effective_scope(uuid, uuid) must exist exactly once");
  assert(folderFunction.rows[0].prosecdef === true, "resolve_folder_effective_scope must be SECURITY DEFINER");
  assert((folderFunction.rows[0].proconfig ?? []).includes("search_path=public"),
    "resolve_folder_effective_scope must have search_path=public before the hardening migration");
  assert(folderFunction.rows[0].authenticated_execute === true,
    "authenticated must currently execute resolve_folder_effective_scope");

  const checklistColumns = await client.query(`
    select table_name, column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (
        ('checklist_submissions', 'template_name'),
        ('checklist_submissions', 'template_id'),
        ('checklist_submission_items', 'item_label'),
        ('checklist_submission_items', 'template_item_id')
      )
  `);
  const columns = new Map(checklistColumns.rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
  assert(columns.has("checklist_submissions.template_name"), "checklist_submissions.template_name must exist");
  assert(columns.get("checklist_submissions.template_id")?.is_nullable === "YES",
    "checklist_submissions.template_id must be nullable");
  assert(columns.has("checklist_submission_items.item_label"), "checklist_submission_items.item_label must exist");
  assert(columns.get("checklist_submission_items.template_item_id")?.is_nullable === "YES",
    "checklist_submission_items.template_item_id must be nullable");

  const deleteRules = await client.query(`
    select constraint_name, delete_rule
    from information_schema.referential_constraints
    where constraint_schema = 'public'
      and constraint_name in (
        'checklist_submissions_template_id_fkey',
        'checklist_submission_items_template_item_id_fkey'
      )
  `);
  const rules = new Map(deleteRules.rows.map((row) => [row.constraint_name, row.delete_rule]));
  assert(rules.get("checklist_submissions_template_id_fkey") === "SET NULL",
    "checklist submission template FK must use ON DELETE SET NULL");
  assert(rules.get("checklist_submission_items_template_item_id_fkey") === "SET NULL",
    "checklist submission item FK must use ON DELETE SET NULL");

  const submitFunction = await client.query(`
    select pg_get_functiondef(function_row.oid) as definition
    from pg_proc function_row
    join pg_namespace schema_row on schema_row.oid = function_row.pronamespace
    where schema_row.nspname = 'public'
      and function_row.proname = 'submit_checklist_transaction'
  `);
  assert(submitFunction.rowCount === 1, "submit_checklist_transaction must exist exactly once");
  const submitDefinition = submitFunction.rows[0].definition ?? "";
  assert(submitDefinition.includes("template_name") && submitDefinition.includes("item_label"),
    "submit_checklist_transaction must persist frozen template and item labels");

  for (const [version, name] of versions) {
    await client.query(
      `insert into supabase_migrations.schema_migrations(version, name)
       values ($1, $2)
       on conflict (version) do nothing`,
      [version, name],
    );
  }

  await client.query("commit");
  console.log(`Reconciled ${versions.length} already-applied migration versions in ${target}.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

import pg from "pg";

const EXPECTED_PROJECT_REF = "uubdslmtfxwraszinpao";
const PRODUCTION_PROJECT_REF = "mfhyemwypuzsqjqxtbjf";
const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const REPORT_ID = "20260807-0000-4000-8000-260807000004";

if (!databaseUrl.includes(EXPECTED_PROJECT_REF) || !apiUrl.includes(EXPECTED_PROJECT_REF)) {
  throw new Error("Publication verification refused: expected Supabase dev project");
}
if (databaseUrl.includes(PRODUCTION_PROJECT_REF) || apiUrl.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error("Publication verification refused: production project detected");
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  const { rows: reports } = await client.query(
    "select publication_status, price_state, total_cents, html_document from public.development_ledger_reports where id = $1",
    [REPORT_ID],
  );
  if (reports.length !== 1 || reports[0].publication_status !== "draft" || Object.keys(reports[0].price_state ?? {}).length !== 31) {
    throw new Error("Initial development report is not a 31-price draft");
  }
  const improvementBadges = reports[0].html_document.match(/<span class="chip mejora">Mejora<\/span>/g) ?? [];
  const correctionBadges = reports[0].html_document.match(/<span class="chip fix">Corrección<\/span>/g) ?? [];
  const { rows: improvementRows } = await client.query("select count(*)::integer as count from public.development_ledger_items where work_type = 'improvement'");
  if (improvementBadges.length !== 32 || correctionBadges.length !== 47 || improvementRows[0]?.count !== 31) {
    throw new Error("Development report improvement classification is inconsistent");
  }
  if (
    !reports[0].html_document.includes('id="vCharged"')
    || !reports[0].html_document.includes('id="vImprovement"')
    || reports[0].html_document.includes('<span class="tot-l">Con precio puesto</span>')
  ) {
    throw new Error("Development report badge value summary is missing or stale");
  }

  const { rows: policies } = await client.query(
    "select qual from pg_policies where schemaname = 'public' and tablename = 'development_ledger_reports' and policyname = 'development_ledger_reports_superadmin_select'",
  );
  if (policies.length !== 1 || !String(policies[0].qual).includes("fer@soliz.com") || !String(policies[0].qual).includes("published")) {
    throw new Error("Development report visibility policy is not publisher-scoped");
  }

  await client.query("update public.development_ledger_reports set price_state = jsonb_set(price_state, '{i1-12}', '\"35\"'), total_cents = 160500, updated_at = now() where id = $1", [REPORT_ID]);

  await client.query("savepoint immutable_content");
  try {
    await client.query("update public.development_ledger_reports set title = 'mutated' where id = $1", [REPORT_ID]);
    throw new Error("Draft report content was unexpectedly mutable");
  } catch (error) {
    if (error.message === "Draft report content was unexpectedly mutable") throw error;
    await client.query("rollback to savepoint immutable_content");
  }

  const { rows: publishers } = await client.query("select user_id from public.superadmin_users order by created_at limit 1");
  if (!publishers[0]?.user_id) throw new Error("No dev superadmin available for publication verification");
  await client.query(
    "update public.development_ledger_reports set publication_status = 'published', published_at = now(), published_by = $2, updated_at = now() where id = $1",
    [REPORT_ID, publishers[0].user_id],
  );

  await client.query("savepoint immutable_publication");
  try {
    await client.query("update public.development_ledger_reports set price_state = '{}'::jsonb where id = $1", [REPORT_ID]);
    throw new Error("Published report was unexpectedly mutable");
  } catch (error) {
    if (error.message === "Published report was unexpectedly mutable") throw error;
    await client.query("rollback to savepoint immutable_publication");
  }

  await client.query("rollback");
  console.log("Development report publication verification passed: private draft, editable prices, immutable content and irreversible publication.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

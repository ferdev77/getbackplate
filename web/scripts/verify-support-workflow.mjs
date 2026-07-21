import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DB_POOLER_URL or DATABASE_URL is required");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");
  const { rows: superadmins } = await client.query("select user_id from public.superadmin_users order by created_at limit 1");
  const superadminId = superadmins[0]?.user_id;
  if (!superadminId) throw new Error("No superadmin is available for workflow verification");
  const { rows: regularUsers } = await client.query(`
    select id from auth.users
    where not exists (select 1 from public.superadmin_users where user_id = auth.users.id)
    order by created_at limit 1
  `);
  const regularUserId = regularUsers[0]?.id;
  if (!regularUserId) throw new Error("No regular user is available for authorization verification");
  const { rows: companyAdmins } = await client.query(`
    select membership.user_id, membership.organization_id
    from public.memberships membership
    join public.roles role on role.id = membership.role_id
    where membership.status = 'active' and role.code = 'company_admin'
    order by membership.created_at limit 1
  `);
  const companyAdmin = companyAdmins[0];
  if (!companyAdmin) throw new Error("No active Company Admin membership is available for identity verification");

  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [superadminId]);
  const { rows: requests } = await client.query(`
    insert into public.support_requests (
      request_type, requester_name, requester_email, company_name, details
    ) values (
      'deletion', 'Workflow Verification', 'workflow-verification@example.invalid',
      'GetBackplate QA', 'Temporary request; transaction is always rolled back.'
    ) returning id
  `);
  const requestId = requests[0].id;

  await client.query("savepoint before_invalid_identity_evidence");
  try {
    await client.query("update public.support_requests set identity_source = 'authenticated' where id = $1", [requestId]);
    throw new Error("Authenticated identity without evidence unexpectedly succeeded");
  } catch (error) {
    await client.query("rollback to savepoint before_invalid_identity_evidence");
    if (error.code !== "23514" && !String(error.message).includes("identity evidence is incomplete")) throw error;
  }

  await client.query("savepoint before_valid_identity_evidence");
  const validIdentity = await client.query(`
    update public.support_requests
    set identity_source = 'authenticated', requester_user_id = $2,
        organization_id = $3, authenticated_at = now()
    where id = $1 returning identity_source
  `, [requestId, companyAdmin.user_id, companyAdmin.organization_id]);
  if (validIdentity.rows[0]?.identity_source !== "authenticated") {
    throw new Error("Valid authenticated identity evidence was not accepted");
  }
  await client.query("rollback to savepoint before_valid_identity_evidence");
  await client.query("set local role authenticated");

  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [regularUserId]);
  await client.query("savepoint before_non_superadmin_call");
  try {
    await client.query("select public.manage_support_request($1, 'status', 'open')", [requestId]);
    throw new Error("Non-superadmin workflow call unexpectedly succeeded");
  } catch (error) {
    await client.query("rollback to savepoint before_non_superadmin_call");
    if (!String(error.message).includes("Superadmin access required")) throw error;
  }
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [superadminId]);

  const directUpdate = await client.query("update public.support_requests set status = 'resolved' where id = $1", [requestId]);
  if (directUpdate.rowCount !== 0) throw new Error("Direct authenticated workflow update unexpectedly succeeded");

  await client.query("savepoint before_verification_guard");
  try {
    await client.query("select public.manage_support_request($1, 'status', 'in_progress')", [requestId]);
    throw new Error("Privacy request advanced without identity verification");
  } catch (error) {
    await client.query("rollback to savepoint before_verification_guard");
    if (!String(error.message).includes("Identity verification is required")) throw error;
  }

  await client.query("select public.manage_support_request($1, 'assignment', $2)", [requestId, superadminId]);
  await client.query("select public.manage_support_request($1, 'notes', $2)", [requestId, "Identity confirmed by workflow verifier."]);
  await client.query("select public.manage_support_request($1, 'verification', 'true')", [requestId]);
  await client.query("select public.manage_support_request($1, 'status', 'in_progress')", [requestId]);
  await client.query("select public.manage_support_request($1, 'status', 'resolved')", [requestId]);

  await client.query("savepoint before_verification_removal");
  try {
    await client.query("select public.manage_support_request($1, 'verification', 'false')", [requestId]);
    throw new Error("Verification was removed from a resolved privacy request");
  } catch (error) {
    await client.query("rollback to savepoint before_verification_removal");
    if (!String(error.message).includes("Verification cannot be removed")) throw error;
  }

  const { rows: finalRows } = await client.query(`
    select status, assigned_to, identity_source,
           verified_at is not null as verified, resolved_at is not null as resolved
    from public.support_requests where id = $1
  `, [requestId]);
  const { rows: eventRows } = await client.query(`
    select event_type, count(*)::integer as count,
           bool_and(actor_id = $2) filter (where event_type <> 'created') as actors_match
    from public.support_request_events where support_request_id = $1
    group by event_type order by event_type
  `, [requestId, superadminId]);
  const final = finalRows[0];
  if (final?.status !== "resolved" || final.assigned_to !== superadminId || final.identity_source !== "public" || !final.verified || !final.resolved) {
    throw new Error("Support workflow final state is incorrect");
  }
  const expectedEvents = { assignment_changed: 1, created: 1, notes_updated: 1, status_changed: 2, verification_changed: 1 };
  if (eventRows.length !== 5 || eventRows.some((row) => expectedEvents[row.event_type] !== row.count || (row.event_type !== "created" && !row.actors_match))) {
    throw new Error("Support workflow history is incomplete or incorrectly attributed");
  }

  const directDelete = await client.query("delete from public.support_requests where id = $1", [requestId]);
  if (directDelete.rowCount !== 0) throw new Error("Direct authenticated support request deletion unexpectedly succeeded");

  await client.query("reset role");
  await client.query("select set_config('app.support_workflow_rpc', 'false', true)");
  await client.query("savepoint before_guarded_update");
  try {
    await client.query("update public.support_requests set status = 'open' where id = $1", [requestId]);
    throw new Error("Workflow trigger did not block a privileged direct update");
  } catch (error) {
    await client.query("rollback to savepoint before_guarded_update");
    if (!String(error.message).includes("manage_support_request")) throw error;
  }

  await client.query("savepoint before_history_mutation");
  try {
    await client.query("update public.support_request_events set next_value = '{}'::jsonb where support_request_id = $1", [requestId]);
    throw new Error("Append-only trigger did not block history mutation");
  } catch (error) {
    await client.query("rollback to savepoint before_history_mutation");
    if (!String(error.message).includes("append-only")) throw error;
  }

  await client.query("savepoint before_duplicate_created_event");
  try {
    await client.query("insert into public.support_request_events (support_request_id, event_type) values ($1, 'created')", [requestId]);
    throw new Error("Duplicate created history event unexpectedly succeeded");
  } catch (error) {
    await client.query("rollback to savepoint before_duplicate_created_event");
    if (error.code !== "23505") throw error;
  }

  await client.query("savepoint before_guarded_delete");
  try {
    await client.query("delete from public.support_requests where id = $1", [requestId]);
    throw new Error("Workflow trigger did not block a privileged direct delete");
  } catch (error) {
    await client.query("rollback to savepoint before_guarded_delete");
    if (!String(error.message).includes("cannot be deleted")) throw error;
  }

  console.table([{ status: final.status, assigned: true, verified: final.verified, resolved: final.resolved, events: 6 }]);
  console.log("Support workflow verification passed; temporary data rolled back.");
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end();
}

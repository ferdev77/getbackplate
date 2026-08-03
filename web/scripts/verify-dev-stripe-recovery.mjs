import pg from "pg";
import { randomUUID } from "node:crypto";

const EXPECTED_PROJECT_REF = "uubdslmtfxwraszinpao";
const PRODUCTION_PROJECT_REF = "mfhyemwypuzsqjqxtbjf";
const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (!databaseUrl.includes(EXPECTED_PROJECT_REF) || !apiUrl.includes(EXPECTED_PROJECT_REF)) {
  throw new Error("Stripe recovery verification refused: expected Supabase dev project");
}
if (databaseUrl.includes(PRODUCTION_PROJECT_REF) || apiUrl.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error("Stripe recovery verification refused: production project detected");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("begin");
let transactionOpen = true;

try {
  await client.query("set local statement_timeout = '30s'");

  const eventId = `evt_verify_${randomUUID()}`;
  const firstClaim = await client.query(
    "select * from public.claim_stripe_event($1, $2, now(), 600, 8)",
    [eventId, "verify.recovery"],
  );
  assert(firstClaim.rows[0]?.outcome === "claimed", "new Stripe event was not claimed");
  const firstToken = firstClaim.rows[0].processing_token;

  const busyClaim = await client.query(
    "select * from public.claim_stripe_event($1, $2, now(), 600, 8)",
    [eventId, "verify.recovery"],
  );
  assert(busyClaim.rows[0]?.outcome === "busy", "active Stripe lease was not protected");

  const failed = await client.query(
    "select public.fail_stripe_event_v2($1, $2, $3, 0, 8) as applied",
    [eventId, firstToken, "expected verification failure"],
  );
  assert(failed.rows[0]?.applied === true, "owned Stripe event could not be marked failed");

  const retryClaim = await client.query(
    "select * from public.claim_stripe_event($1, $2, now(), 600, 8)",
    [eventId, "verify.recovery"],
  );
  assert(retryClaim.rows[0]?.outcome === "claimed", "failed Stripe event was not reclaimed");
  const retryToken = retryClaim.rows[0].processing_token;
  assert(retryToken !== firstToken, "reclaimed Stripe event reused its old token");

  const staleCompletion = await client.query(
    "select public.complete_stripe_event($1, $2) as applied",
    [eventId, firstToken],
  );
  assert(staleCompletion.rows[0]?.applied === false, "stale worker completed a reclaimed Stripe event");

  const completion = await client.query(
    "select public.complete_stripe_event($1, $2) as applied",
    [eventId, retryToken],
  );
  assert(completion.rows[0]?.applied === true, "current worker could not complete Stripe event");

  const duplicateClaim = await client.query(
    "select * from public.claim_stripe_event($1, $2, now(), 600, 8)",
    [eventId, "verify.recovery"],
  );
  assert(duplicateClaim.rows[0]?.outcome === "processed", "completed Stripe event was replayable");

  const deadEventId = `evt_verify_dead_${randomUUID()}`;
  const deadFirstClaim = await client.query(
    "select * from public.claim_stripe_event($1, $2, now(), 600, 1)",
    [deadEventId, "verify.dead_letter"],
  );
  await client.query("select public.fail_stripe_event_v2($1, $2, $3, 0, 1)", [
    deadEventId,
    deadFirstClaim.rows[0].processing_token,
    "expected permanent verification failure",
  ]);
  const deadClaim = await client.query(
    "select * from public.claim_stripe_event($1, $2, now(), 600, 1)",
    [deadEventId, "verify.dead_letter"],
  );
  assert(deadClaim.rows[0]?.outcome === "dead_lettered", "attempt limit did not dead-letter Stripe event");
  const queuedDeadEvent = await client.query(
    "select status, reason from public.stripe_event_reconciliation_queue where event_id = $1",
    [deadEventId],
  );
  assert(queuedDeadEvent.rows[0]?.status === "pending", "dead-lettered event was not queued for reconciliation");

  const orgId = randomUUID();
  const orderId = randomUUID();
  const sessionId = `cs_verify_${randomUUID()}`;
  const { rows: moduleRows } = await client.query(
    "select id from public.module_catalog where code = 'qbo_r365'",
  );
  assert(moduleRows.length === 1, "QBO-R365 module catalog row is missing in dev");
  const moduleId = moduleRows[0].id;

  await client.query(
    "insert into public.organizations(id, name, slug) values ($1, $2, $3)",
    [orgId, "Stripe Recovery Verification", `stripe-recovery-${randomUUID()}`],
  );
  await client.query(
    "insert into public.organization_addons(organization_id, module_id, status) values ($1, $2, 'active')",
    [orgId, moduleId],
  );
  await client.query(
    `insert into public.manual_payment_orders(
      id, organization_id, description, amount_cents, currency, action_type,
      action_payload, items, stripe_session_id, status
    ) values ($1, $2, 'Stripe recovery verification', 1000, 'usd', 'custom', '{}'::jsonb, $3::jsonb, $4, 'pending')`,
    [
      orderId,
      orgId,
      JSON.stringify([
        { action_type: "add_invoices", action_payload: { invoiceCount: 5 } },
        { action_type: "add_slot", action_payload: { slotCount: 2 } },
        { action_type: "custom", action_payload: {} },
      ]),
      sessionId,
    ],
  );

  const manualEventId = `evt_verify_manual_${randomUUID()}`;
  const manualApply = await client.query(
    "select public.apply_manual_payment_order_transaction_v2($1, $2, $3, $4, 1000, 1083, 'usd', 'pi_verify', 'verify@example.test', now()) as applied",
    [orderId, manualEventId, sessionId, orgId],
  );
  assert(manualApply.rows[0]?.applied === true, "manual payment transaction was not applied");

  const { rows: resultRows } = await client.query(
    `select addon.invoice_balance, addon.extra_r365_connections, payment.status,
      billing.amount_cents,
      (select count(*)::integer from public.stripe_event_effects where event_id = $2) as effect_count
    from public.organization_addons addon
    join public.manual_payment_orders payment on payment.organization_id = addon.organization_id
    join public.billing_records billing on billing.source_event_id = 'checkout_session:' || payment.stripe_session_id
    where addon.organization_id = $1 and addon.module_id = $3`,
    [orgId, manualEventId, moduleId],
  );
  const result = resultRows[0];
  assert(result?.invoice_balance === 5, "manual invoice credit was not applied exactly once");
  assert(result?.extra_r365_connections === 2, "manual R365 slot credit was not applied exactly once");
  assert(result?.status === "paid", "manual order was not marked paid after its effects");
  assert(Number(result?.amount_cents) === 1083, "manual billing record did not retain the taxed total");
  assert(result?.effect_count === 3, "manual payment effect ledger is incomplete");

  const repeatedApply = await client.query(
    "select public.apply_manual_payment_order_transaction_v2($1, $2, $3, $4, 1000, 1083, 'usd', 'pi_verify', 'verify@example.test', now()) as applied",
    [orderId, `evt_verify_duplicate_${randomUUID()}`, sessionId, orgId],
  );
  assert(repeatedApply.rows[0]?.applied === false, "paid manual order was applied more than once");

  const { rows: unchangedRows } = await client.query(
    "select invoice_balance, extra_r365_connections from public.organization_addons where organization_id = $1 and module_id = $2",
    [orgId, moduleId],
  );
  assert(unchangedRows[0]?.invoice_balance === 5, "duplicate delivery changed invoice balance");
  assert(unchangedRows[0]?.extra_r365_connections === 2, "duplicate delivery changed R365 slots");

  await client.query("savepoint underpayment_check");
  let underpaymentRejected = false;
  try {
    await client.query(
      "select public.apply_manual_payment_order_transaction_v2($1, $2, $3, $4, 1000, 100, 'usd', 'pi_verify', 'verify@example.test', now())",
      [orderId, `evt_verify_underpaid_${randomUUID()}`, sessionId, orgId],
    );
  } catch (error) {
    underpaymentRejected = String(error.message).includes("manual_payment_total_below_order_amount");
    await client.query("rollback to savepoint underpayment_check");
  }
  assert(underpaymentRejected, "manual payment transaction accepted a total below the order amount");

  const { rows: privilegeRows } = await client.query(`
    select
      has_function_privilege('authenticated', 'public.claim_stripe_event(text,text,timestamptz,integer,integer)', 'EXECUTE') as authenticated_can_claim,
      has_function_privilege('service_role', 'public.claim_stripe_event(text,text,timestamptz,integer,integer)', 'EXECUTE') as service_can_claim,
      has_function_privilege('authenticated', 'public.queue_stripe_event_reconciliation(text,text)', 'EXECUTE') as authenticated_can_queue,
      has_function_privilege('service_role', 'public.queue_stripe_event_reconciliation(text,text)', 'EXECUTE') as service_can_queue,
      has_function_privilege('service_role', 'public.fail_stripe_event(text,uuid,text,integer)', 'EXECUTE') as service_can_fail_v1,
      has_function_privilege('service_role', 'public.fail_stripe_event_v2(text,uuid,text,integer,integer)', 'EXECUTE') as service_can_fail_v2,
      has_function_privilege('service_role', 'public.apply_manual_payment_order_transaction(uuid,text,text,uuid,integer,integer,text,text,text,timestamptz)', 'EXECUTE') as service_can_apply_v1,
      has_function_privilege('service_role', 'public.apply_manual_payment_order_transaction_v2(uuid,text,text,uuid,integer,integer,text,text,text,timestamptz)', 'EXECUTE') as service_can_apply_v2
  `);
  assert(privilegeRows[0]?.authenticated_can_claim === false, "authenticated role can claim Stripe events");
  assert(privilegeRows[0]?.service_can_claim === true, "service role cannot claim Stripe events");
  assert(privilegeRows[0]?.authenticated_can_queue === false, "authenticated role can queue Stripe reconciliation");
  assert(privilegeRows[0]?.service_can_queue === true, "service role cannot queue Stripe reconciliation");
  assert(privilegeRows[0]?.service_can_fail_v1 === false, "service role can bypass atomic dead-letter handling");
  assert(privilegeRows[0]?.service_can_fail_v2 === true, "service role cannot atomically dead-letter Stripe events");
  assert(privilegeRows[0]?.service_can_apply_v1 === false, "service role can bypass hardened manual-payment validation");
  assert(privilegeRows[0]?.service_can_apply_v2 === true, "service role cannot apply hardened manual payments");

  await client.query("rollback");
  transactionOpen = false;
  const { rows: residueRows } = await client.query(
    "select count(*)::integer as count from public.organizations where id = $1 or name = 'Stripe Recovery Verification'",
    [orgId],
  );
  assert(residueRows[0]?.count === 0, "Stripe recovery verification fixture remained after rollback");
  console.log("Stripe recovery verification passed in dev (transaction rolled back, no fixture remains).");
} finally {
  if (transactionOpen) await client.query("rollback");
  await client.end();
}

import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

async function runWindowCheck(client, days) {
  const { rows } = await client.query(
    `
    with current_window as (
      select action, metadata
      from public.audit_logs
      where created_at >= now() - make_interval(days => $1::int)
    ), previous_window as (
      select action, metadata
      from public.audit_logs
      where created_at < now() - make_interval(days => $1::int)
        and created_at >= now() - make_interval(days => ($1::int * 2))
    )
    select
      (select count(*)::int from current_window) as total_events,
      (select count(*)::int from previous_window) as previous_total_events,
      (
        select count(*)::int
        from current_window
        where lower(coalesce(metadata->>'outcome', '')) = 'denied'
      ) as denied_events,
      (
        select count(*)::int
        from previous_window
        where lower(coalesce(metadata->>'outcome', '')) = 'denied'
      ) as previous_denied_events,
      (
        select count(*)::int
        from current_window
        where lower(coalesce(metadata->>'outcome', '')) = 'error'
      ) as error_events,
      (
        select count(*)::int
        from previous_window
        where lower(coalesce(metadata->>'outcome', '')) = 'error'
      ) as previous_error_events,
      (
        select count(*)::int
        from current_window
        where action = 'login.failed'
      ) as failed_auth_events
    `,
    [days],
  );

  const row = rows[0] ?? {};
  const total = Number(row.total_events ?? 0);
  const previousTotal = Number(row.previous_total_events ?? 0);
  const denied = Number(row.denied_events ?? 0);
  const previousDenied = Number(row.previous_denied_events ?? 0);
  const errors = Number(row.error_events ?? 0);
  const previousErrors = Number(row.previous_error_events ?? 0);
  const failedAuth = Number(row.failed_auth_events ?? 0);

  const deniedRatePct = total > 0 ? Number(((denied / total) * 100).toFixed(2)) : 0;
  const errorRatePct = total > 0 ? Number(((errors / total) * 100).toFixed(2)) : 0;
  const authFailureRatePct = total > 0 ? Number(((failedAuth / total) * 100).toFixed(2)) : 0;

  const checks = [
    denied <= total,
    errors <= total,
    failedAuth <= total,
    deniedRatePct >= 0 && deniedRatePct <= 100,
    errorRatePct >= 0 && errorRatePct <= 100,
    authFailureRatePct >= 0 && authFailureRatePct <= 100,
    previousDenied <= previousTotal,
    previousErrors <= previousTotal,
  ];

  return {
    window_days: days,
    total_events: total,
    previous_total_events: previousTotal,
    denied_events: denied,
    previous_denied_events: previousDenied,
    error_events: errors,
    previous_error_events: previousErrors,
    failed_auth_events: failedAuth,
    denied_rate_pct: deniedRatePct,
    error_rate_pct: errorRatePct,
    auth_failure_rate_pct: authFailureRatePct,
    ok: checks.every(Boolean),
  };
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const rows = [];
    for (const windowDays of [7, 30]) {
      rows.push(await runWindowCheck(client, windowDays));
    }

    console.table(rows);

    if (rows.some((row) => !row.ok)) {
      throw new Error("Inconsistencias detectadas en metricas operativas.");
    }

    console.log("OK: consistencia de metricas operativas validada (7d/30d).");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR verify-operational-metrics-consistency:", error.message);
  process.exit(1);
});

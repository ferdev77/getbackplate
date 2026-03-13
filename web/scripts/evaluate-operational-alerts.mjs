import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

function buildAlerts(row) {
  const alerts = [];

  if (row.status !== "active") {
    alerts.push({
      severity: "critical",
      code: "tenant_not_active",
      message: `Tenant en estado ${row.status}`,
    });
  }

  if (Number(row.active_admins ?? 0) === 0) {
    alerts.push({
      severity: "critical",
      code: "missing_active_admin",
      message: "Sin admins activos",
    });
  }

  if (Number(row.enabled_modules ?? 0) === 0) {
    alerts.push({
      severity: "high",
      code: "no_enabled_modules",
      message: "Sin modulos habilitados",
    });
  }

  if (Number(row.active_employees ?? 0) === 0) {
    alerts.push({
      severity: "medium",
      code: "no_active_employees",
      message: "Sin empleados activos",
    });
  }

  if (
    Number(row.docs_30d ?? 0) === 0 &&
    Number(row.checklist_7d ?? 0) === 0 &&
    Number(row.active_announcements ?? 0) === 0
  ) {
    alerts.push({
      severity: "medium",
      code: "no_recent_activity",
      message: "Sin actividad reciente",
    });
  }

  return alerts;
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rows } = await client.query(`select * from public.superadmin_org_health_snapshot()`);

    const alerts = [];
    for (const row of rows) {
      const tenantAlerts = buildAlerts(row);
      for (const alert of tenantAlerts) {
        alerts.push({
          organization_id: row.organization_id,
          organization_name: row.name,
          severity: alert.severity,
          code: alert.code,
          message: alert.message,
        });
      }
    }

    const severityWeight = { critical: 3, high: 2, medium: 1 };
    alerts.sort((a, b) => {
      const diff = severityWeight[b.severity] - severityWeight[a.severity];
      if (diff !== 0) return diff;
      return String(a.organization_name).localeCompare(String(b.organization_name));
    });

    const summary = {
      total_tenants: rows.length,
      total_alerts: alerts.length,
      critical_alerts: alerts.filter((a) => a.severity === "critical").length,
      high_alerts: alerts.filter((a) => a.severity === "high").length,
      medium_alerts: alerts.filter((a) => a.severity === "medium").length,
      tenants_with_alerts: new Set(alerts.map((a) => a.organization_id)).size,
    };

    console.table([summary]);

    if (alerts.length > 0) {
      console.log("Top alertas (max 30):");
      console.table(alerts.slice(0, 30));
    }

    console.log("OK: evaluacion de alertas operativas completada.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR evaluate-operational-alerts:", error.message);
  process.exit(1);
});

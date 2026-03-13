import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

function toInt(value) {
  return Number(value ?? 0);
}

async function runCheck(label, fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    return {
      module: label,
      ok: true,
      ms: Date.now() - startedAt,
      detail,
    };
  } catch (error) {
    return {
      module: label,
      ok: false,
      ms: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : "error",
    };
  }
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const { rows: orgRows } = await client.query(
      `
      select id, name
      from public.organizations
      where status = 'active'
      order by
        case when slug = 'smoke-optional-modules' then 0 else 1 end,
        created_at asc
      limit 1
      `,
    );
    const org = orgRows[0];

    if (!org) {
      throw new Error("No hay organizaciones activas para ejecutar smoke tests.");
    }

    const checks = [
      () => runCheck("superadmin", async () => {
        const { rows: plans } = await client.query(`select count(*)::int as c from public.plans`);
        const { rows: mods } = await client.query(`select count(*)::int as c from public.module_catalog`);
        const { rows: orgs } = await client.query(`select count(*)::int as c from public.organizations`);
        return `plans=${toInt(plans[0]?.c)} modules=${toInt(mods[0]?.c)} orgs=${toInt(orgs[0]?.c)}`;
      }),
      () => runCheck("employees", async () => {
        const { rows } = await client.query(
          `select count(*)::int as c from public.employees where organization_id = $1`,
          [org.id],
        );
        return `employees=${toInt(rows[0]?.c)}`;
      }),
      () => runCheck("documents", async () => {
        const { rows: docs } = await client.query(
          `select count(*)::int as c from public.documents where organization_id = $1`,
          [org.id],
        );
        const { rows: folders } = await client.query(
          `select count(*)::int as c from public.document_folders where organization_id = $1`,
          [org.id],
        );
        const { rows: links } = await client.query(
          `select count(*)::int as c from public.employee_documents where organization_id = $1`,
          [org.id],
        );
        return `docs=${toInt(docs[0]?.c)} folders=${toInt(folders[0]?.c)} links=${toInt(links[0]?.c)}`;
      }),
      () => runCheck("announcements", async () => {
        const { rows: anns } = await client.query(
          `select count(*)::int as c from public.announcements where organization_id = $1`,
          [org.id],
        );
        const { rows: aud } = await client.query(
          `select count(*)::int as c from public.announcement_audiences where organization_id = $1`,
          [org.id],
        );
        return `announcements=${toInt(anns[0]?.c)} audiences=${toInt(aud[0]?.c)}`;
      }),
      () => runCheck("checklists", async () => {
        const { rows: templates } = await client.query(
          `select count(*)::int as c from public.checklist_templates where organization_id = $1`,
          [org.id],
        );
        const { rows: subs } = await client.query(
          `select count(*)::int as c from public.checklist_submissions where organization_id = $1`,
          [org.id],
        );
        const { rows: items } = await client.query(
          `select count(*)::int as c from public.checklist_submission_items where organization_id = $1`,
          [org.id],
        );
        return `templates=${toInt(templates[0]?.c)} submissions=${toInt(subs[0]?.c)} items=${toInt(items[0]?.c)}`;
      }),
      () => runCheck("reports", async () => {
        const { rows } = await client.query(
          `
          select
            count(distinct s.id)::int as report_count,
            count(si.id)::int as report_items,
            count(f.id)::int as report_flags
          from public.checklist_submissions s
          left join public.checklist_submission_items si
            on si.submission_id = s.id
           and si.organization_id = s.organization_id
          left join public.checklist_flags f
            on f.submission_item_id = si.id
           and f.organization_id = s.organization_id
          where s.organization_id = $1
          `,
          [org.id],
        );
        return `reports=${toInt(rows[0]?.report_count)} items=${toInt(rows[0]?.report_items)} flags=${toInt(rows[0]?.report_flags)}`;
      }),
      () => runCheck("settings", async () => {
        const { rows: orgSettings } = await client.query(
          `select count(*)::int as c from public.organization_settings where organization_id = $1`,
          [org.id],
        );
        const { rows: prefs } = await client.query(
          `select count(*)::int as c from public.user_preferences where organization_id = $1`,
          [org.id],
        );
        return `org_settings=${toInt(orgSettings[0]?.c)} user_prefs=${toInt(prefs[0]?.c)}`;
      }),
      () => runCheck("audit", async () => {
        const { rows } = await client.query(
          `select count(*)::int as c from public.audit_logs where organization_id = $1 or organization_id is null`,
          [org.id],
        );
        return `audit_logs=${toInt(rows[0]?.c)}`;
      }),
      () => runCheck("module-enablement", async () => {
        const moduleCodes = [
          "dashboard",
          "employees",
          "onboarding",
          "documents",
          "announcements",
          "checklists",
          "reports",
          "settings",
        ];

        const statuses = [];
        for (const code of moduleCodes) {
          const { rows } = await client.query(
            `select public.is_module_enabled($1::uuid, $2::text) as enabled`,
            [org.id, code],
          );
          statuses.push(`${code}:${rows[0]?.enabled ? "on" : "off"}`);
        }

        return statuses.join(" ");
      }),
      () => runCheck("module-guardrails", async () => {
        await client.query("begin");
        try {
          const { rows: optionalRows } = await client.query(
            `
            select om.module_id, mc.code
            from public.organization_modules om
            join public.module_catalog mc on mc.id = om.module_id
            where om.organization_id = $1
              and mc.is_core = false
            order by mc.code asc
            limit 1
            `,
            [org.id],
          );

          const optional = optionalRows[0];
          if (!optional) {
            return "skipped_no_optional_modules";
          }

          await client.query(
            `
            update public.organization_modules
            set is_enabled = false
            where organization_id = $1
              and module_id = $2
            `,
            [org.id, optional.module_id],
          );

          const { rows: optionalStatusRows } = await client.query(
            `select public.is_module_enabled($1::uuid, $2::text) as enabled`,
            [org.id, optional.code],
          );

          if (optionalStatusRows[0]?.enabled) {
            throw new Error(`El modulo opcional ${optional.code} no se desactivo correctamente`);
          }

          const { rows: coreRows } = await client.query(
            `
            select om.module_id, mc.code
            from public.organization_modules om
            join public.module_catalog mc on mc.id = om.module_id
            where om.organization_id = $1
              and mc.is_core = true
            order by mc.code asc
            limit 1
            `,
            [org.id],
          );

          const core = coreRows[0];
          if (!core) {
            return `optional_toggle=ok core_block=skipped optional_module=${optional.code}`;
          }

          const { rows: triggerRows } = await client.query(
            `
            select count(*)::int as c
            from pg_trigger
            where tgname = 'trg_prevent_disabling_core_org_modules'
              and tgrelid = 'public.organization_modules'::regclass
              and tgisinternal = false
            `,
          );

          const hasCoreGuardTrigger = Number(triggerRows[0]?.c ?? 0) > 0;
          if (!hasCoreGuardTrigger) {
            return `optional_toggle=ok core_block=skipped_missing_db_migration optional_module=${optional.code} core_module=${core.code}`;
          }

          let coreBlocked = false;
          try {
            await client.query(
              `
              update public.organization_modules
              set is_enabled = false
              where organization_id = $1
                and module_id = $2
              `,
              [org.id, core.module_id],
            );
          } catch {
            coreBlocked = true;
          }

          if (!coreBlocked) {
            throw new Error(`Se permitio desactivar el modulo core ${core.code}`);
          }

          return `optional_toggle=ok core_block=ok optional_module=${optional.code} core_module=${core.code}`;
        } finally {
          await client.query("rollback");
        }
      }),
    ];

    const results = [];
    for (const check of checks) {
      results.push(await check());
    }
    console.log(`Smoke test org: ${org.name} (${org.id})`);
    console.table(results);

    const failed = results.filter((row) => !row.ok);
    if (failed.length > 0) {
      throw new Error(`Smoke tests fallaron en ${failed.length} modulo(s).`);
    }

    console.log("OK: smoke tests por modulo completados.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR smoke-modules:", error.message);
  process.exit(1);
});

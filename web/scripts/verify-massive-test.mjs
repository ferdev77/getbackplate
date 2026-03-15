/**
 * Verificación de Alcance y RLS (v3 - Deep Debug) — GetBackplate SaaS
 */

import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ok */ }
}

loadEnv();

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

async function setAuthUser(client, userId) {
  // En Supabase, auth.uid() suele leer de request.jwt.claims -> sub
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId })]);
}

async function main() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("🔍 Iniciando Verificación Profunda (Deep Debug)...");

  try {
    // 1. Org de prueba
    const { rows: [org] } = await client.query(
      "SELECT id, name FROM public.organizations WHERE name LIKE '%Corp #1' LIMIT 1"
    );
    if (!org) throw new Error("No se encontró la organización de prueba");

    // 2. Admins reales de la org
    const { rows: admins } = await client.query(`
      SELECT m.user_id, r.code as role, b.name as branch_name
      FROM public.memberships m
      JOIN public.roles r ON m.role_id = r.id
      JOIN public.branches b ON m.branch_id = b.id
      WHERE m.organization_id = $1 AND m.status = 'active'
      ORDER BY m.created_at ASC
    `, [org.id]);

    const admin1 = admins[0];
    const admin2 = admins[1];

    console.log(`\nConfiguración:`);
    console.log(`- Org: ${org.name} (${org.id})`);
    console.log(`- Admin 1: ${admin1.user_id} (${admin1.role} @ ${admin1.branch_name})`);
    console.log(`- Admin 2: ${admin2.user_id} (${admin2.role} @ ${admin2.branch_name})`);

    // --- DEBUG HELPER FUNCTIONS ---
    console.log("\n--- DEBUG HELPERS (Admin 1) ---");
    await setAuthUser(client, admin1.user_id);
    const { rows: [helpers] } = await client.query(`
      SELECT 
        auth.uid() as current_uid,
        public.is_superadmin() as is_sa,
        public.has_org_membership($1) as has_mem,
        public.can_manage_org($1) as can_man
    `, [org.id]);
    console.log(JSON.stringify(helpers, null, 2));

    // --- TEST ANUNCIOS ---
    console.log("\n--- TEST ANUNCIOS (Global, Branch, Dept) ---");
    const { rows: announcements } = await client.query(`
      SELECT id, branch_id, title, target_scope FROM public.announcements 
      WHERE organization_id = $1 
      ORDER BY created_at ASC LIMIT 10
    `, [org.id]);

    // Escojamos un empleado de la BD para "vincularlo" temporalmente a Admin 2
    // para probar visibilidad de empleado.
    const { rows: [emp] } = await client.query(`
      SELECT id, branch_id, department_id, position, first_name, last_name
      FROM public.employees
      WHERE organization_id = $1 AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `, [org.id]);

    console.log(`\nMocing Emp: ${emp.first_name} ${emp.last_name} para Admin 2`);

    for (const ann of announcements) {
      // 1. Admin 1 (Manage Org)
      await client.query("BEGIN");
      await setAuthUser(client, admin1.user_id);
      const { rows: [resAdmin] } = await client.query(
        "SELECT public.can_read_announcement($1, $2, $3, $4::jsonb) as can",
        [org.id, ann.id, ann.branch_id, JSON.stringify(ann.target_scope)]
      );
      await client.query("ROLLBACK");

      // 2. Employee Test (Admin 2 simulando ser un empleado específico)
      await client.query("BEGIN");
      await client.query(`
        UPDATE public.memberships 
        SET role_id = (SELECT id FROM public.roles WHERE code = 'employee'),
            branch_id = $2
        WHERE user_id = $1 AND organization_id = $3
      `, [admin2.user_id, emp.branch_id, org.id]);
      await client.query("UPDATE public.employees SET user_id = $1 WHERE id = $2", [admin2.user_id, emp.id]);

      await setAuthUser(client, admin2.user_id);
      const { rows: [resEmp] } = await client.query(
        "SELECT public.can_read_announcement($1, $2, $3, $4::jsonb) as can",
        [org.id, ann.id, ann.branch_id, JSON.stringify(ann.target_scope)]
      );

      console.log(`${ann.title.padEnd(45)} | Admin: ${resAdmin.can ? "✅" : "❌"} | Emp: ${resEmp.can ? "✅" : "❌"}`);
      await client.query("ROLLBACK");
    }

    // --- TEST DOCUMENTOS ---
    console.log("\n--- TEST DOCUMENTOS ---");
    const { rows: docs } = await client.query(`
      SELECT id, branch_id, title, access_scope FROM public.documents WHERE organization_id = $1 LIMIT 5
    `, [org.id]);

    for (const doc of docs) {
      await client.query("BEGIN");
      // Admin check
      await setAuthUser(client, admin1.user_id);
      const { rows: [resAdmin] } = await client.query(
        "SELECT public.can_read_document($1, $2, $3, $4) as can",
        [org.id, doc.branch_id, JSON.stringify(doc.access_scope), doc.id]
      );

      // Emp check (simulado con Admin 2)
      await client.query(`
        UPDATE public.memberships 
        SET role_id = (SELECT id FROM public.roles WHERE code = 'employee'),
            branch_id = $2
        WHERE user_id = $1 AND organization_id = $3
      `, [admin2.user_id, emp.branch_id, org.id]);
      await client.query("UPDATE public.employees SET user_id = $1 WHERE id = $2", [admin2.user_id, emp.id]);

      await setAuthUser(client, admin2.user_id);
      const { rows: [resEmp] } = await client.query(
        "SELECT public.can_read_document($1, $2, $3, $4) as can",
        [org.id, doc.branch_id, JSON.stringify(doc.access_scope), doc.id]
      );
      console.log(`${doc.title.padEnd(45)} | Admin: ${resAdmin.can ? "✅" : "❌"} | Emp: ${resEmp.can ? "✅" : "❌"}`);
      await client.query("ROLLBACK");
    }

    // --- TEST CHECKLISTS ---
    console.log("\n--- TEST CHECKLISTS ---");
    const { rows: checklists } = await client.query(`
      SELECT id, name, branch_id, department_id, target_scope FROM public.checklist_templates WHERE organization_id = $1 LIMIT 5
    `, [org.id]);

    for (const ck of checklists) {
      await client.query("BEGIN");
      // Admin check
      await setAuthUser(client, admin1.user_id);
      const { rows: [resAdmin] } = await client.query(
        "SELECT public.can_read_checklist_template($1, $2, $3, $4::jsonb) as can",
        [org.id, ck.branch_id, ck.department_id, JSON.stringify(ck.target_scope)]
      );

      // Emp check
      await client.query(`
        UPDATE public.memberships SET role_id = (SELECT id FROM public.roles WHERE code = 'employee'), branch_id = $2 WHERE user_id = $1 AND organization_id = $3
      `, [admin2.user_id, emp.branch_id, org.id]);
      await client.query("UPDATE public.employees SET user_id = $1 WHERE id = $2", [admin2.user_id, emp.id]);

      await setAuthUser(client, admin2.user_id);
      const { rows: [resEmp] } = await client.query(
        "SELECT public.can_read_checklist_template($1, $2, $3, $4::jsonb) as can",
        [org.id, ck.branch_id, ck.department_id, JSON.stringify(ck.target_scope)]
      );
      console.log(`${ck.name.padEnd(45)} | Admin: ${resAdmin.can ? "✅" : "❌"} | Emp: ${resEmp.can ? "✅" : "❌"}`);
      await client.query("ROLLBACK");
    }

    console.log("\n✅ Verificación finalizada.");

  } catch (error) {
    console.error("❌ Error Crítico:", error.message);
  } finally {
    await client.end();
  }
}

main();

import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getOrCreateAuthUser(email, password) {
  console.log(`Checking/Creating auth user: ${email}`);
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw error;

  const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (found) {
    await supabaseAdmin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    return found;
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;
  return created.user;
}

async function run() {
  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  try {
    const timestamp = Date.now();
    const orgName = `E2E Master Corp ${timestamp}`;
    const slug = `e2e-master-${timestamp}`;
    const password = "TestPassword#123!";
    
    console.log(`Creating Organization: ${orgName}`);
    const { rows: orgRows } = await db.query(
      `INSERT INTO public.organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id`,
      [orgName, slug]
    );
    const orgId = orgRows[0].id;

    // Enable Modules
    const modules = ['employees', 'announcements', 'checklists', 'documents'];
    const { rows: moduleRows } = await db.query(`SELECT id, code FROM public.module_catalog WHERE code = ANY($1)`, [modules]);
    for (const m of moduleRows) {
      await db.query(`INSERT INTO public.organization_modules (organization_id, module_id, is_enabled) VALUES ($1, $2, true)`, [orgId, m.id]);
    }

    // Role IDs
    const { rows: roleRows } = await db.query(`SELECT code, id FROM public.roles WHERE code IN ('company_admin', 'employee')`);
    const roleMap = new Map(roleRows.map(r => [r.code, r.id]));

    // 1. Company Admin
    const adminEmail = `e2e.admin.${timestamp}@getbackplate.local`;
    const adminUser = await getOrCreateAuthUser(adminEmail, password);
    await db.query(
      `INSERT INTO public.memberships (organization_id, user_id, role_id, status) VALUES ($1, $2, $3, 'active')`,
      [orgId, adminUser.id, roleMap.get('company_admin')]
    );
    await db.query(
      `INSERT INTO public.organization_user_profiles (organization_id, user_id, email, first_name, last_name, is_employee, status, source) 
       VALUES ($1, $2, $3, 'E2E', 'Admin', false, 'active', 'manual')`,
      [orgId, adminUser.id, adminEmail]
    );

    // 2. 4 Branches
    const branches = ['Norte', 'Sur', 'Este', 'Oeste'];
    const branchIds = [];
    for (const b of branches) {
      const res = await db.query(`INSERT INTO public.branches (organization_id, name, is_active) VALUES ($1, $2, true) RETURNING id`, [orgId, b]);
      branchIds.push(res.rows[0].id);
    }

    // 3. 4 Departments
    const depts = ['Administración', 'Cocina', 'Salón', 'Logística'];
    const deptIds = [];
    for (const d of depts) {
      const res = await db.query(`INSERT INTO public.organization_departments (organization_id, name, is_active) VALUES ($1, $2, true) RETURNING id`, [orgId, d]);
      deptIds.push(res.rows[0].id);
    }

    // 4. 4 Positions (one per dept)
    const positions = [
        { name: 'Gerente', deptIdx: 0 },
        { name: 'Chef', deptIdx: 1 },
        { name: 'Mozo', deptIdx: 2 },
        { name: 'Chofer', deptIdx: 3 }
    ];
    const posIds = [];
    for (const p of positions) {
      const res = await db.query(
        `INSERT INTO public.department_positions (organization_id, department_id, name, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
        [orgId, deptIds[p.deptIdx], p.name]
      );
      posIds.push(res.rows[0].id);
    }

    // 5. 4 Employees
    const empData = [
        { firstName: 'E2E', lastName: 'Emp1', branchIdx: 0, posIdx: 0, email: `e2e.emp1.${timestamp}@getbackplate.local` },
        { firstName: 'E2E', lastName: 'Emp2', branchIdx: 1, posIdx: 1, email: `e2e.emp2.${timestamp}@getbackplate.local` },
        { firstName: 'E2E', lastName: 'Emp3', branchIdx: 2, posIdx: 2, email: `e2e.emp3.${timestamp}@getbackplate.local` },
        { firstName: 'E2E', lastName: 'Emp4', branchIdx: 3, posIdx: 3, email: `e2e.emp4.${timestamp}@getbackplate.local` }
    ];

    const results = {
        orgId,
        adminEmail,
        password,
        employees: []
    };

    for (let i = 0; i < empData.length; i++) {
      const data = empData[i];
      const authUser = await getOrCreateAuthUser(data.email, password);
      
      const { rows: empRows } = await db.query(
        `INSERT INTO public.employees (organization_id, user_id, first_name, last_name, email, status, branch_id, department_id, position) 
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8) RETURNING id`,
        [orgId, authUser.id, data.firstName, data.lastName, data.email, branchIds[data.branchIdx], deptIds[i], positions[i].name]
      );
      const empId = empRows[0].id;

      await db.query(
        `INSERT INTO public.memberships (organization_id, user_id, role_id, status, branch_id) VALUES ($1, $2, $3, 'active', $4)`,
        [orgId, authUser.id, roleMap.get('employee'), branchIds[data.branchIdx]]
      );

      await db.query(
        `INSERT INTO public.organization_user_profiles (organization_id, user_id, employee_id, email, first_name, last_name, is_employee, status, source, branch_id, department_id) 
         VALUES ($1, $2, $3, $4, $5, $6, true, 'active', 'manual', $7, $8)`,
        [orgId, authUser.id, empId, data.email, data.firstName, data.lastName, branchIds[data.branchIdx], deptIds[i]]
      );

      await db.query(`INSERT INTO public.user_preferences (organization_id, user_id, onboarding_seen_at) VALUES ($1, $2, now())`, [orgId, authUser.id]);

      results.employees.push({
          email: data.email,
          name: `${data.firstName} ${data.lastName}`,
          branch: branches[data.branchIdx],
          dept: depts[i],
          pos: positions[i].name
      });
    }

    console.log("\n--- SETUP COMPLETE ---");
    console.log(JSON.stringify(results, null, 2));

  } finally {
    await db.end();
  }
}

run().catch(console.error);

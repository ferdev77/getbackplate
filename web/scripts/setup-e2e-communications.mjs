#!/usr/bin/env node

import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const COMPANY_EMAIL = process.env.E2E_COMPANY_EMAIL || "e2e.company.tests@getbackplate.local";
const COMPANY_PASSWORD = process.env.E2E_COMPANY_PASSWORD || "TestPassword#123!";

const EMPLOYEES = [
  {
    email: process.env.E2E_EMP1_EMAIL || "e2e.emp1@getbackplate.local",
    password: process.env.E2E_EMP1_PASSWORD || "TestPassword#123!",
    firstName: "E2E",
    lastName: "Emp1"
  },
  {
    email: process.env.E2E_EMP2_EMAIL || "e2e.emp2@getbackplate.local",
    password: process.env.E2E_EMP2_PASSWORD || "TestPassword#123!",
    firstName: "E2E",
    lastName: "Emp2"
  },
  {
    email: process.env.E2E_EMP3_EMAIL || "e2e.emp3@getbackplate.local",
    password: process.env.E2E_EMP3_PASSWORD || "TestPassword#123!",
    firstName: "E2E",
    lastName: "Emp3"
  },
  {
    email: process.env.E2E_EMP4_EMAIL || "e2e.emp4@getbackplate.local",
    password: process.env.E2E_EMP4_PASSWORD || "TestPassword#123!",
    firstName: "E2E",
    lastName: "Emp4"
  }
];

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getOrCreateAuthUser(email, password) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`No se pudo listar usuarios auth: ${error.message}`);
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
      });
      if (updateError) {
        throw new Error(`No se pudo actualizar password para ${email}: ${updateError.message}`);
      }
      return found;
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error(`No se pudo crear usuario auth ${email}: ${createError?.message ?? "error"}`);
  }

  return created.user;
}

async function run() {
  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, 
  });

  await db.connect();

  try {
    const { rows: orgRows } = await db.query(
      `
        select o.id, o.name
        from public.organizations o
        join public.organization_modules om on om.organization_id = o.id and om.is_enabled = true
        join public.module_catalog mc on mc.id = om.module_id and mc.code = 'employees'
        where o.status = 'active'
        order by o.created_at asc
        limit 1
      `,
    );

    const org = orgRows[0];
    if (!org?.id) {
      throw new Error("No hay organizacion activa con modulo employees habilitado.");
    }

    const { rows: roleRows } = await db.query(
      `select code, id from public.roles where code in ('company_admin', 'employee')`,
    );
    const roleByCode = new Map(roleRows.map((row) => [row.code, row.id]));
    const companyAdminRoleId = roleByCode.get("company_admin");
    const employeeRoleId = roleByCode.get("employee");

    if (!companyAdminRoleId || !employeeRoleId) {
      throw new Error("Faltan roles base company_admin/employee.");
    }

    const companyUser = await getOrCreateAuthUser(COMPANY_EMAIL, COMPANY_PASSWORD);

    const { rows: branchRows } = await db.query(
      `
        select id
        from public.branches
        where organization_id = $1
          and is_active = true
        order by created_at asc
        limit 1
      `,
      [org.id],
    );
    const qaBranchId = branchRows[0]?.id ?? null;

    await db.query(
      `
        insert into public.memberships (organization_id, user_id, role_id, status, branch_id)
        values ($1, $2, $3, 'active', $4)
        on conflict (organization_id, user_id)
        do update set role_id = excluded.role_id, status = 'active', branch_id = excluded.branch_id
      `,
      [org.id, companyUser.id, companyAdminRoleId, qaBranchId],
    );

    const companyProfileUpdate = await db.query(
      `
        update public.organization_user_profiles
        set
          email = $3,
          first_name = 'E2E',
          last_name = 'CompanyAdmin',
          is_employee = false,
          status = 'active',
          source = 'manual'
        where organization_id = $1
          and user_id = $2
      `,
      [org.id, companyUser.id, COMPANY_EMAIL],
    );
    if (companyProfileUpdate.rowCount === 0) {
      await db.query(
        `
          insert into public.organization_user_profiles (
            organization_id, user_id, email, first_name, last_name, is_employee, status, source
          )
          values ($1, $2, $3, 'E2E', 'CompanyAdmin', false, 'active', 'manual')
        `,
        [org.id, companyUser.id, COMPANY_EMAIL],
      );
    }

    const { rows: deptRows } = await db.query(
        `
          select id as department_id
          from public.organization_departments
          where organization_id = $1
            and is_active = true
          order by created_at asc
          limit 1
        `,
        [org.id],
    );
    const departmentId = deptRows[0]?.department_id ?? null;

    for (let i = 0; i < EMPLOYEES.length; i++) {
        const emp = EMPLOYEES[i];
        const employeeUser = await getOrCreateAuthUser(emp.email, emp.password);

        let employeeRow = null;

        const { rows: existingEmployeeRows } = await db.query(
          `
            select id, user_id, branch_id, department_id
            from public.employees
            where organization_id = $1
              and user_id = $2
            limit 1
          `,
          [org.id, employeeUser.id],
        );
        employeeRow = existingEmployeeRows[0] ?? null;

        if (!employeeRow) {
          const { rows: insertedEmployeeRows } = await db.query(
            `
              insert into public.employees (
                organization_id, user_id, first_name, last_name, email, status, branch_id, department_id
              )
              values ($1, $2, $3, $4, $5, 'active', $6, $7)
              returning id, user_id, branch_id, department_id
            `,
            [org.id, employeeUser.id, emp.firstName, emp.lastName, emp.email, qaBranchId, departmentId],
          );

          employeeRow = insertedEmployeeRows[0] ?? null;
        }

        if (!employeeRow?.id) {
          throw new Error(`No se pudo resolver/crear employee QA para E2E - ${emp.email}`);
        }

        await db.query(
          `
            insert into public.memberships (organization_id, user_id, role_id, status)
            values ($1, $2, $3, 'active')
            on conflict (organization_id, user_id)
            do update set role_id = excluded.role_id, status = 'active'
          `,
          [org.id, employeeUser.id, employeeRoleId],
        );

        const employeeProfileUpdate = await db.query(
          `
            update public.organization_user_profiles
            set
              employee_id = $3,
              email = $4,
              first_name = $7,
              last_name = $8,
              is_employee = true,
              status = 'active',
              source = 'manual',
              branch_id = $5,
              department_id = $6
            where organization_id = $1
              and user_id = $2
          `,
          [org.id, employeeUser.id, employeeRow.id, emp.email, employeeRow.branch_id, employeeRow.department_id, emp.firstName, emp.lastName],
        );
        if (employeeProfileUpdate.rowCount === 0) {
          await db.query(
            `
              insert into public.organization_user_profiles (
                organization_id, user_id, employee_id, email, first_name, last_name, is_employee, status, source, branch_id, department_id
              )
              values ($1, $2, $3, $4, $7, $8, true, 'active', 'manual', $5, $6)
            `,
            [org.id, employeeUser.id, employeeRow.id, emp.email, employeeRow.branch_id, employeeRow.department_id, emp.firstName, emp.lastName],
          );
        }

        // Bypass onboarding para empleados en E2E
        await db.query(`
            insert into public.user_preferences (organization_id, user_id, onboarding_seen_at)
            values ($1, $2, now())
            on conflict (organization_id, user_id)
            do update set onboarding_seen_at = excluded.onboarding_seen_at
        `, [org.id, employeeUser.id]);
    }


    console.log("\\n✅ E2E setup listo (Communications Flow)");
    console.log(`Organizacion: ${org.name} (${org.id})`);
    console.log("\\n=== Credenciales Configurados ===");
    console.log(`Empresa Admin  | Email: ${COMPANY_EMAIL} | Pass: ${COMPANY_PASSWORD}`);
    EMPLOYEES.forEach((e, idx) => {
        console.log(`Empleado ${idx + 1}     | Email: ${e.email} | Pass: ${e.password} | Nombre: ${e.firstName} ${e.lastName}`);
    });
    
    console.log("\\nPara correr los tests en local, asegúrate de tener estas variables de entorno en el archivo .env:");
    console.log(`E2E_ORG_ID=${org.id}`);
    console.log(`E2E_COMPANY_EMAIL=${COMPANY_EMAIL}`);
    console.log(`E2E_COMPANY_PASSWORD=${COMPANY_PASSWORD}`);
    EMPLOYEES.forEach((e, idx) => {
        console.log(`E2E_EMP${idx + 1}_EMAIL=${e.email}`);
        console.log(`E2E_EMP${idx + 1}_PASSWORD=${e.password}`);
        if(idx === 0) console.log(`E2E_EMP1_NAME=${e.firstName} ${e.lastName}`);
    });

  } finally {
    await db.end();
  }
}

run().catch((error) => {
  console.error(`\\nError: ${error.message}`);
  process.exit(1);
});

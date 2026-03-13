import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPaths = [
  path.resolve(__dirname, "../../supabase/migrations/202603110011_employee_contract_signing_fields.sql"),
  path.resolve(__dirname, "../../supabase/migrations/202603110012_document_security_and_processing.sql"),
  path.resolve(__dirname, "../../supabase/migrations/202603110013_org_departments_and_links.sql"),
];

const BRANCH_SEEDS = [
  { code: "long-beach", name: "Long Beach", city: "Long Beach", state: "MS", country: "Estados Unidos", address: "412 Oak Street" },
  { code: "biloxi", name: "Biloxi", city: "Biloxi", state: "MS", country: "Estados Unidos", address: "200 Casino Row" },
  { code: "saucier", name: "Saucier", city: "Saucier", state: "MS", country: "Estados Unidos", address: "88 Market Ave" },
];

const DOCUMENT_SEEDS = [
  { title: "Foto del Empleado - Referencia", filePath: "seed/empleados/foto-empleado.jpg", mime: "image/jpeg", size: 245000 },
  { title: "ID / Identificacion - Referencia", filePath: "seed/empleados/id-identificacion.pdf", mime: "application/pdf", size: 180000 },
  { title: "Numero de Seguro Social - Referencia", filePath: "seed/empleados/seguro-social.pdf", mime: "application/pdf", size: 125000 },
  { title: "Carta de Recomendacion 1 - Referencia", filePath: "seed/empleados/carta-recomendacion-1.pdf", mime: "application/pdf", size: 98000 },
  { title: "Carta de Recomendacion 2 - Referencia", filePath: "seed/empleados/carta-recomendacion-2.pdf", mime: "application/pdf", size: 102000 },
  { title: "Otro Documento - Referencia", filePath: "seed/empleados/otro-documento.pdf", mime: "application/pdf", size: 84000 },
];

const EMPLOYEE_SEEDS = [
  {
    firstName: "Carlos",
    lastName: "Mendoza",
    email: "carlos.mendoza.demo@getbackplate.local",
    phone: "228-555-0101",
    position: "Chef de Cocina",
    department: "Cocina",
    departmentCode: "cocina",
    status: "active",
    hiredAt: "2021-03-10",
    birthDate: "1990-04-15",
    sex: "male",
    nationality: "Mexicana",
    phoneCountryCode: "+52",
    addressLine1: "412 Oak Street",
    addressCity: "Long Beach",
    addressState: "MS",
    addressPostalCode: "39560",
    addressCountry: "Estados Unidos",
    emergencyName: "Maria Mendoza",
    emergencyPhone: "228-555-0102",
    emergencyEmail: "maria.mendoza@getbackplate.local",
    contractType: "Tiempo completo",
    contractStatus: "active",
    startDate: "2021-03-10",
    endDate: null,
    salaryAmount: 18,
    salaryCurrency: "USD",
    paymentFrequency: "hora",
    notes: "Especialidad en mariscos.",
    signerName: "Carlos Mendoza",
    signedAt: "2021-03-10",
  },
  {
    firstName: "Laura",
    lastName: "Reyes",
    email: "laura.reyes.demo@getbackplate.local",
    phone: "228-555-0201",
    position: "Mesera",
    department: "Sala",
    departmentCode: "sala",
    status: "vacation",
    hiredAt: "2022-06-01",
    birthDate: "1995-08-22",
    sex: "female",
    nationality: "Americana",
    phoneCountryCode: "+1",
    addressLine1: "88 Beach Blvd",
    addressCity: "Biloxi",
    addressState: "MS",
    addressPostalCode: "39530",
    addressCountry: "Estados Unidos",
    emergencyName: "Roberto Reyes",
    emergencyPhone: "228-555-0202",
    emergencyEmail: "roberto.reyes@getbackplate.local",
    contractType: "Medio tiempo",
    contractStatus: "active",
    startDate: "2022-06-01",
    endDate: null,
    salaryAmount: 12,
    salaryCurrency: "USD",
    paymentFrequency: "hora",
    notes: "Turno de tarde.",
    signerName: "Laura Reyes",
    signedAt: "2022-06-01",
  },
];

const CHECKLIST_NAME = "Apertura Cocina - Turno Manana";
const CHECKLIST_ITEMS = [
  "Verificar temperatura de heladeras",
  "Validar mise en place",
  "Revisar limpieza de superficies",
  "Confirmar stock de insumos criticos",
  "Encender equipos de coccion",
];

const DEPARTMENT_SEEDS = [
  { code: "cocina", name: "Cocina", description: "Operacion BOH" },
  { code: "sala", name: "Sala", description: "Operacion FOH" },
  { code: "gerencia", name: "Gerencia", description: "Administracion y supervision" },
  { code: "rrhh", name: "Recursos Humanos", description: "Gestion de personal" },
];

async function ensureMigration(client) {
  for (const migrationPath of migrationPaths) {
    const sql = await readFile(migrationPath, "utf8");
    await client.query(sql);
  }
}

async function ensureBranches(client, organizationId) {
  for (const branch of BRANCH_SEEDS) {
    const { rows: existingRows } = await client.query(
      `select id from public.branches where organization_id = $1 and code = $2 limit 1`,
      [organizationId, branch.code],
    );

    if (existingRows[0]?.id) {
      await client.query(
        `update public.branches
         set name = $3, city = $4, state = $5, country = $6, address = $7, is_active = true
         where organization_id = $1 and code = $2`,
        [organizationId, branch.code, branch.name, branch.city, branch.state, branch.country, branch.address],
      );
      continue;
    }

    await client.query(
      `insert into public.branches (organization_id, code, name, city, state, country, address, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,true)`,
      [organizationId, branch.code, branch.name, branch.city, branch.state, branch.country, branch.address],
    );
  }

  const { rows } = await client.query(
    `select id, code, name from public.branches where organization_id = $1 and code is not null`,
    [organizationId],
  );
  return new Map(rows.map((row) => [row.code, row.id]));
}

async function ensureDocuments(client, organizationId, branchId) {
  for (const doc of DOCUMENT_SEEDS) {
    await client.query(
      `insert into public.documents (organization_id, branch_id, title, file_path, mime_type, file_size_bytes, status)
       select $1,$2,$3,$4,$5,$6,'active'
       where not exists (
         select 1 from public.documents where organization_id = $1 and title = $3
       )`,
      [organizationId, branchId, doc.title, doc.filePath, doc.mime, doc.size],
    );
  }

  const { rows } = await client.query(
    `select id, title from public.documents where organization_id = $1 and title = any($2::text[])`,
    [organizationId, DOCUMENT_SEEDS.map((doc) => doc.title)],
  );
  return new Map(rows.map((row) => [row.title, row.id]));
}

async function ensureDepartments(client, organizationId, actorUserId) {
  for (const department of DEPARTMENT_SEEDS) {
    await client.query(
      `insert into public.organization_departments (organization_id, code, name, description, created_by, is_active)
       select $1,$2,$3,$4,$5,true
       where not exists (
         select 1 from public.organization_departments where organization_id = $1 and code = $2
       )`,
      [organizationId, department.code, department.name, department.description, actorUserId],
    );
  }

  const { rows } = await client.query(
    `select id, code, name from public.organization_departments where organization_id = $1 and is_active = true`,
    [organizationId],
  );
  return new Map(rows.map((row) => [row.code || row.name.toLowerCase(), row.id]));
}

async function ensureEmployees(client, organizationId, branchMap, departmentMap, documentMap, actorUserId) {
  const branchPreference = [branchMap.get("long-beach"), branchMap.get("biloxi"), branchMap.get("saucier")].filter(Boolean);
  const docIds = Array.from(documentMap.values());
  const employeeIds = [];

  for (let i = 0; i < EMPLOYEE_SEEDS.length; i += 1) {
    const seed = EMPLOYEE_SEEDS[i];
    const branchId = branchPreference[i % branchPreference.length] ?? null;
    const departmentId = (seed.departmentCode && departmentMap.get(seed.departmentCode)) || null;

    await client.query(
      `insert into public.employees (
         organization_id, branch_id, first_name, last_name, email, phone,
         position, department, status, hired_at, birth_date, sex, nationality,
         department_id,
         phone_country_code, address_line1, address_city, address_state,
         address_postal_code, address_country, emergency_contact_name,
         emergency_contact_phone, emergency_contact_email
       )
       select
         $1,$2,$3,$4,$5,$6,
         $7,$8,$9,$10,$11,$12,$13,
         $14,$15,$16,$17,$18,
         $19,$20,$21,
         $22,$23
       where not exists (
         select 1 from public.employees where organization_id = $1 and email = $5
       )`,
      [
        organizationId,
        branchId,
        seed.firstName,
        seed.lastName,
        seed.email,
        seed.phone,
        seed.position,
        seed.department,
        seed.status,
        seed.hiredAt,
        seed.birthDate,
        seed.sex,
        seed.nationality,
        departmentId,
        seed.phoneCountryCode,
        seed.addressLine1,
        seed.addressCity,
        seed.addressState,
        seed.addressPostalCode,
        seed.addressCountry,
        seed.emergencyName,
        seed.emergencyPhone,
        seed.emergencyEmail,
      ],
    );

    const { rows: employeeRows } = await client.query(
      `select id from public.employees where organization_id = $1 and email = $2 limit 1`,
      [organizationId, seed.email],
    );
    const employeeId = employeeRows[0]?.id;
    if (!employeeId) continue;
    employeeIds.push(employeeId);

    await client.query(
      `insert into public.employee_contracts (
         organization_id, employee_id, contract_type, contract_status,
         start_date, end_date, salary_amount, salary_currency, payment_frequency,
         notes, signer_name, signed_at, created_by
       )
       select
         $1,$2,$3,$4,
         $5,$6,$7,$8,$9,
         $10,$11,$12,$13
       where not exists (
         select 1 from public.employee_contracts where organization_id = $1 and employee_id = $2
       )`,
      [
        organizationId,
        employeeId,
        seed.contractType,
        seed.contractStatus,
        seed.startDate,
        seed.endDate,
        seed.salaryAmount,
        seed.salaryCurrency,
        seed.paymentFrequency,
        seed.notes,
        seed.signerName,
        seed.signedAt,
        actorUserId,
      ],
    );

    for (const docId of docIds.slice(0, 4)) {
      await client.query(
        `insert into public.employee_documents (organization_id, employee_id, document_id, status)
         values ($1,$2,$3,'approved')
         on conflict (employee_id, document_id) do nothing`,
        [organizationId, employeeId, docId],
      );
    }
  }

  return employeeIds;
}

async function ensureChecklistData(client, organizationId, branchMap, departmentMap, actorUserId) {
  const locationIds = [branchMap.get("long-beach"), branchMap.get("biloxi")].filter(Boolean);
  const cocinaDepartmentId = departmentMap.get("cocina") ?? null;

  await client.query(
    `insert into public.checklist_templates (
       organization_id, branch_id, name, checklist_type, is_active, shift, department, department_id, repeat_every, target_scope, created_by
     )
     select
       $1,$2,$3,'opening',true,'1er Shift','Cocina',$4,'daily',$5::jsonb,$6
     where not exists (
       select 1 from public.checklist_templates where organization_id = $1 and name = $3
     )`,
    [
      organizationId,
      locationIds[0] ?? null,
      CHECKLIST_NAME,
      cocinaDepartmentId,
      JSON.stringify({
        locations: locationIds,
        department_ids: cocinaDepartmentId ? [cocinaDepartmentId] : [],
        users: [],
        notify_via: ["whatsapp"],
        checklist_type_other: null,
      }),
      actorUserId,
    ],
  );

  const { rows: templateRows } = await client.query(
    `select id from public.checklist_templates where organization_id = $1 and name = $2 limit 1`,
    [organizationId, CHECKLIST_NAME],
  );
  const templateId = templateRows[0]?.id;
  if (!templateId) return;

  await client.query(
    `insert into public.checklist_template_sections (organization_id, template_id, name, sort_order)
     select $1,$2,'General',0
     where not exists (
       select 1 from public.checklist_template_sections where organization_id = $1 and template_id = $2 and name = 'General'
     )`,
    [organizationId, templateId],
  );

  const { rows: sectionRows } = await client.query(
    `select id from public.checklist_template_sections where organization_id = $1 and template_id = $2 and name = 'General' limit 1`,
    [organizationId, templateId],
  );
  const sectionId = sectionRows[0]?.id;
  if (!sectionId) return;

  for (let i = 0; i < CHECKLIST_ITEMS.length; i += 1) {
    const label = CHECKLIST_ITEMS[i];
    await client.query(
      `insert into public.checklist_template_items (organization_id, section_id, label, priority, sort_order)
       select $1,$2,$3,$4,$5
       where not exists (
         select 1 from public.checklist_template_items where organization_id = $1 and section_id = $2 and label = $3
       )`,
      [organizationId, sectionId, label, i < 2 ? "high" : "medium", i],
    );
  }

  if (!actorUserId) return;

  const { rows: submissionRows } = await client.query(
    `select id from public.checklist_submissions where organization_id = $1 and template_id = $2 limit 1`,
    [organizationId, templateId],
  );
  if (submissionRows[0]?.id) return;

  const { rows: insertedSubmission } = await client.query(
    `insert into public.checklist_submissions (
       organization_id, branch_id, template_id, submitted_by, status, submitted_at
     )
     values ($1,$2,$3,$4,'submitted',timezone('utc', now()))
     returning id`,
    [organizationId, locationIds[0] ?? null, templateId, actorUserId],
  );
  const submissionId = insertedSubmission[0]?.id;
  if (!submissionId) return;

  const { rows: items } = await client.query(
    `select id, sort_order from public.checklist_template_items where organization_id = $1 and section_id = $2 order by sort_order asc`,
    [organizationId, sectionId],
  );

  for (const item of items) {
    const isFlagged = item.sort_order === 1;
    const { rows: submissionItemRows } = await client.query(
      `insert into public.checklist_submission_items (
         organization_id, submission_id, template_item_id, is_checked, is_flagged
       )
       values ($1,$2,$3,$4,$5)
       returning id`,
      [organizationId, submissionId, item.id, !isFlagged, isFlagged],
    );

    const submissionItemId = submissionItemRows[0]?.id;
    if (!submissionItemId || !isFlagged) continue;

    await client.query(
      `insert into public.checklist_flags (
         organization_id, submission_item_id, reported_by, reason, status
       ) values ($1,$2,$3,$4,'open')`,
      [organizationId, submissionItemId, actorUserId, "Falta evidencia fotografica en apertura"],
    );
  }
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query("begin");
    await ensureMigration(client);

    const { rows: orgs } = await client.query("select id, name from public.organizations order by created_at asc");
    if (!orgs.length) {
      throw new Error("No hay organizaciones para sembrar datos demo.");
    }

    for (const org of orgs) {
      const { rows: actorRows } = await client.query(
        `select m.user_id
         from public.memberships m
         where m.organization_id = $1 and m.status = 'active'
         order by m.created_at asc
         limit 1`,
        [org.id],
      );
      const actorUserId = actorRows[0]?.user_id ?? null;

      const branchMap = await ensureBranches(client, org.id);
      const departmentMap = await ensureDepartments(client, org.id, actorUserId);
      const defaultBranchId = branchMap.get("long-beach") ?? branchMap.values().next().value ?? null;
      const documentMap = await ensureDocuments(client, org.id, defaultBranchId);
      await ensureEmployees(client, org.id, branchMap, departmentMap, documentMap, actorUserId);
      await ensureChecklistData(client, org.id, branchMap, departmentMap, actorUserId);
    }

    await client.query("commit");

    const { rows: counts } = await client.query(`
      select
        (select count(*) from public.branches) as branches,
        (select count(*) from public.documents) as documents,
        (select count(*) from public.employees) as employees,
        (select count(*) from public.employee_contracts) as employee_contracts,
        (select count(*) from public.organization_departments) as departments,
        (select count(*) from public.checklist_templates) as checklist_templates,
        (select count(*) from public.checklist_submissions) as checklist_submissions
    `);

    console.log("OK: migracion y seed operativo aplicados.");
    console.log(counts[0]);
  } catch (error) {
    await client.query("rollback");
    console.error("ERROR apply-seed-operational-demo:", error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();

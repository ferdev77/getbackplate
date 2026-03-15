/**
 * Seed Masivo de Prueba — GetBackplate SaaS
 *
 * Genera:
 * - 15 organizaciones (5 starter, 5 growth, 5 enterprise)
 * - 3 sucursales por org
 * - 3 departamentos por org con 2 posiciones cada uno
 * - 5 cuentas admin (user auth) por org → memberships company_admin
 * - 30 empleados por org (10 por sucursal) con contratos, distribuidos en departamentos
 *   y variados estados (active, inactive, vacation, leave)
 * - Documentos con alcance variado (global, por sucursal, por departamento, por usuario)
 * - Anuncios con alcance variado (global, por sucursal, por departamento, por posición, por usuario)
 * - Checklist templates con alcance variado + secciones + items
 * - Módulos habilitados por org
 *
 * Uso:
 *   node web/scripts/seed-massive-test.mjs
 *
 * Requiere SUPABASE_DB_POOLER_URL y SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL en .env.local
 */

import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ------------ env helpers ------------

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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan variables: SUPABASE_DB_POOLER_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ------------ data pools ------------

const INDUSTRIES = [
  "Gastronomía", "Retail", "Logística", "Hotelería", "Salud",
  "Construcción", "Educación", "Tecnología", "Manufactura", "Agroindustria",
  "Entretenimiento", "Transporte", "Limpieza Industrial", "Consultoría", "Fitness",
];

const CITIES = [
  { city: "Buenos Aires", state: "CABA", country: "Argentina" },
  { city: "Córdoba", state: "Córdoba", country: "Argentina" },
  { city: "Rosario", state: "Santa Fe", country: "Argentina" },
  { city: "Mendoza", state: "Mendoza", country: "Argentina" },
  { city: "Lima", state: "Lima", country: "Perú" },
  { city: "Santiago", state: "RM", country: "Chile" },
  { city: "Montevideo", state: "Montevideo", country: "Uruguay" },
  { city: "Bogotá", state: "Cundinamarca", country: "Colombia" },
  { city: "Ciudad de México", state: "CDMX", country: "México" },
];

const BRANCH_NAMES = ["Central", "Norte", "Sur"];

const DEPARTMENTS = [
  { code: "OPER", name: "Operaciones", positions: ["Operador", "Supervisor de Turno"] },
  { code: "ADMIN", name: "Administración", positions: ["Asistente Administrativo", "Contador"] },
  { code: "RRHH", name: "Recursos Humanos", positions: ["Analista RRHH", "Coordinador RRHH"] },
];

const FIRST_NAMES = [
  "Carlos", "María", "José", "Ana", "Luis", "Laura", "Juan", "Sofía",
  "Pedro", "Valentina", "Miguel", "Camila", "Diego", "Lucía", "Fernando",
  "Isabella", "Andrés", "Gabriela", "Ricardo", "Daniela", "Roberto", "Paula",
  "Eduardo", "Martina", "Alejandro", "Elena", "Nicolás", "Victoria", "Santiago", "Catalina",
  "Marcos", "Renata", "Gustavo", "Florencia", "Hugo", "Natalia", "Javier", "Carolina",
  "Raúl", "Agustina",
];

const LAST_NAMES = [
  "García", "Rodríguez", "Martínez", "López", "González", "Hernández", "Pérez",
  "Sánchez", "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Cruz",
  "Morales", "Reyes", "Ortiz", "Gutiérrez", "Castillo", "Ramos", "Mendoza", "Ruiz",
  "Vargas", "Molina", "Silva", "Rojas", "Arias", "Acosta", "Medina",
];

const STATUSES = ["active", "active", "active", "active", "inactive", "vacation", "leave"];

const CHECKLIST_TYPES = ["opening", "closing", "prep", "custom"];

const ANNOUNCEMENT_KINDS = ["general", "urgent", "reminder", "celebration"];

const DOCUMENT_TITLES = [
  "Manual de Procedimientos Operativos",
  "Política de Seguridad e Higiene",
  "Reglamento Interno de Trabajo",
  "Guía de Atención al Cliente",
  "Protocolo de Emergencias",
  "Manual de Inducción",
  "Código de Ética y Conducta",
  "Procedimiento de Cierre de Caja",
  "Política de Vacaciones y Licencias",
  "Plan de Capacitación Anual",
];

const ANNOUNCEMENT_TITLES = [
  "Actualización de Horarios",
  "Capacitación Obligatoria de Seguridad",
  "Reconocimiento al Equipo del Mes",
  "Cambio de Procedimiento Operativo",
  "Mantenimiento Programado de Sistemas",
  "Política Actualizada de Vestimenta",
  "Convocatoria a Reunión General",
  "Beneficio Exclusivo para Empleados",
  "Recordatorio: Inventario Trimestral",
  "Celebración de Aniversario de la Empresa",
];

const CHECKLIST_NAMES = [
  "Apertura de Local",
  "Cierre de Turno Nocturno",
  "Preparación de Área de Servicio",
  "Revisión de Inventario Diario",
  "Limpieza Profunda Semanal",
  "Inspección de Seguridad",
  "Verificación de Equipos",
  "Control de Calidad de Productos",
];

const CHECKLIST_SECTION_NAMES = ["General", "Seguridad", "Limpieza", "Equipamiento", "Documentación"];

const CHECKLIST_ITEM_LABELS = [
  "Verificar estado de cerraduras y accesos",
  "Revisar temperatura de equipos de refrigeración",
  "Confirmar stock mínimo de insumos críticos",
  "Limpiar y desinfectar superficie de trabajo",
  "Registrar lectura de contadores de energía",
  "Verificar uniforme completo del personal",
  "Revisar botiquín de primeros auxilios",
  "Confirmar funcionamiento de sistema de cámaras",
  "Registrar novedades del turno anterior",
  "Verificar señalización de emergencia",
  "Confirmar registro de asistencia del turno",
  "Inspeccionar baños y áreas comunes",
  "Revisar estado de extintores",
  "Validar funcionamiento de sistema de punto de venta",
  "Asegurar disposición correcta de residuos",
];

// ------------ helpers ------------

let emailCounter = 0;
function uniqueEmail(prefix) {
  emailCounter += 1;
  return `${prefix}${emailCounter}@getbackplate-test.com`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function randomDate(startYear, endYear) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + Math.random() * (end - start)).toISOString().slice(0, 10);
}

function randomSalary() {
  const base = Math.floor(Math.random() * 4000 + 800);
  return (Math.round(base / 50) * 50).toFixed(2);
}

async function createAuthUser(email, password) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    // If the user already exists, try to get the ID
    if (errText.includes("already been registered") || errText.includes("already exists")) {
      const listResp = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?filter=email%3Deq.${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
        },
      );
      if (listResp.ok) {
        const listData = await listResp.json();
        const found = (listData.users || []).find((u) => u.email === email);
        if (found) return found.id;
      }
      throw new Error(`User ${email} already exists but couldn't get ID: ${errText}`);
    }
    throw new Error(`Failed to create auth user ${email}: ${errText}`);
  }

  const data = await resp.json();
  return data.id;
}

// ------------ main seed logic ------------

async function main() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Conectado a la base de datos");

  try {
    // ---- Fetch catalog IDs ----
    const { rows: planRows } = await client.query("SELECT id, code FROM public.plans");
    const planMap = Object.fromEntries(planRows.map((r) => [r.code, r.id]));

    const { rows: roleRows } = await client.query("SELECT id, code FROM public.roles");
    const roleMap = Object.fromEntries(roleRows.map((r) => [r.code, r.id]));

    const { rows: moduleRows } = await client.query("SELECT id, code FROM public.module_catalog");
    const moduleMap = Object.fromEntries(moduleRows.map((r) => [r.code, r.id]));

    console.log("Catálogos cargados:", {
      planes: Object.keys(planMap),
      roles: Object.keys(roleMap),
      módulos: Object.keys(moduleMap),
    });

    const planDistribution = [
      ...Array(5).fill("starter"),
      ...Array(5).fill("growth"),
      ...Array(5).fill("enterprise"),
    ];

    const stats = {
      orgs: 0, users: 0, employees: 0,
      announcements: 0, documents: 0, checklists: 0,
    };

    // ---- For each of the 15 organizations ----
    for (let orgIndex = 0; orgIndex < 15; orgIndex++) {
      const planCode = planDistribution[orgIndex];
      const industry = INDUSTRIES[orgIndex];
      const orgName = `${industry} Corp #${orgIndex + 1}`;
      const orgSlug = `${industry.toLowerCase().replace(/[^a-z0-9]/g, "")}-${orgIndex + 1}`;
      const cityInfo = CITIES[orgIndex % CITIES.length];

      console.log(`\n📦 [${orgIndex + 1}/15] Creando organización: ${orgName} (plan: ${planCode})`);

      await client.query("BEGIN");

      try {
        // ---- Create organization ----
        const { rows: [org] } = await client.query(
          `INSERT INTO public.organizations (name, slug, legal_name, status, plan_id, country_code, timezone)
           VALUES ($1, $2, $3, 'active', $4, $5, 'America/Argentina/Buenos_Aires')
           RETURNING id`,
          [orgName, orgSlug, `${orgName} S.A.`, planMap[planCode], cityInfo.country === "Argentina" ? "AR" : "XX"],
        );

        const orgId = org.id;
        stats.orgs++;

        // ---- Org limits ----
        const limits = {
          starter: { branches: 3, users: 10, storage: 1024, employees: 50 },
          growth: { branches: 10, users: 30, storage: 5120, employees: 200 },
          enterprise: { branches: 50, users: 100, storage: 20480, employees: 1000 },
        }[planCode];

        await client.query(
          `INSERT INTO public.organization_limits (organization_id, max_branches, max_users, max_storage_mb, max_employees)
           VALUES ($1, $2, $3, $4, $5)`,
          [orgId, limits.branches, limits.users, limits.storage, limits.employees],
        );

        // ---- Enable modules ----
        for (const modCode of Object.keys(moduleMap)) {
          await client.query(
            `INSERT INTO public.organization_modules (organization_id, module_id, is_enabled, enabled_at)
             VALUES ($1, $2, true, timezone('utc', now()))
             ON CONFLICT (organization_id, module_id) DO UPDATE SET is_enabled = true`,
            [orgId, moduleMap[modCode]],
          );
        }

        // ---- Create 3 branches ----
        const branchIds = [];
        for (let b = 0; b < 3; b++) {
          const branchCity = CITIES[(orgIndex * 3 + b) % CITIES.length];
          const { rows: [branch] } = await client.query(
            `INSERT INTO public.branches (organization_id, code, name, city, state, country, address, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)
             RETURNING id`,
            [orgId, `SUC-${b + 1}`, `${BRANCH_NAMES[b]} ${branchCity.city}`, branchCity.city, branchCity.state, branchCity.country, `Av. Principal ${100 + b * 200}`],
          );
          branchIds.push(branch.id);
        }

        // ---- Create 3 departments + 2 positions each ----
        const deptIds = [];
        const positionIds = [];
        const positionNames = [];

        for (const dept of DEPARTMENTS) {
          const { rows: [d] } = await client.query(
            `INSERT INTO public.organization_departments (organization_id, code, name, description, is_active)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id`,
            [orgId, dept.code, dept.name, `Departamento de ${dept.name}`],
          );
          deptIds.push(d.id);

          for (const posName of dept.positions) {
            const { rows: [pos] } = await client.query(
              `INSERT INTO public.department_positions (organization_id, department_id, name, is_active)
               VALUES ($1, $2, $3, true)
               RETURNING id`,
              [orgId, d.id, posName],
            );
            positionIds.push(pos.id);
            positionNames.push(posName);
          }
        }

        // ---- Create 5 admin auth users + memberships ----
        const adminUserIds = [];
        for (let a = 0; a < 5; a++) {
          const email = uniqueEmail(`admin-org${orgIndex + 1}-user`);
          const password = "TestAdmin123!";

          console.log(`  👤 Admin ${a + 1}/5: ${email}`);
          const userId = await createAuthUser(email, password);
          adminUserIds.push(userId);
          stats.users++;

          const branchId = branchIds[a % branchIds.length];

          await client.query(
            `INSERT INTO public.memberships (organization_id, user_id, role_id, branch_id, status)
             VALUES ($1, $2, $3, $4, 'active')
             ON CONFLICT (organization_id, user_id) DO UPDATE SET role_id = $3, branch_id = $4, status = 'active'`,
            [orgId, userId, roleMap.company_admin, branchId],
          );
        }

        // ---- Create 30 employees (10 per branch) ----
        const employeeIds = [];
        const employeeData = []; // { id, branchId, deptId, position, userId? }

        for (let e = 0; e < 30; e++) {
          const branchIdx = Math.floor(e / 10);
          const branchId = branchIds[branchIdx];
          const deptIdx = e % DEPARTMENTS.length;
          const deptId = deptIds[deptIdx];
          const posIdx = deptIdx * 2 + (e % 2);
          const position = DEPARTMENTS[deptIdx].positions[e % 2];

          const firstName = FIRST_NAMES[(orgIndex * 30 + e) % FIRST_NAMES.length];
          const lastName = LAST_NAMES[(orgIndex * 30 + e) % LAST_NAMES.length];
          const email = uniqueEmail(`emp-org${orgIndex + 1}`);
          const status = STATUSES[(orgIndex + e) % STATUSES.length];

          const { rows: [emp] } = await client.query(
            `INSERT INTO public.employees (
               organization_id, branch_id, employee_code, first_name, last_name,
               email, phone, position, department, department_id, status, hired_at,
               birth_date, sex, nationality, address_line1, address_city, address_state, address_country,
               emergency_contact_name, emergency_contact_phone, emergency_contact_email
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
             RETURNING id`,
            [
              orgId, branchId, `EMP-${orgIndex + 1}-${String(e + 1).padStart(3, "0")}`,
              firstName, lastName,
              email, `+54911${String(Math.floor(Math.random() * 90000000 + 10000000))}`,
              position, DEPARTMENTS[deptIdx].name, deptId,
              status, randomDate(2018, 2025),
              randomDate(1975, 2000), // birth_date
              e % 2 === 0 ? "M" : "F", // sex
              pick(["Argentina", "Perú", "Chile", "Uruguay", "Colombia", "México"]),
              `Calle ${Math.floor(Math.random() * 9000 + 1000)}`,
              CITIES[(orgIndex + e) % CITIES.length].city,
              CITIES[(orgIndex + e) % CITIES.length].state,
              CITIES[(orgIndex + e) % CITIES.length].country,
              pick(FIRST_NAMES) + " " + pick(LAST_NAMES),
              `+54911${String(Math.floor(Math.random() * 90000000 + 10000000))}`,
              uniqueEmail("emergencia"),
            ],
          );

          employeeIds.push(emp.id);
          employeeData.push({ id: emp.id, branchId, deptId, deptIdx, position, posIdx });
          stats.employees++;

          // ---- Contract for each employee ----
          await client.query(
            `INSERT INTO public.employee_contracts (
               organization_id, employee_id, contract_type, contract_status,
               start_date, salary_amount, salary_currency, payment_frequency, created_by
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              orgId, emp.id,
              pick(["full_time", "part_time", "contractor"]),
              status === "active" ? "active" : pick(["draft", "ended"]),
              randomDate(2019, 2025),
              randomSalary(), "USD",
              pick(["monthly", "biweekly", "weekly"]),
              adminUserIds[0],
            ],
          );
        }

        // ---- DOCUMENTS (10 per org, with varied scopes) ----
        console.log("  📄 Creando documentos con alcance variado...");
        const docIds = [];
        for (let d = 0; d < 10; d++) {
          let accessScope;
          let branchId = null;
          const targetTitle = DOCUMENT_TITLES[d];

          if (d < 2) {
            // GLOBAL — scope vacío (todos ven)
            accessScope = {};
          } else if (d < 4) {
            // Por SUCURSAL — solo una sucursal
            branchId = branchIds[d % branchIds.length];
            accessScope = { locations: [branchIds[d % branchIds.length]] };
          } else if (d < 6) {
            // Por DEPARTAMENTO
            accessScope = { department_ids: [deptIds[d % deptIds.length]] };
          } else if (d < 8) {
            // Por POSICIÓN
            accessScope = { position_ids: [positionIds[d % positionIds.length]] };
          } else {
            // Por USUARIO específico (primer y segundo admin)
            accessScope = { users: [adminUserIds[0], adminUserIds[1]] };
          }

          const { rows: [doc] } = await client.query(
            `INSERT INTO public.documents (
               organization_id, branch_id, owner_user_id, title, file_path,
               mime_type, file_size_bytes, status, access_scope
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8::jsonb)
             RETURNING id`,
            [
              orgId, branchId, adminUserIds[0],
              `[Org${orgIndex + 1}] ${targetTitle}`,
              `tenants/${orgId}/documents/doc-${d + 1}.pdf`,
              "application/pdf",
              Math.floor(Math.random() * 500000 + 10000),
              JSON.stringify(accessScope),
            ],
          );
          docIds.push(doc.id);
          stats.documents++;

          // Assign some documents to employees
          const assignCount = Math.min(3, employeeIds.length);
          for (let ae = 0; ae < assignCount; ae++) {
            const empId = employeeIds[(d * 3 + ae) % employeeIds.length];
            await client.query(
              `INSERT INTO public.employee_documents (organization_id, employee_id, document_id, status)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (employee_id, document_id) DO NOTHING`,
              [orgId, empId, doc.id, pick(["pending", "approved", "rejected"])],
            );
          }
        }

        // ---- ANNOUNCEMENTS (10 per org, with varied scopes) ----
        console.log("  📢 Creando anuncios con alcance variado...");
        for (let a = 0; a < 10; a++) {
          let targetScope;
          let branchId = null;
          const kind = ANNOUNCEMENT_KINDS[a % ANNOUNCEMENT_KINDS.length];
          const title = ANNOUNCEMENT_TITLES[a];

          if (a < 2) {
            // GLOBAL — scope vacío (todos ven)
            targetScope = {};
            branchId = null;
          } else if (a < 4) {
            // Por SUCURSAL
            branchId = branchIds[a % branchIds.length];
            targetScope = { locations: [branchIds[a % branchIds.length]] };
          } else if (a < 6) {
            // Por DEPARTAMENTO
            targetScope = { department_ids: [deptIds[a % deptIds.length]] };
          } else if (a < 8) {
            // Por POSICIÓN
            targetScope = { position_ids: [positionIds[a % positionIds.length]] };
          } else {
            // Por USUARIO específico
            targetScope = { users: [adminUserIds[a % adminUserIds.length]] };
          }

          const expiresAt = a % 3 === 0 ? null : new Date(Date.now() + (7 + a) * 86400000).toISOString();

          const { rows: [ann] } = await client.query(
            `INSERT INTO public.announcements (
               organization_id, branch_id, created_by, title, body, kind,
               is_featured, publish_at, expires_at, target_scope
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, timezone('utc', now()), $8, $9::jsonb)
             RETURNING id`,
            [
              orgId, branchId, adminUserIds[0],
              `[Org${orgIndex + 1}] ${title}`,
              `${title}: comunicado interno para la organización ${orgName}. Este aviso contiene información relevante para el personal según el alcance configurado.`,
              kind,
              a < 2, // featured only for global
              expiresAt,
              JSON.stringify(targetScope),
            ],
          );
          stats.announcements++;

          // ---- Audiences for each announcement ----
          if (a < 2) {
            // Global → null audience (everyone)
            await client.query(
              `INSERT INTO public.announcement_audiences (organization_id, announcement_id, branch_id, user_id)
               VALUES ($1, $2, null, null)`,
              [orgId, ann.id],
            );
          } else if (a < 4) {
            // Per-branch audience
            await client.query(
              `INSERT INTO public.announcement_audiences (organization_id, announcement_id, branch_id, user_id)
               VALUES ($1, $2, $3, null)`,
              [orgId, ann.id, branchIds[a % branchIds.length]],
            );
          } else if (a >= 8) {
            // Per-user audience
            await client.query(
              `INSERT INTO public.announcement_audiences (organization_id, announcement_id, branch_id, user_id)
               VALUES ($1, $2, null, $3)`,
              [orgId, ann.id, adminUserIds[a % adminUserIds.length]],
            );
          } else {
            // Department/position scope → global audience (scope filter handles it)
            await client.query(
              `INSERT INTO public.announcement_audiences (organization_id, announcement_id, branch_id, user_id)
               VALUES ($1, $2, null, null)`,
              [orgId, ann.id],
            );
          }
        }

        // ---- CHECKLISTS (8 templates per org, varied scopes) ----
        console.log("  ✅ Creando checklists con alcance variado...");
        for (let c = 0; c < 8; c++) {
          let targetScope;
          let branchId = branchIds[c % branchIds.length];
          let deptId = null;
          const checklistType = CHECKLIST_TYPES[c % CHECKLIST_TYPES.length];

          if (c < 2) {
            // GLOBAL — all branches
            branchId = null;
            targetScope = {};
          } else if (c < 4) {
            // Per-BRANCH
            targetScope = { locations: [branchId] };
          } else if (c < 6) {
            // Per-DEPARTMENT
            deptId = deptIds[c % deptIds.length];
            targetScope = { department_ids: [deptId] };
          } else {
            // Per-POSITION
            targetScope = { position_ids: [positionIds[c % positionIds.length]] };
          }

          const { rows: [tmpl] } = await client.query(
            `INSERT INTO public.checklist_templates (
               organization_id, branch_id, name, checklist_type, is_active,
               shift, department, department_id, repeat_every, target_scope, created_by
             )
             VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9::jsonb, $10)
             RETURNING id`,
            [
              orgId, branchId,
              `[Org${orgIndex + 1}] ${CHECKLIST_NAMES[c]}`,
              checklistType,
              pick(["1er Turno", "2do Turno", "Turno Noche"]),
              deptId ? DEPARTMENTS[c % DEPARTMENTS.length].name : null,
              deptId,
              pick(["daily", "weekly", "monthly"]),
              JSON.stringify(targetScope),
              adminUserIds[0],
            ],
          );
          stats.checklists++;

          // ---- 2-3 sections per template ----
          const sectionCount = 2 + (c % 2);
          for (let s = 0; s < sectionCount; s++) {
            const sectionName = CHECKLIST_SECTION_NAMES[(c + s) % CHECKLIST_SECTION_NAMES.length];
            const { rows: [section] } = await client.query(
              `INSERT INTO public.checklist_template_sections (organization_id, template_id, name, sort_order)
               VALUES ($1, $2, $3, $4)
               RETURNING id`,
              [orgId, tmpl.id, sectionName, s],
            );

            // ---- 3-5 items per section ----
            const itemCount = 3 + (c % 3);
            for (let i = 0; i < itemCount; i++) {
              const label = CHECKLIST_ITEM_LABELS[(c * 5 + s * 3 + i) % CHECKLIST_ITEM_LABELS.length];
              await client.query(
                `INSERT INTO public.checklist_template_items (organization_id, section_id, label, priority, sort_order)
                 VALUES ($1, $2, $3, $4, $5)`,
                [orgId, section.id, label, pick(["low", "medium", "high"]), i],
              );
            }
          }
        }

        await client.query("COMMIT");
        console.log(`  ✅ Organización ${orgName} creada correctamente.`);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`  ❌ Error en org ${orgIndex + 1}: ${error.message}`);
        // Continue with next org
      }
    }

    // ---- Final Report ----
    console.log("\n" + "=".repeat(60));
    console.log("📊 RESUMEN FINAL DEL SEED MASIVO");
    console.log("=".repeat(60));
    console.log(`  Organizaciones creadas:  ${stats.orgs}`);
    console.log(`  Usuarios auth creados:   ${stats.users}`);
    console.log(`  Empleados creados:       ${stats.employees}`);
    console.log(`  Documentos creados:      ${stats.documents}`);
    console.log(`  Anuncios creados:        ${stats.announcements}`);
    console.log(`  Checklists creados:      ${stats.checklists}`);
    console.log("=".repeat(60));

    // ---- Verify totals from DB ----
    const { rows: [totals] } = await client.query(`
      SELECT
        (SELECT count(*) FROM public.organizations) as orgs,
        (SELECT count(*) FROM public.employees) as employees,
        (SELECT count(*) FROM public.documents) as documents,
        (SELECT count(*) FROM public.announcements) as announcements,
        (SELECT count(*) FROM public.checklist_templates) as checklists,
        (SELECT count(*) FROM public.memberships) as memberships
    `);
    console.log("\n📈 Totales en BD (incluyendo datos previos):", totals);
  } catch (error) {
    console.error("Error crítico:", error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
    console.log("\n🔌 Conexión cerrada.");
  }
}

main();

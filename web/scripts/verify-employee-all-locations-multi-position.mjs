#!/usr/bin/env node

import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TARGET_ORG_ID = process.env.TARGET_ORG_ID || "8da3a42f-c16e-4b31-96aa-d1fab4ec996f";
const TARGET_ORG_SLUG = process.env.TARGET_ORG_SLUG || "puntos-cardinales";
const CLEANUP = process.env.CLEANUP_TEST_DATA !== "false";
const RUN_TAG = process.env.RUN_TAG || `all-locations-multi-position-${Date.now()}`;
const TEST_PASSWORD = process.env.CARDINALES_PASSWORD || "12120204";

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL o DATABASE_URL en el entorno.");
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

function parseScope(value) {
  if (!value || typeof value !== "object") {
    return { locations: [], department_ids: [], position_ids: [], users: [] };
  }

  const raw = value;
  const toList = (input) => {
    if (!Array.isArray(input)) return [];
    return [...new Set(input.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))];
  };

  return {
    locations: toList(raw.locations),
    department_ids: toList(raw.department_ids),
    position_ids: toList(raw.position_ids),
    users: toList(raw.users),
  };
}

function canSubjectAccessScope(scopeValue, subject) {
  const scope = parseScope(scopeValue);
  if (scope.users.includes(subject.userId)) return true;

  const hasFilters =
    scope.locations.length > 0 ||
    scope.department_ids.length > 0 ||
    scope.position_ids.length > 0;

  if (!hasFilters) return true;

  const locationOk =
    scope.locations.length === 0
      ? true
      : Boolean(subject.locationId && scope.locations.includes(subject.locationId));

  const departmentOk =
    scope.department_ids.length === 0
      ? true
      : Boolean(subject.departmentId && scope.department_ids.includes(subject.departmentId));

  const positionOk =
    scope.position_ids.length === 0
      ? true
      : (subject.positionIds ?? []).some((positionId) => scope.position_ids.includes(positionId));

  return locationOk && departmentOk && positionOk;
}

function canReadWithLocationSet(scopeValue, baseSubject, locationIds) {
  if (!locationIds.length) {
    return canSubjectAccessScope(scopeValue, {
      ...baseSubject,
      locationId: null,
    });
  }

  return locationIds.some((locationId) =>
    canSubjectAccessScope(scopeValue, {
      ...baseSubject,
      locationId,
    }),
  );
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const created = {
    authUserId: null,
    employeeId: null,
    membershipId: null,
    profileId: null,
    posAId: null,
    posBId: null,
    posWrongId: null,
    tempDepartmentId: null,
    announcementGoodId: null,
    announcementBadId: null,
    documentGoodId: null,
    documentBadId: null,
    checklistGoodId: null,
    checklistBadId: null,
    checklistGoodSectionId: null,
    checklistGoodItemId: null,
  };
  let resolvedOrgId = TARGET_ORG_ID;

  await client.connect();

  try {
    const orgRes = TARGET_ORG_ID
      ? await client.query(
          "select id, name, slug from public.organizations where id = $1 limit 1",
          [TARGET_ORG_ID],
        )
      : await client.query(
          "select id, name, slug from public.organizations where slug = $1 limit 1",
          [TARGET_ORG_SLUG],
        );

    const org = orgRes.rows[0] ?? null;
    if (!org) {
      throw new Error("No se encontro la organizacion objetivo para el test.");
    }
    resolvedOrgId = org.id;

    const branchRes = await client.query(
      "select id, name from public.branches where organization_id = $1 and is_active = true order by name asc",
      [org.id],
    );
    const deptRes = await client.query(
      "select id, name from public.organization_departments where organization_id = $1 and is_active = true order by name asc limit 2",
      [org.id],
    );
    const roleRes = await client.query("select id from public.roles where code = 'employee' limit 1");
    const actorAdminRes = await client.query(
      `select m.user_id
       from public.memberships m
       join public.roles r on r.id = m.role_id
       where m.organization_id = $1 and m.status = 'active' and r.code = 'company_admin'
       order by m.created_at asc
       limit 1`,
      [org.id],
    );
    const actorAnyRes = await client.query(
      `select m.user_id
       from public.memberships m
       where m.organization_id = $1 and m.status = 'active'
       order by m.created_at asc
       limit 1`,
      [org.id],
    );

    const branches = branchRes.rows;
    if (branches.length < 2) throw new Error("Se requieren al menos 2 locaciones activas para este test.");

    const department = deptRes.rows[0] ?? null;
    if (!department) throw new Error("No se encontro un departamento activo en la organizacion objetivo.");

    let secondDepartment = deptRes.rows[1] ?? null;

    const employeeRole = roleRes.rows[0] ?? null;
    if (!employeeRole?.id) throw new Error("No se encontro el rol employee.");

    const actor = actorAdminRes.rows[0] ?? actorAnyRes.rows[0] ?? null;
    if (!actor?.user_id) throw new Error("No se encontro un usuario activo para owner de registros.");

    const email = `scope.allloc.${RUN_TAG}@cardinal.com`;
    const employeePositionName = `MULTI_SCOPE_${RUN_TAG}`;
    const wrongPositionName = `MULTI_SCOPE_WRONG_${RUN_TAG}`;

    const authCreate = await supabase.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (authCreate.error || !authCreate.data.user?.id) {
      throw new Error(`No se pudo crear auth user de prueba: ${authCreate.error?.message ?? "sin user_id"}`);
    }
    created.authUserId = authCreate.data.user.id;

    await client.query("begin");

    try {
      const posA = await client.query(
        `insert into public.department_positions (organization_id, department_id, code, name, is_active)
         values ($1,$2,$3,$4,true)
         returning id`,
        [org.id, department.id, `scope_pos_a_${RUN_TAG}`, employeePositionName],
      );
      created.posAId = posA.rows[0].id;

      if (!secondDepartment) {
        const tempDept = await client.query(
          `insert into public.organization_departments (organization_id, code, name, is_active)
           values ($1,$2,$3,true)
           returning id`,
          [org.id, `scope_dept_${RUN_TAG}`, `Scope Dept ${RUN_TAG}`],
        );
        created.tempDepartmentId = tempDept.rows[0].id;
        secondDepartment = { id: created.tempDepartmentId };
      }

      const posB = await client.query(
        `insert into public.department_positions (organization_id, department_id, code, name, is_active)
         values ($1,$2,$3,$4,true)
         returning id`,
        [org.id, secondDepartment.id, `scope_pos_b_${RUN_TAG}`, employeePositionName],
      );
      created.posBId = posB.rows[0].id;

      const posWrong = await client.query(
        `insert into public.department_positions (organization_id, department_id, code, name, is_active)
         values ($1,$2,$3,$4,true)
         returning id`,
        [org.id, department.id, `scope_pos_wrong_${RUN_TAG}`, wrongPositionName],
      );
      created.posWrongId = posWrong.rows[0].id;

      const membership = await client.query(
        `insert into public.memberships (organization_id, user_id, role_id, branch_id, all_locations, status)
         values ($1,$2,$3,null,true,'active')
         returning id`,
        [org.id, created.authUserId, employeeRole.id],
      );
      created.membershipId = membership.rows[0].id;

      const employee = await client.query(
        `insert into public.employees (
           organization_id, user_id, first_name, last_name, email, department_id, position, status, branch_id, all_locations
         ) values ($1,$2,$3,$4,$5,$6,$7,'active',null,true)
         returning id`,
        [org.id, created.authUserId, "Scope", "MultiPuesto", email, department.id, employeePositionName],
      );
      created.employeeId = employee.rows[0].id;

      const profile = await client.query(
        `insert into public.organization_user_profiles (
           organization_id, user_id, employee_id, first_name, last_name, email, department_id, position_id, is_employee, status, branch_id, all_locations, source
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,true,'active',null,true,'users_employees_modal')
         returning id`,
        [org.id, created.authUserId, created.employeeId, "Scope", "MultiPuesto", email, department.id, created.posAId],
      );
      created.profileId = profile.rows[0].id;

      const announcementGood = await client.query(
        `insert into public.announcements (
           organization_id, branch_id, created_by, title, body, kind, is_featured, publish_at, target_scope
         ) values ($1,$2,$3,$4,$5,'general',false,timezone('utc', now()),$6::jsonb)
         returning id`,
        [
          org.id,
          branches[0].id,
          actor.user_id,
          `[SCOPE_OK:${RUN_TAG}] Aviso`,
          "Aviso scope all_locations + multi-puesto",
          JSON.stringify({
            locations: [branches[0].id],
            department_ids: [department.id],
            position_ids: [created.posAId, created.posBId],
            users: [],
          }),
        ],
      );
      created.announcementGoodId = announcementGood.rows[0].id;

      const announcementBad = await client.query(
        `insert into public.announcements (
           organization_id, branch_id, created_by, title, body, kind, is_featured, publish_at, target_scope
         ) values ($1,$2,$3,$4,$5,'general',false,timezone('utc', now()),$6::jsonb)
         returning id`,
        [
          org.id,
          branches[0].id,
          actor.user_id,
          `[SCOPE_BAD:${RUN_TAG}] Aviso`,
          "Aviso scope negativo multi-puesto",
          JSON.stringify({
            locations: [],
            department_ids: [department.id],
            position_ids: [created.posWrongId],
            users: [],
          }),
        ],
      );
      created.announcementBadId = announcementBad.rows[0].id;

      const documentGood = await client.query(
        `insert into public.documents (
           organization_id, branch_id, owner_user_id, title, file_path, mime_type, file_size_bytes, access_scope
         ) values ($1,$2,$3,$4,$5,'text/plain',256,$6::jsonb)
         returning id`,
        [
          org.id,
          branches[1].id,
          actor.user_id,
          `[SCOPE_OK:${RUN_TAG}] Documento`,
          `${org.id}/scope-tests/${RUN_TAG}-ok.txt`,
          JSON.stringify({
            locations: [branches[1].id],
            department_ids: [department.id],
            position_ids: [created.posAId, created.posBId],
            users: [],
          }),
        ],
      );
      created.documentGoodId = documentGood.rows[0].id;

      const documentBad = await client.query(
        `insert into public.documents (
           organization_id, branch_id, owner_user_id, title, file_path, mime_type, file_size_bytes, access_scope
         ) values ($1,$2,$3,$4,$5,'text/plain',256,$6::jsonb)
         returning id`,
        [
          org.id,
          branches[1].id,
          actor.user_id,
          `[SCOPE_BAD:${RUN_TAG}] Documento`,
          `${org.id}/scope-tests/${RUN_TAG}-bad.txt`,
          JSON.stringify({
            locations: [],
            department_ids: [department.id],
            position_ids: [created.posWrongId],
            users: [],
          }),
        ],
      );
      created.documentBadId = documentBad.rows[0].id;

      const checklistGood = await client.query(
        `insert into public.checklist_templates (
           organization_id, branch_id, name, checklist_type, is_active, shift, repeat_every, target_scope, created_by
         ) values ($1,$2,$3,'custom',true,'1er Shift','daily',$4::jsonb,$5)
         returning id`,
        [
          org.id,
          branches[1].id,
          `[SCOPE_OK:${RUN_TAG}] Checklist`,
          JSON.stringify({
            locations: [branches[1].id],
            department_ids: [department.id],
            position_ids: [created.posAId, created.posBId],
            users: [],
          }),
          actor.user_id,
        ],
      );
      created.checklistGoodId = checklistGood.rows[0].id;

      const checklistBad = await client.query(
        `insert into public.checklist_templates (
           organization_id, branch_id, name, checklist_type, is_active, shift, repeat_every, target_scope, created_by
         ) values ($1,$2,$3,'custom',true,'1er Shift','daily',$4::jsonb,$5)
         returning id`,
        [
          org.id,
          branches[1].id,
          `[SCOPE_BAD:${RUN_TAG}] Checklist`,
          JSON.stringify({
            locations: [],
            department_ids: [department.id],
            position_ids: [created.posWrongId],
            users: [],
          }),
          actor.user_id,
        ],
      );
      created.checklistBadId = checklistBad.rows[0].id;

      const checklistSection = await client.query(
        `insert into public.checklist_template_sections (organization_id, template_id, name, sort_order)
         values ($1,$2,$3,0)
         returning id`,
        [org.id, created.checklistGoodId, `[SCOPE_OK:${RUN_TAG}] Section`],
      );
      created.checklistGoodSectionId = checklistSection.rows[0].id;

      const checklistItem = await client.query(
        `insert into public.checklist_template_items (organization_id, section_id, label, priority, sort_order)
         values ($1,$2,$3,'medium',0)
         returning id`,
        [org.id, created.checklistGoodSectionId, `[SCOPE_OK:${RUN_TAG}] Item`],
      );
      created.checklistGoodItemId = checklistItem.rows[0].id;

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    const positionLookup = await client.query(
      `select id
       from public.department_positions
       where organization_id = $1 and name = $2 and is_active = true
       order by created_at asc`,
      [org.id, employeePositionName],
    );
    const employeeLookup = await client.query(
      "select department_id from public.employees where organization_id = $1 and id = $2",
      [org.id, created.employeeId],
    );
    const membershipLookup = await client.query(
      "select all_locations from public.memberships where organization_id = $1 and id = $2",
      [org.id, created.membershipId],
    );

    const positionIds = positionLookup.rows.map((row) => row.id);
    const employeeDepartmentId = employeeLookup.rows[0]?.department_id ?? null;
    const isAllLocations = membershipLookup.rows[0]?.all_locations === true;
    const allowedLocationIds = isAllLocations ? branches.map((row) => row.id) : [];

    const baseSubject = {
      userId: created.authUserId,
      departmentId: employeeDepartmentId,
      positionIds,
    };

    const announcementScopes = await client.query(
      "select id, target_scope from public.announcements where organization_id = $1 and id = any($2::uuid[])",
      [org.id, [created.announcementGoodId, created.announcementBadId]],
    );
    const documentScopes = await client.query(
      "select id, access_scope from public.documents where organization_id = $1 and id = any($2::uuid[])",
      [org.id, [created.documentGoodId, created.documentBadId]],
    );
    const checklistScopes = await client.query(
      "select id, branch_id, target_scope from public.checklist_templates where organization_id = $1 and id = any($2::uuid[])",
      [org.id, [created.checklistGoodId, created.checklistBadId]],
    );

    const announcementById = new Map(announcementScopes.rows.map((row) => [row.id, row.target_scope]));
    const documentById = new Map(documentScopes.rows.map((row) => [row.id, row.access_scope]));
    const checklistById = new Map(checklistScopes.rows.map((row) => [row.id, row]));

    const announcementGoodVisible = canReadWithLocationSet(
      announcementById.get(created.announcementGoodId) ?? {},
      baseSubject,
      allowedLocationIds,
    );
    const announcementBadVisible = canReadWithLocationSet(
      announcementById.get(created.announcementBadId) ?? {},
      baseSubject,
      allowedLocationIds,
    );

    const documentGoodVisible = canReadWithLocationSet(
      documentById.get(created.documentGoodId) ?? {},
      baseSubject,
      allowedLocationIds,
    );
    const documentBadVisible = canReadWithLocationSet(
      documentById.get(created.documentBadId) ?? {},
      baseSubject,
      allowedLocationIds,
    );

    function canUseChecklist(row) {
      const templateBranchId = row.branch_id ?? null;
      const baseBranchMatch = templateBranchId ? allowedLocationIds.includes(templateBranchId) : true;
      if (!baseBranchMatch) return false;
      return canReadWithLocationSet(row.target_scope ?? {}, baseSubject, allowedLocationIds);
    }

    const checklistGoodVisible = canUseChecklist(checklistById.get(created.checklistGoodId));
    const checklistBadVisible = canUseChecklist(checklistById.get(created.checklistBadId));

    const checks = [
      { check: "all_locations activo en membership", ok: isAllLocations },
      { check: "multi-puesto resuelto (>=2 position_ids)", ok: positionIds.length >= 2 },
      { check: "aviso scope positivo visible", ok: announcementGoodVisible === true },
      { check: "aviso scope negativo bloqueado", ok: announcementBadVisible === false },
      { check: "documento scope positivo visible", ok: documentGoodVisible === true },
      { check: "documento scope negativo bloqueado", ok: documentBadVisible === false },
      { check: "checklist scope positivo visible", ok: checklistGoodVisible === true },
      { check: "checklist scope negativo bloqueado", ok: checklistBadVisible === false },
    ];

    console.log("\n=== VERIFY EMPLOYEE ALL LOCATIONS + MULTI-PUESTO ===");
    console.log(`run_tag: ${RUN_TAG}`);
    console.log(`organization: ${org.name} (${org.id})`);
    console.log(`allowed_locations: ${allowedLocationIds.length}`);
    console.log(`position_ids_resueltos: ${positionIds.length}`);
    console.table(checks);

    const failed = checks.filter((row) => !row.ok);
    if (failed.length) {
      throw new Error(`Fallaron ${failed.length} validaciones de alcance.`);
    }

    console.log("OK: alcance all_locations + multi-puesto validado.");
  } finally {
    if (CLEANUP) {
      try {
        await client.query("begin");

        if (created.checklistGoodId || created.checklistBadId) {
          await client.query(
            `delete from public.checklist_template_items
             where organization_id = $1
               and section_id in (
                 select id from public.checklist_template_sections
                 where organization_id = $1
                   and template_id = any($2::uuid[])
               )`,
            [resolvedOrgId, [created.checklistGoodId, created.checklistBadId].filter(Boolean)],
          );
          await client.query(
            "delete from public.checklist_template_sections where organization_id = $1 and template_id = any($2::uuid[])",
            [resolvedOrgId, [created.checklistGoodId, created.checklistBadId].filter(Boolean)],
          );
          await client.query(
            "delete from public.checklist_templates where organization_id = $1 and id = any($2::uuid[])",
            [resolvedOrgId, [created.checklistGoodId, created.checklistBadId].filter(Boolean)],
          );
        }

        if (created.documentGoodId || created.documentBadId) {
          await client.query(
            "delete from public.documents where organization_id = $1 and id = any($2::uuid[])",
            [resolvedOrgId, [created.documentGoodId, created.documentBadId].filter(Boolean)],
          );
        }

        if (created.announcementGoodId || created.announcementBadId) {
          await client.query(
            "delete from public.announcement_audiences where organization_id = $1 and announcement_id = any($2::uuid[])",
            [resolvedOrgId, [created.announcementGoodId, created.announcementBadId].filter(Boolean)],
          );
          await client.query(
            "delete from public.announcements where organization_id = $1 and id = any($2::uuid[])",
            [resolvedOrgId, [created.announcementGoodId, created.announcementBadId].filter(Boolean)],
          );
        }

        if (created.profileId) {
          await client.query("delete from public.organization_user_profiles where id = $1", [created.profileId]);
        }

        if (created.employeeId) {
          await client.query("delete from public.employees where id = $1", [created.employeeId]);
        }

        if (created.membershipId) {
          await client.query("delete from public.memberships where id = $1", [created.membershipId]);
        }

        if (created.posAId || created.posBId || created.posWrongId) {
          await client.query(
            "delete from public.department_positions where id = any($1::uuid[])",
            [[created.posAId, created.posBId, created.posWrongId].filter(Boolean)],
          );
        }

        if (created.tempDepartmentId) {
          await client.query("delete from public.organization_departments where id = $1", [created.tempDepartmentId]);
        }

        await client.query("commit");
      } catch (cleanupError) {
        await client.query("rollback");
        console.error("ERROR cleanup:", cleanupError.message);
      }

      if (created.authUserId) {
        const authDelete = await supabase.auth.admin.deleteUser(created.authUserId);
        if (authDelete.error) {
          console.error("ERROR auth cleanup:", authDelete.error.message);
        }
      }

      console.log("cleanup_executed: true");
    } else {
      console.log("cleanup_executed: false");
    }

    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR verify-employee-all-locations-multi-position:", error.message);
  process.exit(1);
});

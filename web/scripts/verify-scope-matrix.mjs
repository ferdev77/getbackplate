import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function envValue(text, key) {
  const prefix = `${key}=`;
  const line = text.split(/\r?\n/).find((row) => row.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

function listOf(scope, key) {
  const value = scope?.[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function scopeMatches(scope, ctx) {
  const users = listOf(scope, "users");
  const locations = listOf(scope, "locations");
  const departments = listOf(scope, "department_ids");
  const positions = listOf(scope, "position_ids");
  const hasAny = users.length || locations.length || departments.length || positions.length;
  if (!hasAny) return true;
  if (users.includes(ctx.userId)) return true;
  if (ctx.effectiveBranchId && locations.includes(ctx.effectiveBranchId)) return true;
  if (ctx.departmentId && departments.includes(ctx.departmentId)) return true;
  if (ctx.positionIds.some((id) => positions.includes(id))) return true;
  return false;
}

function scopeKinds(scope) {
  const users = listOf(scope, "users").length > 0;
  const locations = listOf(scope, "locations").length > 0;
  const departments = listOf(scope, "department_ids").length > 0;
  const positions = listOf(scope, "position_ids").length > 0;
  if (!users && !locations && !departments && !positions) return ["global"];
  const kinds = [];
  if (users) kinds.push("user");
  if (locations) kinds.push("location");
  if (departments) kinds.push("department");
  if (positions) kinds.push("position");
  return kinds;
}

async function main() {
  const envText = await readFile(path.resolve(__dirname, "../.env.local"), "utf8");
  const connectionString = process.env.SUPABASE_DB_POOLER_URL || envValue(envText, "SUPABASE_DB_POOLER_URL");
  if (!connectionString) throw new Error("SUPABASE_DB_POOLER_URL no encontrado");

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const orgRes = await client.query(
    "select id,name from public.organizations where lower(name) like '%burger%king%' or lower(name) like '%burguer%king%' order by created_at desc limit 1",
  );
  const org = orgRes.rows[0];
  if (!org) throw new Error("No encontre organizacion de prueba (Burger/Burguer King)");

  const empRes = await client.query(
    `select id,user_id,first_name,last_name,branch_id,department_id,position
     from public.employees
     where organization_id = $1 and user_id is not null`,
    [org.id],
  );
  const memRes = await client.query(
    `select user_id, branch_id
     from public.memberships
     where organization_id = $1 and status = 'active'`,
    [org.id],
  );
  const posRes = await client.query(
    `select id, department_id, name
     from public.department_positions
     where organization_id = $1 and is_active = true`,
    [org.id],
  );
  const annRes = await client.query(
    `select id,title,target_scope,publish_at,expires_at
     from public.announcements
     where organization_id = $1
     order by coalesce(publish_at,created_at) desc
     limit 200`,
    [org.id],
  );
  const audRes = await client.query(
    `select announcement_id, user_id, branch_id
     from public.announcement_audiences
     where organization_id = $1`,
    [org.id],
  );
  const docRes = await client.query(
    `select id,title,branch_id,access_scope
     from public.documents
     where organization_id = $1
     order by created_at desc
     limit 300`,
    [org.id],
  );
  const linkRes = await client.query(
    `select employee_id, document_id
     from public.employee_documents
     where organization_id = $1`,
    [org.id],
  );
  const chkRes = await client.query(
    `select id,name,branch_id,department_id,target_scope
     from public.checklist_templates
     where organization_id = $1 and is_active = true
     order by updated_at desc
     limit 200`,
    [org.id],
  );

  const membershipBranchByUser = new Map(memRes.rows.map((r) => [r.user_id, r.branch_id]));
  const posByDeptAndName = new Map();
  for (const row of posRes.rows) {
    const key = `${row.department_id ?? "*"}::${String(row.name).trim().toLowerCase()}`;
    const list = posByDeptAndName.get(key) ?? [];
    list.push(row.id);
    posByDeptAndName.set(key, list);
  }

  const audienceByAnnouncement = new Map();
  for (const row of audRes.rows) {
    const list = audienceByAnnouncement.get(row.announcement_id) ?? [];
    list.push(row);
    audienceByAnnouncement.set(row.announcement_id, list);
  }

  const directLinksByEmployee = new Map();
  for (const row of linkRes.rows) {
    const list = directLinksByEmployee.get(row.employee_id) ?? new Set();
    list.add(row.document_id);
    directLinksByEmployee.set(row.employee_id, list);
  }

  const now = new Date();
  const results = [];

  for (const emp of empRes.rows) {
    const rawName = String(emp.position ?? "").trim().toLowerCase();
    const byDept = posByDeptAndName.get(`${emp.department_id ?? "*"}::${rawName}`) ?? [];
    const fallbackAnyDept = posByDeptAndName.get(`*::${rawName}`) ?? [];
    const positionIds = [...new Set([...byDept, ...fallbackAnyDept])];
    const effectiveBranchId = membershipBranchByUser.get(emp.user_id) ?? emp.branch_id ?? null;

    const ctx = {
      userId: emp.user_id,
      departmentId: emp.department_id,
      effectiveBranchId,
      positionIds,
    };

    let announcementVisible = 0;
    let documentVisible = 0;
    let checklistVisible = 0;

    const hits = {
      ann: new Set(),
      doc: new Set(),
      chk: new Set(),
    };

    for (const ann of annRes.rows) {
      const publishAt = ann.publish_at ? new Date(ann.publish_at) : null;
      const expiresAt = ann.expires_at ? new Date(ann.expires_at) : null;
      if (publishAt && publishAt > now) continue;
      if (expiresAt && expiresAt < now) continue;

      const audiences = audienceByAnnouncement.get(ann.id) ?? [];
      const audienceOk =
        audiences.length === 0 ||
        audiences.some((row) => row.user_id === ctx.userId || (row.user_id == null && row.branch_id == null) || (row.user_id == null && row.branch_id != null && ctx.effectiveBranchId != null && row.branch_id === ctx.effectiveBranchId));
      const scopeOk = scopeMatches(ann.target_scope ?? {}, ctx);
      if (audienceOk && scopeOk) {
        announcementVisible += 1;
        for (const kind of scopeKinds(ann.target_scope ?? {})) hits.ann.add(kind);
      }
    }

    const directSet = directLinksByEmployee.get(emp.id) ?? new Set();
    for (const doc of docRes.rows) {
      const isDirect = directSet.has(doc.id);
      const scopeOk = scopeMatches(doc.access_scope ?? {}, ctx);
      const branchOk = doc.branch_id ? ctx.effectiveBranchId != null && doc.branch_id === ctx.effectiveBranchId : false;
      const hasAny = scopeKinds(doc.access_scope ?? {}).join(",") !== "global";
      const visible = isDirect || (!hasAny && true) || scopeOk || branchOk;
      if (visible) {
        documentVisible += 1;
        if (isDirect) hits.doc.add("direct");
        for (const kind of scopeKinds(doc.access_scope ?? {})) hits.doc.add(kind);
        if (doc.branch_id) hits.doc.add("location");
      }
    }

    for (const chk of chkRes.rows) {
      if (chk.branch_id && (!ctx.effectiveBranchId || chk.branch_id !== ctx.effectiveBranchId)) continue;
      if (chk.department_id && (!ctx.departmentId || chk.department_id !== ctx.departmentId)) continue;
      if (!scopeMatches(chk.target_scope ?? {}, ctx)) continue;
      checklistVisible += 1;
      for (const kind of scopeKinds(chk.target_scope ?? {})) hits.chk.add(kind);
      if (chk.branch_id) hits.chk.add("location");
      if (chk.department_id) hits.chk.add("department");
    }

    results.push({
      empleado: `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim(),
      branch_ok: Boolean(ctx.effectiveBranchId),
      dept_ok: Boolean(ctx.departmentId),
      position_ok: positionIds.length > 0,
      ann_visible: announcementVisible,
      doc_visible: documentVisible,
      chk_visible: checklistVisible,
      ann_kinds: [...hits.ann].sort().join(",") || "-",
      doc_kinds: [...hits.doc].sort().join(",") || "-",
      chk_kinds: [...hits.chk].sort().join(",") || "-",
    });
  }

  console.log(`ORG: ${org.name}`);
  console.table(results);

  await client.end();
}

main().catch((error) => {
  console.error("ERROR verify-scope-matrix:", error.message);
  process.exit(1);
});

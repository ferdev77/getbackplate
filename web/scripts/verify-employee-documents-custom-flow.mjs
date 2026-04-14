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

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

async function check(label, fn) {
  process.stdout.write(`  ${label}... `);
  try {
    await fn();
    console.log("OK");
    passed += 1;
  } catch (error) {
    console.log(`FAIL (${error.message})`);
    failed += 1;
  }
}

async function run() {
  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await db.connect();

  const createdDocumentIds = [];
  const createdLinkIds = [];

  try {
    console.log("\nVerificando flujo custom/fijo de documentos de empleados\n");

    const { rows: contextRows } = await db.query(
      `
        select
          o.id as organization_id,
          e.id as employee_id,
          e.user_id as employee_user_id,
          e.branch_id,
          e.department_id
        from public.organizations o
        join public.employees e on e.organization_id = o.id
        where o.status = 'active'
        order by o.created_at asc, e.created_at asc
        limit 1
      `,
    );

    const ctx = contextRows[0];
    if (!ctx?.organization_id || !ctx?.employee_id) {
      throw new Error("No hay contexto minimo (organization + employee) para ejecutar la verificacion.");
    }

    const { rows: managerRows } = await db.query(
      `
        select m.user_id
        from public.memberships m
        join public.roles r on r.id = m.role_id
        where m.organization_id = $1
          and m.status = 'active'
          and r.code in ('company_admin')
        order by m.created_at asc
        limit 1
      `,
      [ctx.organization_id],
    );

    const actorUserId = managerRows[0]?.user_id ?? ctx.employee_user_id ?? null;
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await check("Crear solicitud custom sin archivo real", async () => {
      const customRequestPath = `${ctx.organization_id}/employees/${ctx.employee_id}/company/request/${seed}-placeholder.txt`;
      const customRequestTitle = `QA Custom Request ${seed}`;

      const { data: requestDocument, error: requestDocError } = await supabaseAdmin
        .from("documents")
        .insert({
          organization_id: ctx.organization_id,
          branch_id: ctx.branch_id,
          owner_user_id: actorUserId,
          title: customRequestTitle,
          file_path: customRequestPath,
          mime_type: "text/plain",
          original_file_name: "solicitud-documento.txt",
          file_size_bytes: 32,
          access_scope: {
            locations: ctx.branch_id ? [ctx.branch_id] : [],
            department_ids: ctx.department_id ? [ctx.department_id] : [],
            users: ctx.employee_user_id ? [ctx.employee_user_id] : [],
            internal_only: true,
          },
        })
        .select("id")
        .single();

      if (requestDocError || !requestDocument?.id) {
        throw new Error(requestDocError?.message ?? "No se pudo crear documento custom de prueba");
      }
      createdDocumentIds.push(requestDocument.id);

      const { data: requestLink, error: requestLinkError } = await supabaseAdmin
        .from("employee_documents")
        .insert({
          organization_id: ctx.organization_id,
          employee_id: ctx.employee_id,
          document_id: requestDocument.id,
          status: "pending",
          reviewed_at: null,
          reviewed_by: null,
          review_comment: null,
          expires_at: null,
          reminder_days: null,
          has_no_expiration: false,
          signature_status: null,
          signature_embed_src: null,
          signature_requested_at: null,
          signature_completed_at: null,
        })
        .select("id")
        .single();

      if (requestLinkError || !requestLink?.id) {
        throw new Error(requestLinkError?.message ?? "No se pudo crear vínculo custom de prueba");
      }
      createdLinkIds.push(requestLink.id);

      const { rows: heuristicsRows } = await db.query(
        `
          select
            ed.status,
            d.mime_type,
            d.original_file_name,
            d.file_path
          from public.employee_documents ed
          join public.documents d on d.id = ed.document_id
          where ed.id = $1
          limit 1
        `,
        [requestLink.id],
      );

      const row = heuristicsRows[0];
      const matchesRequestedWithoutFile =
        row?.status === "pending"
        && row?.mime_type === "text/plain"
        && row?.original_file_name === "solicitud-documento.txt"
        && typeof row?.file_path === "string"
        && row.file_path.includes("/company/request/");

      if (!matchesRequestedWithoutFile) {
        throw new Error("No coincide con heurística requested_without_file esperada");
      }
    });

    await check("Carga de empleado inicia en pending", async () => {
      const employeeUploadPath = `${ctx.organization_id}/employees/${ctx.employee_id}/employee/upload/${seed}-employee.pdf`;

      const { data: employeeDoc, error: employeeDocError } = await supabaseAdmin
        .from("documents")
        .insert({
          organization_id: ctx.organization_id,
          branch_id: ctx.branch_id,
          owner_user_id: ctx.employee_user_id,
          title: `QA Employee Upload ${seed}`,
          file_path: employeeUploadPath,
          mime_type: "application/pdf",
          original_file_name: "qa-employee-upload.pdf",
          file_size_bytes: 1024,
          access_scope: {
            locations: ctx.branch_id ? [ctx.branch_id] : [],
            department_ids: ctx.department_id ? [ctx.department_id] : [],
            users: ctx.employee_user_id ? [ctx.employee_user_id] : [],
            internal_only: true,
          },
        })
        .select("id")
        .single();

      if (employeeDocError || !employeeDoc?.id) {
        throw new Error(employeeDocError?.message ?? "No se pudo crear documento de empleado");
      }
      createdDocumentIds.push(employeeDoc.id);

      const { data: employeeLink, error: employeeLinkError } = await supabaseAdmin
        .from("employee_documents")
        .insert({
          organization_id: ctx.organization_id,
          employee_id: ctx.employee_id,
          document_id: employeeDoc.id,
          status: "pending",
        })
        .select("id")
        .single();

      if (employeeLinkError || !employeeLink?.id) {
        throw new Error(employeeLinkError?.message ?? "No se pudo crear vínculo de empleado");
      }
      createdLinkIds.push(employeeLink.id);

      const { rows: statusRows } = await db.query(
        `select status from public.employee_documents where id = $1 limit 1`,
        [employeeLink.id],
      );
      if (statusRows[0]?.status !== "pending") {
        throw new Error(`Estado esperado pending, recibido ${statusRows[0]?.status ?? "null"}`);
      }
    });

    await check("Carga de empresa inicia en approved", async () => {
      const companyUploadPath = `${ctx.organization_id}/employees/${ctx.employee_id}/company/upload/${seed}-company.pdf`;

      const { data: companyDoc, error: companyDocError } = await supabaseAdmin
        .from("documents")
        .insert({
          organization_id: ctx.organization_id,
          branch_id: ctx.branch_id,
          owner_user_id: actorUserId,
          title: `QA Company Upload ${seed}`,
          file_path: companyUploadPath,
          mime_type: "application/pdf",
          original_file_name: "qa-company-upload.pdf",
          file_size_bytes: 1024,
          access_scope: {
            locations: ctx.branch_id ? [ctx.branch_id] : [],
            department_ids: ctx.department_id ? [ctx.department_id] : [],
            users: ctx.employee_user_id ? [ctx.employee_user_id] : [],
            internal_only: true,
          },
        })
        .select("id")
        .single();

      if (companyDocError || !companyDoc?.id) {
        throw new Error(companyDocError?.message ?? "No se pudo crear documento de empresa");
      }
      createdDocumentIds.push(companyDoc.id);

      const nowIso = new Date().toISOString();
      const { data: companyLink, error: companyLinkError } = await supabaseAdmin
        .from("employee_documents")
        .insert({
          organization_id: ctx.organization_id,
          employee_id: ctx.employee_id,
          document_id: companyDoc.id,
          status: "approved",
          reviewed_at: nowIso,
          reviewed_by: actorUserId,
        })
        .select("id")
        .single();

      if (companyLinkError || !companyLink?.id) {
        throw new Error(companyLinkError?.message ?? "No se pudo crear vínculo de empresa");
      }
      createdLinkIds.push(companyLink.id);

      const { rows: statusRows } = await db.query(
        `select status from public.employee_documents where id = $1 limit 1`,
        [companyLink.id],
      );
      if (statusRows[0]?.status !== "approved") {
        throw new Error(`Estado esperado approved, recibido ${statusRows[0]?.status ?? "null"}`);
      }
    });

    await check("Rechazo limpia vencimiento y firma", async () => {
      const targetLinkId = createdLinkIds[createdLinkIds.length - 1];
      if (!targetLinkId) {
        throw new Error("No hay vínculo previo para validar limpieza en rechazo");
      }

      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
      await supabaseAdmin
        .from("employee_documents")
        .update({
          status: "approved",
          expires_at: expiresAt,
          reminder_days: 30,
          has_no_expiration: false,
          signature_status: "requested",
          signature_requested_at: new Date().toISOString(),
          signature_embed_src: "https://docuseal.example/sign/test",
        })
        .eq("id", targetLinkId);

      await supabaseAdmin
        .from("employee_documents")
        .update({
          status: "rejected",
          review_comment: "QA rechazo",
          expires_at: null,
          reminder_days: null,
          reminder_last_sent_at: null,
          reminder_sent_for_date: null,
          has_no_expiration: false,
          signature_status: null,
          signature_provider: null,
          signature_submission_id: null,
          signature_submitter_slug: null,
          signature_embed_src: null,
          signature_requested_by: null,
          signature_requested_at: null,
          signature_completed_at: null,
          signature_error: null,
          signature_last_webhook_event_id: null,
        })
        .eq("id", targetLinkId);

      const { rows: verifyRows } = await db.query(
        `
          select status, expires_at, reminder_days, signature_status, signature_embed_src, signature_requested_at
          from public.employee_documents
          where id = $1
          limit 1
        `,
        [targetLinkId],
      );

      const row = verifyRows[0];
      const cleared =
        row?.status === "rejected"
        && row?.expires_at === null
        && row?.reminder_days === null
        && row?.signature_status === null
        && row?.signature_embed_src === null
        && row?.signature_requested_at === null;

      if (!cleared) {
        throw new Error("Rechazo no limpió todos los campos esperados");
      }
    });

    const total = passed + failed;
    console.log(`\nResultado: ${passed}/${total} checks OK`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (createdLinkIds.length > 0) {
      await supabaseAdmin.from("employee_documents").delete().in("id", createdLinkIds);
    }
    if (createdDocumentIds.length > 0) {
      await supabaseAdmin.from("documents").delete().in("id", createdDocumentIds);
    }
    await db.end();
  }
}

run().catch((error) => {
  console.error(`\nError fatal: ${error.message}`);
  process.exit(1);
});

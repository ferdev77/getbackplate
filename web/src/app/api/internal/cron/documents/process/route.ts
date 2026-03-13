import { NextResponse } from "next/server";
import pg from "pg";

const { Client } = pg;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;
const DEFAULT_LIMIT = Number(process.env.DOCUMENT_JOB_LIMIT || "25");
const MAX_ATTEMPTS = Number(process.env.DOCUMENT_JOB_MAX_ATTEMPTS || "5");
const CRON_SECRET = process.env.DOCUMENT_WORKER_SECRET || "";

function classifyDocument(mimeType: string | null) {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  if (mimeType.includes("word") || mimeType.includes("excel") || mimeType.includes("sheet")) return "office";
  return "other";
}

function isAuthorized(request: Request) {
  const cronHeader = request.headers.get("x-vercel-cron");
  if (cronHeader === "1") return true;

  if (!CRON_SECRET) return false;

  const authHeader = request.headers.get("authorization") || "";
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  return token === CRON_SECRET;
}

async function claimJob(client: pg.ClientBase) {
  await client.query("begin");

  const { rows } = await client.query(
    `with next_job as (
       select id
       from public.document_processing_jobs
       where status in ('pending', 'failed')
         and attempts < $1
       order by created_at asc
       for update skip locked
       limit 1
     )
     update public.document_processing_jobs j
     set status = 'processing',
         attempts = j.attempts + 1,
         updated_at = timezone('utc', now())
     from next_job
     where j.id = next_job.id
     returning j.id, j.organization_id, j.document_id, j.payload, j.attempts`,
    [MAX_ATTEMPTS],
  );

  await client.query("commit");
  return rows[0] ?? null;
}

async function markDone(client: pg.ClientBase, jobId: string, extraPayload: Record<string, unknown>) {
  await client.query(
    `update public.document_processing_jobs
     set status = 'done',
         error_message = null,
         payload = coalesce(payload, '{}'::jsonb) || $2::jsonb,
         updated_at = timezone('utc', now())
     where id = $1`,
    [jobId, JSON.stringify(extraPayload)],
  );
}

async function markFailed(client: pg.ClientBase, jobId: string, errorMessage: string) {
  await client.query(
    `update public.document_processing_jobs
     set status = 'failed',
         error_message = $2,
         updated_at = timezone('utc', now())
     where id = $1`,
    [jobId, errorMessage.slice(0, 500)],
  );
}

async function processOneJob(client: pg.ClientBase, job: { id: string; organization_id: string; document_id: string }) {
  const { rows } = await client.query(
    `select id, mime_type, file_size_bytes, checksum_sha256
     from public.documents
     where id = $1 and organization_id = $2
     limit 1`,
    [job.document_id, job.organization_id],
  );

  const doc = rows[0];
  if (!doc) {
    throw new Error("Documento no encontrado para este job");
  }

  await markDone(client, job.id, {
    worker: {
      processed_at: new Date().toISOString(),
      category: classifyDocument(doc.mime_type),
      checksum_present: Boolean(doc.checksum_sha256),
      size_bytes: doc.file_size_bytes,
    },
  });
}

async function runWorker(limit: number) {
  if (!DATABASE_URL) {
    throw new Error("Falta SUPABASE_DB_POOLER_URL");
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  let processed = 0;
  let failed = 0;

  try {
    for (let i = 0; i < limit; i += 1) {
      const job = await claimJob(client);
      if (!job) break;

      try {
        await processOneJob(client, job);
        processed += 1;
      } catch (error) {
        failed += 1;
        await markFailed(client, job.id, error instanceof Error ? error.message : "Error desconocido");
      }
    }

    const { rows: states } = await client.query(
      `select status, count(*)::int as total
       from public.document_processing_jobs
       group by status
       order by status asc`,
    );

    return { processed, failed, states };
  } finally {
    await client.end();
  }
}

async function handler(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || DEFAULT_LIMIT);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, requestedLimit)) : DEFAULT_LIMIT;

  try {
    const result = await runWorker(limit);
    return NextResponse.json({ ok: true, limit, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Worker error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handler(request);
}

export async function POST(request: Request) {
  return handler(request);
}

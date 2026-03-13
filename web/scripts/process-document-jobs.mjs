import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;
const LIMIT = Number(process.env.DOCUMENT_JOB_LIMIT || "25");
const MAX_ATTEMPTS = Number(process.env.DOCUMENT_JOB_MAX_ATTEMPTS || "5");

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

function classifyDocument(mimeType) {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  if (mimeType.includes("word") || mimeType.includes("excel") || mimeType.includes("sheet")) return "office";
  return "other";
}

async function claimJob(client) {
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
     returning j.id, j.organization_id, j.document_id, j.job_type, j.payload, j.attempts`,
    [MAX_ATTEMPTS],
  );

  await client.query("commit");
  return rows[0] ?? null;
}

async function markDone(client, job, extraPayload) {
  await client.query(
    `update public.document_processing_jobs
     set status = 'done',
         error_message = null,
         payload = coalesce(payload, '{}'::jsonb) || $2::jsonb,
         updated_at = timezone('utc', now())
     where id = $1`,
    [job.id, JSON.stringify(extraPayload)],
  );
}

async function markFailed(client, job, errorMessage) {
  await client.query(
    `update public.document_processing_jobs
     set status = 'failed',
         error_message = $2,
         updated_at = timezone('utc', now())
     where id = $1`,
    [job.id, errorMessage.slice(0, 500)],
  );
}

async function processJob(client, job) {
  const { rows } = await client.query(
    `select id, mime_type, file_size_bytes, checksum_sha256
     from public.documents
     where id = $1 and organization_id = $2
     limit 1`,
    [job.document_id, job.organization_id],
  );

  const doc = rows[0];
  if (!doc) {
    throw new Error("Documento no encontrado para el job");
  }

  const category = classifyDocument(doc.mime_type);
  const nowIso = new Date().toISOString();

  await markDone(client, job, {
    worker: {
      processed_at: nowIso,
      category,
      checksum_present: Boolean(doc.checksum_sha256),
      size_bytes: doc.file_size_bytes,
    },
  });
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  let processed = 0;
  let failed = 0;

  try {
    for (let i = 0; i < LIMIT; i += 1) {
      const job = await claimJob(client);
      if (!job) break;

      try {
        await processJob(client, job);
        processed += 1;
      } catch (error) {
        failed += 1;
        await markFailed(client, job, error instanceof Error ? error.message : "Error desconocido");
      }
    }

    const { rows } = await client.query(
      `select status, count(*)::int as total
       from public.document_processing_jobs
       group by status
       order by status asc`,
    );

    console.log("Worker de documentos ejecutado.");
    console.log({ processed, failed, limit: LIMIT });
    console.log("Jobs por estado:", rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR process-document-jobs:", error.message);
  process.exit(1);
});

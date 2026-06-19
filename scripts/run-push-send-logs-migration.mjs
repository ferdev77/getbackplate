import pg from "../web/node_modules/pg/lib/index.js";
const { Client } = pg;

const sql = `
CREATE TABLE IF NOT EXISTS public.push_send_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by     TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  image_url   TEXT,
  org_ids     TEXT[]      NOT NULL DEFAULT '{}',
  orgs_count  INT         NOT NULL DEFAULT 0,
  sent        INT         NOT NULL DEFAULT 0,
  expired     INT         NOT NULL DEFAULT 0,
  failed      INT         NOT NULL DEFAULT 0
);

ALTER TABLE public.push_send_logs ENABLE ROW LEVEL SECURITY;

DO $body$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_send_logs' AND policyname = 'service_role full access push_send_logs'
  ) THEN
    CREATE POLICY "service_role full access push_send_logs"
      ON public.push_send_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $body$;

CREATE INDEX IF NOT EXISTS idx_push_send_logs_created_at ON public.push_send_logs (created_at DESC);
`;

const DATABASES = [
  {
    label: "DEV (uubdslmtfxwraszinpao)",
    connectionString:
      "postgresql://postgres.uubdslmtfxwraszinpao:wfr9Rhcq28L8Dg90@aws-1-us-east-1.pooler.supabase.com:5432/postgres",
  },
  {
    label: "PROD (mfhyemwypuzsqjqxtbjf)",
    connectionString:
      "postgresql://postgres.mfhyemwypuzsqjqxtbjf:dy.7nci4Mfbfv+v@aws-0-us-west-2.pooler.supabase.com:5432/postgres",
  },
];

for (const db of DATABASES) {
  const client = new Client({ connectionString: db.connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log(`Conectado a ${db.label}`);
  try {
    await client.query(sql);
    console.log(`✅ Migración push_send_logs aplicada en ${db.label}`);
  } catch (e) {
    console.error(`❌ Error en ${db.label}:`, e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

import pg from "../web/node_modules/pg/lib/index.js";
const { Client } = pg;

const sql = `
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $body$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_own'
  ) THEN
    CREATE POLICY "push_subscriptions_own"
      ON public.push_subscriptions FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $body$;

DO $body$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_service_read'
  ) THEN
    CREATE POLICY "push_subscriptions_service_read"
      ON public.push_subscriptions FOR SELECT TO service_role USING (true);
  END IF;
END $body$;

DO $body$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_service_write'
  ) THEN
    CREATE POLICY "push_subscriptions_service_write"
      ON public.push_subscriptions FOR UPDATE TO service_role USING (true);
  END IF;
END $body$;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user   ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_org    ON public.push_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON public.push_subscriptions(org_id) WHERE is_active = true;
`;

const client = new Client({
  connectionString:
    "postgresql://postgres.mfhyemwypuzsqjqxtbjf:dy.7nci4Mfbfv+v@aws-0-us-west-2.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("Conectado a PROD DB (mfhyemwypuzsqjqxtbjf)");
try {
  await client.query(sql);
  console.log("✅ Migración push_subscriptions aplicada en PROD");
} catch (e) {
  console.error("❌ Error:", e.message);
  process.exit(1);
} finally {
  await client.end();
}

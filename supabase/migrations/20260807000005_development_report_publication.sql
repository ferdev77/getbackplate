ALTER TABLE public.development_ledger_reports
  ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS price_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  ALTER TABLE public.development_ledger_reports
    ADD CONSTRAINT development_ledger_reports_publication_status_check
    CHECK (publication_status IN ('draft', 'published'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The previous trigger rejects every update. Relax it only inside this migration
-- so the existing snapshot can receive its draft metadata before hardening it below.
CREATE OR REPLACE FUNCTION public.prevent_development_report_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'development reports cannot be deleted' USING errcode = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.development_ledger_reports
SET price_state = '{"i1-12":"30","i1-13":"30","i2-1":"50","i2-3":"30","i2-6":"20","i2-7":"30","i2-8":"70","i2-11":"20","i5-3":"20","i6-4":"70","p1-7":"70","p1-10":"30","p1-11":"30","p2-9":"30","p3-1":"20","p3-3":"20","p4-2":"20","p4-3":"10","p4-6":"30","p5-1":"30","p6-1":"150","p6-2":"30","p6-5":"70","p6-8":"30","p6-7":"20","i8-total":"250","i3-5":"70","i5-1":"30","t2-total":"120","t5-total":"120","t1-total":"50"}'::jsonb,
    publication_status = 'draft',
    published_at = NULL,
    published_by = NULL,
    updated_at = now()
WHERE id = '20260807-0000-4000-8000-260807000004';

DROP POLICY IF EXISTS development_ledger_reports_superadmin_select ON public.development_ledger_reports;
CREATE POLICY development_ledger_reports_superadmin_select
  ON public.development_ledger_reports
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    AND (
      publication_status = 'published'
      OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'fer@soliz.com'
    )
  );

CREATE INDEX IF NOT EXISTS development_ledger_reports_publication_idx
  ON public.development_ledger_reports (publication_status, date_from DESC, generated_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_development_report_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'development reports cannot be deleted' USING errcode = 'P0001';
  END IF;

  IF OLD.publication_status <> 'draft' THEN
    RAISE EXCEPTION 'published development reports are immutable' USING errcode = 'P0001';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.date_from IS DISTINCT FROM OLD.date_from
    OR NEW.date_to IS DISTINCT FROM OLD.date_to
    OR NEW.template_version IS DISTINCT FROM OLD.template_version
    OR NEW.item_count IS DISTINCT FROM OLD.item_count
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.html_document IS DISTINCT FROM OLD.html_document
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.generated_by IS DISTINCT FROM OLD.generated_by
    OR NEW.generated_at IS DISTINCT FROM OLD.generated_at THEN
    RAISE EXCEPTION 'development report content is immutable' USING errcode = 'P0001';
  END IF;

  IF NEW.publication_status = 'published' AND (NEW.published_at IS NULL OR NEW.published_by IS NULL) THEN
    RAISE EXCEPTION 'published development reports require publication metadata' USING errcode = '23514';
  END IF;

  IF NEW.publication_status = 'draft' AND (NEW.published_at IS NOT NULL OR NEW.published_by IS NOT NULL) THEN
    RAISE EXCEPTION 'draft development reports cannot have publication metadata' USING errcode = '23514';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

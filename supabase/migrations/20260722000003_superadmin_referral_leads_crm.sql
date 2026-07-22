-- CRM fields and durable activity notes for the superadmin referral-leads view.

ALTER TABLE public.superadmin_leads
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_up_at date;

CREATE INDEX IF NOT EXISTS superadmin_leads_follow_up_idx
  ON public.superadmin_leads (next_follow_up_at)
  WHERE status NOT IN ('won', 'lost');

CREATE TABLE IF NOT EXISTS public.superadmin_lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.superadmin_leads(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS superadmin_lead_notes_lead_created_idx
  ON public.superadmin_lead_notes (lead_id, created_at DESC);

INSERT INTO public.superadmin_lead_notes (lead_id, body, created_at)
SELECT id, notes, updated_at
FROM public.superadmin_leads
WHERE notes IS NOT NULL
  AND btrim(notes) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.superadmin_lead_notes existing
    WHERE existing.lead_id = superadmin_leads.id
  );

ALTER TABLE public.superadmin_lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS superadmin_lead_notes_superadmin_select
  ON public.superadmin_lead_notes;
CREATE POLICY superadmin_lead_notes_superadmin_select
  ON public.superadmin_lead_notes
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS superadmin_lead_notes_superadmin_insert
  ON public.superadmin_lead_notes;
CREATE POLICY superadmin_lead_notes_superadmin_insert
  ON public.superadmin_lead_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() AND author_id = auth.uid());

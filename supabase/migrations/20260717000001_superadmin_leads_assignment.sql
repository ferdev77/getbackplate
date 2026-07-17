-- Allow superadmins to assign sales leads to another superadmin.
ALTER TABLE public.superadmin_leads
  ADD COLUMN IF NOT EXISTS assigned_to uuid;

DO $$
BEGIN
  ALTER TABLE public.superadmin_leads
    ADD CONSTRAINT superadmin_leads_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS superadmin_leads_assigned_to_idx
  ON public.superadmin_leads (assigned_to);

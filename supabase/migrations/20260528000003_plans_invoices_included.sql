ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS invoices_included integer NULL;

NOTIFY pgrst, 'reload schema';

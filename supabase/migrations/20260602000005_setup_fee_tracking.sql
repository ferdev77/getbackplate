ALTER TABLE public.organization_addons
  ADD COLUMN IF NOT EXISTS setup_fee_paid    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_fee_amount  integer NULL; -- en centavos USD

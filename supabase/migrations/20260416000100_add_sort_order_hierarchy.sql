-- Add sort_order to departments and positions to allow arbitrary visual ordering

ALTER TABLE public.organization_departments
  ADD COLUMN IF NOT EXISTS sort_order integer not null default 0;

ALTER TABLE public.department_positions
  ADD COLUMN IF NOT EXISTS sort_order integer not null default 0;

-- Just in case some environments don't have it on branches yet, ensure it
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS sort_order integer not null default 0;

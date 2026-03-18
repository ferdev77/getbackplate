-- Add unique index on employee_contracts to allow upsert by employee+org
-- This ensures only one contract per employee per organization is allowed for upsert purposes
create unique index if not exists employee_contracts_emp_org_uk
  on public.employee_contracts (employee_id, organization_id);

-- Also add signer_name column if it doesn't exist yet
alter table public.employee_contracts
  add column if not exists signer_name text;

alter table public.employee_contracts
  add column if not exists branch_id uuid references public.branches(id);

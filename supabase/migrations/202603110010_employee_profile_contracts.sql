alter table public.employees
  add column if not exists birth_date date,
  add column if not exists sex text,
  add column if not exists nationality text,
  add column if not exists phone_country_code text,
  add column if not exists address_line1 text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists address_postal_code text,
  add column if not exists address_country text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_email text;

create table if not exists public.employee_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  contract_type text,
  contract_status text not null default 'draft' check (contract_status in ('draft', 'active', 'ended', 'cancelled')),
  start_date date,
  end_date date,
  salary_amount numeric(12,2),
  salary_currency text,
  payment_frequency text,
  notes text,
  signed_document_id uuid references public.documents(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_employee_contracts_updated_at
before update on public.employee_contracts
for each row
execute function public.set_updated_at();

alter table public.employee_contracts enable row level security;

create policy employee_contracts_tenant_select
  on public.employee_contracts for select
  using (public.has_org_membership(organization_id));

create policy employee_contracts_tenant_manage
  on public.employee_contracts for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null, -- 'checklist_generator', 'announcement_delivery'
  target_id uuid not null, -- ID del checklist_template o announcement
  cron_expression text, -- ej: '0 9 * * 1,5' (Lunes y Viernes 9am)
  recurrence_type text not null, -- 'daily', 'weekly', 'monthly', 'yearly', 'custom_days'
  custom_days integer[], -- [1, 5] para Lunes y Viernes
  metadata jsonb default '{}'::jsonb,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Indexes for performance
create index if not exists scheduled_jobs_next_run_at_idx on public.scheduled_jobs using btree (next_run_at) where (is_active = true);
create index if not exists scheduled_jobs_org_idx on public.scheduled_jobs using btree (organization_id);
create index if not exists scheduled_jobs_target_idx on public.scheduled_jobs using btree (target_id);

-- Trigger for updated_at
drop trigger if exists trg_scheduled_jobs_updated_at on public.scheduled_jobs;
create trigger trg_scheduled_jobs_updated_at
  before update on public.scheduled_jobs
  for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.scheduled_jobs enable row level security;

-- Policies
create policy scheduled_jobs_tenant_select
  on public.scheduled_jobs for select
  using (public.is_superadmin() or public.has_org_membership(organization_id));

create policy scheduled_jobs_tenant_manage
  on public.scheduled_jobs for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

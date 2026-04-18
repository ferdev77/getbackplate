do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'scheduled_jobs'
  ) then
    create table public.scheduled_jobs (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      job_type text not null,
      target_id uuid not null,
      cron_expression text,
      recurrence_type text not null,
      custom_days integer[],
      metadata jsonb default '{}'::jsonb,
      next_run_at timestamptz not null,
      last_run_at timestamptz,
      is_active boolean not null default true,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
  end if;

  create index if not exists scheduled_jobs_next_run_at_idx
    on public.scheduled_jobs using btree (next_run_at)
    where (is_active = true);

  create index if not exists scheduled_jobs_org_idx
    on public.scheduled_jobs using btree (organization_id);

  create index if not exists scheduled_jobs_target_idx
    on public.scheduled_jobs using btree (target_id);

  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    drop trigger if exists trg_scheduled_jobs_updated_at on public.scheduled_jobs;
    create trigger trg_scheduled_jobs_updated_at
      before update on public.scheduled_jobs
      for each row execute function public.set_updated_at();
  end if;

  alter table public.scheduled_jobs enable row level security;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'scheduled_jobs'
      and policyname = 'scheduled_jobs_tenant_select'
  ) then
    create policy scheduled_jobs_tenant_select
      on public.scheduled_jobs for select
      using (public.is_superadmin() or public.has_org_membership(organization_id));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'scheduled_jobs'
      and policyname = 'scheduled_jobs_tenant_manage'
  ) then
    create policy scheduled_jobs_tenant_manage
      on public.scheduled_jobs for all
      using (public.can_manage_org(organization_id))
      with check (public.can_manage_org(organization_id));
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scheduled_jobs'
  ) then
    execute 'alter publication supabase_realtime add table public.scheduled_jobs';
  end if;
end
$$;

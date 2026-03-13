create table if not exists public.plan_modules (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  module_id uuid not null references public.module_catalog(id) on delete cascade,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (plan_id, module_id)
);

drop trigger if exists trg_plan_modules_updated_at on public.plan_modules;
create trigger trg_plan_modules_updated_at
before update on public.plan_modules
for each row execute function public.set_updated_at();

alter table public.plan_modules enable row level security;

drop policy if exists plan_modules_read_all_authenticated on public.plan_modules;
create policy plan_modules_read_all_authenticated
  on public.plan_modules for select
  using (auth.uid() is not null);

drop policy if exists plan_modules_manage_superadmin on public.plan_modules;
create policy plan_modules_manage_superadmin
  on public.plan_modules for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

insert into public.plan_modules (plan_id, module_id, is_enabled)
select p.id, mc.id, true
from public.plans p
join public.module_catalog mc on mc.is_core = true
on conflict (plan_id, module_id) do update set is_enabled = excluded.is_enabled;

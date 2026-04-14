create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.superadmin_users s
    where s.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_membership(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(org_id uuid, role_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.roles r on r.id = m.role_id
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.code = role_code
  );
$$;

create or replace function public.can_manage_org(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
    or public.has_org_role(org_id, 'company_admin');
$$;

create or replace function public.is_module_enabled(org_id uuid, module_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_modules om
    join public.module_catalog mc on mc.id = om.module_id
    where om.organization_id = org_id
      and mc.code = module_code
      and om.is_enabled = true
  );
$$;

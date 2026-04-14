create or replace function public.can_manage_org(org_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_superadmin()
    or public.has_org_role(org_id, 'company_admin');
$$;

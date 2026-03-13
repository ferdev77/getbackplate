create or replace function public.superadmin_org_health_snapshot()
returns table (
  organization_id uuid,
  name text,
  status text,
  plan_id uuid,
  active_admins bigint,
  active_members bigint,
  active_employees bigint,
  enabled_modules bigint,
  docs_30d bigint,
  storage_mb numeric,
  checklist_7d bigint,
  active_announcements bigint,
  storage_limit_mb integer
)
language sql
stable
as $$
  with role_admin as (
    select id
    from public.roles
    where code = 'company_admin'
    limit 1
  ),
  members as (
    select organization_id, count(*) filter (where status = 'active') as active_members
    from public.memberships
    group by organization_id
  ),
  admins as (
    select m.organization_id, count(*) as active_admins
    from public.memberships m
    join role_admin r on r.id = m.role_id
    where m.status = 'active'
    group by m.organization_id
  ),
  employees as (
    select organization_id, count(*) filter (where status = 'active') as active_employees
    from public.employees
    group by organization_id
  ),
  modules as (
    select organization_id, count(*) filter (where is_enabled = true) as enabled_modules
    from public.organization_modules
    group by organization_id
  ),
  docs_30d as (
    select organization_id, count(*) as docs_30d
    from public.documents
    where created_at >= now() - interval '30 days'
    group by organization_id
  ),
  storage as (
    select organization_id, sum(coalesce(file_size_bytes, 0)) / 1024.0 / 1024.0 as storage_mb
    from public.documents
    where status = 'active'
    group by organization_id
  ),
  checklist_7d as (
    select organization_id, count(*) as checklist_7d
    from public.checklist_submissions
    where created_at >= now() - interval '7 days'
    group by organization_id
  ),
  announcements as (
    select organization_id, count(*) as active_announcements
    from public.announcements
    where (publish_at is null or publish_at <= now())
      and (expires_at is null or expires_at >= now())
    group by organization_id
  )
  select
    o.id as organization_id,
    o.name,
    o.status,
    o.plan_id,
    coalesce(a.active_admins, 0) as active_admins,
    coalesce(m.active_members, 0) as active_members,
    coalesce(e.active_employees, 0) as active_employees,
    coalesce(md.enabled_modules, 0) as enabled_modules,
    coalesce(d.docs_30d, 0) as docs_30d,
    coalesce(s.storage_mb, 0)::numeric as storage_mb,
    coalesce(c.checklist_7d, 0) as checklist_7d,
    coalesce(an.active_announcements, 0) as active_announcements,
    coalesce(ol.max_storage_mb, p.max_storage_mb) as storage_limit_mb
  from public.organizations o
  left join admins a on a.organization_id = o.id
  left join members m on m.organization_id = o.id
  left join employees e on e.organization_id = o.id
  left join modules md on md.organization_id = o.id
  left join docs_30d d on d.organization_id = o.id
  left join storage s on s.organization_id = o.id
  left join checklist_7d c on c.organization_id = o.id
  left join announcements an on an.organization_id = o.id
  left join public.organization_limits ol on ol.organization_id = o.id
  left join public.plans p on p.id = o.plan_id
  order by o.created_at desc;
$$;

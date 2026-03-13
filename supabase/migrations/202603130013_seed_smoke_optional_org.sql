insert into public.organizations (name, slug, status)
values ('Smoke Optional Modules', 'smoke-optional-modules', 'active')
on conflict (slug) do nothing;

insert into public.organization_modules (organization_id, module_id, is_enabled, enabled_at)
select
  o.id,
  mc.id,
  case when mc.code = 'announcements' then false else true end,
  case when mc.code = 'announcements' then null else timezone('utc', now()) end
from public.organizations o
join public.module_catalog mc on true
where o.slug = 'smoke-optional-modules'
on conflict (organization_id, module_id)
do update set
  is_enabled = excluded.is_enabled,
  enabled_at = excluded.enabled_at;

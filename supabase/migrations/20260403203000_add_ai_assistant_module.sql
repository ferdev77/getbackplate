insert into public.module_catalog (code, name, description, is_core)
values (
  'ai_assistant',
  'Asistente IA',
  'Asistente inteligente para consultas operativas del restaurante.',
  false
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_core = false,
  updated_at = timezone('utc', now());

insert into public.plan_modules (plan_id, module_id, is_enabled)
select
  p.id,
  mc.id,
  case when p.code in ('growth', 'enterprise') then true else false end
from public.plans p
join public.module_catalog mc on mc.code = 'ai_assistant'
where p.code in ('starter', 'growth', 'enterprise')
on conflict (plan_id, module_id) do update
set
  is_enabled = excluded.is_enabled,
  updated_at = timezone('utc', now());

insert into public.organization_modules (organization_id, module_id, is_enabled, enabled_at)
select
  o.id,
  mc.id,
  case when o.slug = 'smoke-optional-modules' then true else false end,
  case when o.slug = 'smoke-optional-modules' then timezone('utc', now()) else null end
from public.organizations o
join public.module_catalog mc on mc.code = 'ai_assistant'
on conflict (organization_id, module_id) do update
set
  is_enabled = excluded.is_enabled,
  enabled_at = excluded.enabled_at,
  updated_at = timezone('utc', now());

update public.organization_modules om
set
  is_enabled = true,
  enabled_at = coalesce(om.enabled_at, timezone('utc', now()))
from public.module_catalog mc
where mc.id = om.module_id
  and mc.is_core = true
  and om.is_enabled = false;

-- Integration-only organizations intentionally expose a smaller product surface:
-- QuickBooks, Settings, and Custom Branding. Platform and dual-plan organizations
-- retain the existing rule that core modules cannot be disabled.
create or replace function public.prevent_disabling_core_org_modules()
returns trigger
language plpgsql
as $$
declare
  is_core_module boolean;
  is_integration_only boolean;
begin
  select mc.is_core
  into is_core_module
  from public.module_catalog mc
  where mc.id = new.module_id;

  select o.plan_id is null and o.integration_plan_id is not null
  into is_integration_only
  from public.organizations o
  where o.id = new.organization_id;

  if coalesce(is_core_module, false)
    and new.is_enabled = false
    and not coalesce(is_integration_only, false) then
    raise exception 'core modules cannot be disabled'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_disabling_core_org_modules on public.organization_modules;

create trigger trg_prevent_disabling_core_org_modules
before insert or update on public.organization_modules
for each row
execute function public.prevent_disabling_core_org_modules();

create or replace function public.prevent_disabling_core_org_modules()
returns trigger
language plpgsql
as $$
declare
  is_core_module boolean;
begin
  select mc.is_core
  into is_core_module
  from public.module_catalog mc
  where mc.id = new.module_id;

  if coalesce(is_core_module, false) and new.is_enabled = false then
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

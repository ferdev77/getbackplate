create or replace function public.prevent_core_module_demotion()
returns trigger
language plpgsql
as $$
begin
  if old.is_core = true and new.is_core = false then
    raise exception 'core modules cannot be demoted'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_core_module_demotion on public.module_catalog;

create trigger trg_prevent_core_module_demotion
before update on public.module_catalog
for each row
execute function public.prevent_core_module_demotion();

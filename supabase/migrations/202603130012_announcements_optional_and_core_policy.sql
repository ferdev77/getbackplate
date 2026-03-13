create or replace function public.prevent_core_module_demotion()
returns trigger
language plpgsql
as $$
begin
  if old.is_core = true
    and new.is_core = false
    and old.code = any(array['dashboard', 'settings', 'employees', 'documents']) then
    raise exception 'core modules cannot be demoted'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

update public.module_catalog
set is_core = false
where code = 'announcements';

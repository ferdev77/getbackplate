begin;

do $remove$
declare
  -- Completar estos 2 campos antes de ejecutar.
  v_org_slug text := '__ORG_SLUG__';
  v_target_email text := '__USER_EMAIL__';

  v_org_id uuid;
  v_target_user_id uuid;
  v_table record;
begin
  if v_org_slug = '__ORG_SLUG__' or v_target_email = '__USER_EMAIL__' then
    raise exception 'Debes reemplazar __ORG_SLUG__ y __USER_EMAIL__ antes de ejecutar';
  end if;

  select o.id into v_org_id
  from public.organizations o
  where o.slug = v_org_slug
  limit 1;

  if v_org_id is null then
    raise exception 'No se encontro organization slug=%', v_org_slug;
  end if;

  select u.id into v_target_user_id
  from auth.users u
  where lower(coalesce(u.email, '')) = lower(v_target_email)
  limit 1;

  if v_target_user_id is null then
    raise exception 'No se encontro usuario auth por email=%', v_target_email;
  end if;

  for v_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname = 'public'
      and exists (
        select 1
        from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'organization_id'
          and a.attnum > 0
          and not a.attisdropped
      )
      and exists (
        select 1
        from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'user_id'
          and a.attnum > 0
          and not a.attisdropped
      )
    order by c.relname
  loop
    execute format(
      'delete from %I.%I where organization_id = %L::uuid and user_id = %L::uuid',
      v_table.schema_name,
      v_table.table_name,
      v_org_id,
      v_target_user_id
    );
  end loop;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_invitations'
      and column_name = 'organization_id'
  ) then
    delete from public.organization_invitations
    where organization_id = v_org_id
      and lower(coalesce(email, '')) = lower(v_target_email);
  end if;

  delete from public.audit_logs
  where actor_user_id = v_target_user_id;

  delete from auth.users
  where id = v_target_user_id;

  if exists (
    select 1
    from auth.users u
    where u.id = v_target_user_id
  ) then
    raise exception 'No se pudo eliminar auth.users id=%', v_target_user_id;
  end if;
end
$remove$;

commit;

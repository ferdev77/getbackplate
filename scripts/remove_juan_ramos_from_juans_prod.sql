begin;

do $remove$
declare
  v_org_slug text := 'juans-restaurants';
  v_target_email text := 'marketing@juansrestaurants.com';
  v_target_user_id uuid := 'f85fa73a-807e-4217-98a2-f30fe15652cc';
  v_org_id uuid;
  v_table record;
begin
  select o.id into v_org_id
  from public.organizations o
  where o.slug = v_org_slug
  limit 1;

  if v_org_id is null then
    raise exception 'No se encontro organization slug=%', v_org_slug;
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = v_target_user_id
      and lower(coalesce(u.email, '')) = lower(v_target_email)
  ) then
    raise exception 'El usuario objetivo no coincide con id/email esperados';
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

  if exists (
    select 1
    from public.memberships m
    where m.organization_id = v_org_id
      and m.user_id = v_target_user_id
  ) then
    raise exception 'No se pudo limpiar memberships del usuario objetivo';
  end if;
end
$remove$;

commit;

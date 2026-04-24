begin;

do $cleanup$
declare
  v_org_slug text := 'juans-restaurants';
  v_org_id uuid;
  v_admin_count integer;
  v_table record;
  v_deleted_count bigint;
  v_pass_deleted bigint;
  v_remaining_table text;
begin
  select o.id
    into v_org_id
  from public.organizations o
  where o.slug = v_org_slug
  limit 1;

  if v_org_id is null then
    raise exception 'No se encontro organization con slug=%', v_org_slug;
  end if;

  create temp table _keep_company_admin_users (
    user_id uuid primary key
  ) on commit drop;

  insert into _keep_company_admin_users (user_id)
  select distinct m.user_id
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.organization_id = v_org_id
    and m.status = 'active'
    and r.code = 'company_admin';

  get diagnostics v_admin_count = row_count;

  if v_admin_count = 0 then
    raise exception 'No hay usuarios company_admin activos para organization_id=%', v_org_id;
  end if;

  for v_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a
      on a.attrelid = c.oid
     and a.attname = 'organization_id'
     and a.attnum > 0
     and not a.attisdropped
    where c.relkind = 'r'
      and n.nspname = 'public'
      and c.relname not in (
        'organizations',
        'branches',
        'organization_departments',
        'department_positions',
        'memberships',
        'organization_user_profiles'
      )
    order by c.relname
  loop
    execute format(
      'delete from %I.%I where organization_id = %L::uuid',
      v_table.schema_name,
      v_table.table_name,
      v_org_id
    );
  end loop;

  delete from public.organization_user_profiles p
  where p.organization_id = v_org_id
    and p.user_id not in (select k.user_id from _keep_company_admin_users k);

  delete from public.memberships m
  where m.organization_id = v_org_id
    and m.user_id not in (select k.user_id from _keep_company_admin_users k);

  for v_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a
      on a.attrelid = c.oid
     and a.attname = 'organization_id'
     and a.attnum > 0
     and not a.attisdropped
    where c.relkind = 'r'
      and n.nspname = 'public'
      and c.relname not in (
        'organizations',
        'branches',
        'organization_departments',
        'department_positions',
        'memberships',
        'organization_user_profiles'
      )
    order by c.relname
  loop
    execute format(
      'select count(*) from %I.%I where organization_id = %L::uuid',
      v_table.schema_name,
      v_table.table_name,
      v_org_id
    ) into v_deleted_count;

    if v_deleted_count > 0 then
      v_remaining_table := v_table.table_name;
      exit;
    end if;
  end loop;

  if v_remaining_table is not null then
    raise exception 'Quedaron filas para organization_id=% en tabla=%', v_org_id, v_remaining_table;
  end if;
end
$cleanup$;

commit;

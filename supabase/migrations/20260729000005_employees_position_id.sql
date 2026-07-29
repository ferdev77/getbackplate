-- employees.position_id: referencia real al puesto, en lugar de resolverlo por nombre.
--
-- Hasta ahora la ficha del empleado guardaba el puesto SOLO como texto
-- (employees.position) y el alcance por puesto lo resolvia comparando ese texto
-- contra department_positions:
--
--   lower(trim(dp.name)) = lower(trim(e.position))
--
-- Consecuencia: renombrar un puesto dejaba la copia vieja y el empleado dejaba
-- de resolver a ningun puesto, con lo que quedaba silenciosamente fuera de todo
-- alcance filtrado por puesto. Paso de verdad: en Juans Restaurants un puesto
-- quedo como "Server" el 2026-07-14 y un empleado creado en abril conservo
-- "Servers", perdiendose avisos, checklists y documentos dirigidos a su puesto.
--
-- 20260729000004 (commit anterior) sincroniza la copia al renombrar, que tapa el
-- sintoma. Esta migracion elimina la causa: se agrega position_id como FK y las
-- funciones de alcance pasan a usarlo.
--
-- employees.position se conserva como copia de solo lectura para las pantallas
-- que muestran el nombre, y se mantiene sincronizada al renombrar el puesto.
--
-- Compatibilidad: las funciones usan position_id cuando esta cargado y, si no,
-- caen en la resolucion por nombre de siempre. Asi las fichas todavia no
-- migradas (o creadas por una version anterior del codigo mientras se despliega)
-- siguen funcionando exactamente igual que antes.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columna y backfill
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.employees
  add column if not exists position_id uuid references public.department_positions(id) on delete set null;

create index if not exists employees_position_id_idx
  on public.employees (organization_id, position_id);

-- Backfill con la misma regla que usaba el matching: mismo nombre sin distinguir
-- mayusculas ni espacios, dentro del departamento del empleado.
update public.employees e
set position_id = dp.id
from public.department_positions dp
where e.position_id is null
  and coalesce(nullif(trim(e.position), ''), '') <> ''
  and dp.organization_id = e.organization_id
  and dp.is_active = true
  and lower(trim(dp.name)) = lower(trim(e.position))
  and (e.department_id is null or dp.department_id = e.department_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ANNOUNCEMENT — usar position_id
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.can_read_announcement(
  ann_org_id uuid,
  ann_id uuid,
  ann_branch_id uuid,
  ann_scope jsonb,
  ann_created_by uuid
)
returns boolean
language plpgsql
stable
as $$
declare
  v_user_id            uuid    := auth.uid();
  v_all_branch_ids     uuid[]  := '{}';
  v_has_all_locations  boolean := false;
  v_employee_department_id uuid;
  v_employee_position  text;
  v_employee_position_id uuid;
  v_employee_position_ids uuid[] := '{}';
  v_emp_has_all        boolean;
  v_emp_branch_id      uuid;
  v_emp_scope_ids      uuid[];
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(ann_org_id) then
    return true;
  end if;

  if not public.has_org_membership(ann_org_id) then
    return false;
  end if;

  if ann_created_by = v_user_id then
    return true;
  end if;

  select
    coalesce(bool_or(coalesce(m.all_locations, false)), false),
    coalesce(
      array_agg(distinct expanded.bid) filter (where expanded.bid is not null),
      '{}'
    )
  into v_has_all_locations, v_all_branch_ids
  from public.memberships m
  cross join lateral (
    select m.branch_id as bid
    union all
    select unnest(coalesce(m.location_scope_ids, '{}')) as bid
  ) as expanded(bid)
  where m.organization_id = ann_org_id
    and m.user_id = v_user_id
    and m.status = 'active';

  select e.all_locations, e.branch_id, e.location_scope_ids, e.department_id, e.position, e.position_id
    into v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id, v_employee_position, v_employee_position_id
  from public.employees e
  where e.organization_id = ann_org_id
    and e.user_id = v_user_id
  limit 1;

  if coalesce(v_emp_has_all, false) then
    v_has_all_locations := true;
  end if;

  if v_emp_branch_id is not null then
    v_all_branch_ids := v_all_branch_ids || array[v_emp_branch_id];
  end if;

  if v_emp_scope_ids is not null then
    v_all_branch_ids := v_all_branch_ids || v_emp_scope_ids;
  end if;

  if v_has_all_locations then
    select coalesce(array_agg(b.id), '{}')
      into v_all_branch_ids
    from public.branches b
    where b.organization_id = ann_org_id
      and b.is_active = true;
  end if;

  -- Referencia real si esta cargada; si no, resolucion por nombre (heredado).
  if v_employee_position_id is not null then
    v_employee_position_ids := array[v_employee_position_id];
  elsif coalesce(nullif(trim(v_employee_position), ''), '') <> '' then
    select coalesce(array_agg(dp.id), '{}')
      into v_employee_position_ids
    from public.department_positions dp
    where dp.organization_id = ann_org_id
      and dp.is_active = true
      and lower(trim(dp.name)) = lower(trim(v_employee_position))
      and (
        v_employee_department_id is null
        or dp.department_id = v_employee_department_id
      );
  end if;

  if ann_branch_id is not null then
    if not (v_has_all_locations or ann_branch_id = any(v_all_branch_ids)) then
      return false;
    end if;
  end if;

  return public.announcement_scope_match(
    ann_scope,
    v_user_id,
    v_all_branch_ids,
    v_employee_department_id,
    v_employee_position_ids
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CHECKLIST TEMPLATE — usar position_id
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.can_read_checklist_template(
  template_org_id uuid,
  template_branch_id uuid,
  template_department_id uuid,
  template_scope jsonb
)
returns boolean
language plpgsql
stable
as $$
declare
  v_user_id            uuid    := auth.uid();
  v_all_branch_ids     uuid[]  := '{}';
  v_has_all_locations  boolean := false;
  v_employee_department_id uuid;
  v_employee_position  text;
  v_employee_position_id uuid;
  v_employee_position_ids uuid[] := '{}';
  v_emp_has_all        boolean;
  v_emp_branch_id      uuid;
  v_emp_scope_ids      uuid[];
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(template_org_id) then
    return true;
  end if;

  if not public.has_org_membership(template_org_id) then
    return false;
  end if;

  select
    coalesce(bool_or(coalesce(m.all_locations, false)), false),
    coalesce(
      array_agg(distinct expanded.bid) filter (where expanded.bid is not null),
      '{}'
    )
  into v_has_all_locations, v_all_branch_ids
  from public.memberships m
  cross join lateral (
    select m.branch_id as bid
    union all
    select unnest(coalesce(m.location_scope_ids, '{}')) as bid
  ) as expanded(bid)
  where m.organization_id = template_org_id
    and m.user_id = v_user_id
    and m.status = 'active';

  select e.all_locations, e.branch_id, e.location_scope_ids, e.department_id, e.position, e.position_id
    into v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id, v_employee_position, v_employee_position_id
  from public.employees e
  where e.organization_id = template_org_id
    and e.user_id = v_user_id
  limit 1;

  if coalesce(v_emp_has_all, false) then
    v_has_all_locations := true;
  end if;

  if v_emp_branch_id is not null then
    v_all_branch_ids := v_all_branch_ids || array[v_emp_branch_id];
  end if;

  if v_emp_scope_ids is not null then
    v_all_branch_ids := v_all_branch_ids || v_emp_scope_ids;
  end if;

  if v_has_all_locations then
    select coalesce(array_agg(b.id), '{}')
      into v_all_branch_ids
    from public.branches b
    where b.organization_id = template_org_id
      and b.is_active = true;
  end if;

  if v_employee_position_id is not null then
    v_employee_position_ids := array[v_employee_position_id];
  elsif coalesce(nullif(trim(v_employee_position), ''), '') <> '' then
    select coalesce(array_agg(dp.id), '{}')
      into v_employee_position_ids
    from public.department_positions dp
    where dp.organization_id = template_org_id
      and dp.is_active = true
      and lower(trim(dp.name)) = lower(trim(v_employee_position))
      and (
        v_employee_department_id is null
        or dp.department_id = v_employee_department_id
      );
  end if;

  if template_branch_id is not null then
    if not (v_has_all_locations or template_branch_id = any(v_all_branch_ids)) then
      return false;
    end if;
  end if;

  if template_department_id is not null and (v_employee_department_id is null or template_department_id <> v_employee_department_id) then
    return false;
  end if;

  return public.checklist_scope_match(
    template_scope,
    v_user_id,
    v_all_branch_ids,
    v_employee_department_id,
    v_employee_position_ids
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DOCUMENTOS Y CARPETAS — usar position_id
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.current_user_matches_document_scope(
  p_organization_id uuid,
  p_document_branch_id uuid,
  p_scope jsonb,
  p_document_id uuid default null
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_scope jsonb := coalesce(p_scope, '{}'::jsonb);
  v_location_count integer := 0;
  v_department_count integer := 0;
  v_position_count integer := 0;
  v_user_count integer := 0;
  v_branch_ids uuid[] := '{}';
  v_all_locations boolean := false;
  v_employee_id uuid;
  v_employee_branch_id uuid;
  v_employee_location_ids uuid[] := '{}';
  v_employee_all_locations boolean := false;
  v_department_id uuid;
  v_position_name text;
  v_employee_position_id uuid;
  v_position_ids uuid[] := '{}';
  v_location_match boolean := false;
  v_department_match boolean := false;
  v_position_match boolean := false;
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(p_organization_id) then
    return true;
  end if;

  if not public.has_org_membership(p_organization_id) then
    return false;
  end if;

  select
    coalesce(bool_or(coalesce(m.all_locations, false)), false),
    coalesce(array_agg(distinct location.id) filter (where location.id is not null), '{}')
  into v_all_locations, v_branch_ids
  from public.memberships m
  cross join lateral (
    select m.branch_id as id
    union all
    select unnest(coalesce(m.location_scope_ids, '{}')) as id
  ) location
  where m.organization_id = p_organization_id
    and m.user_id = v_user_id
    and m.status = 'active';

  select e.id, e.branch_id, e.location_scope_ids, e.all_locations, e.department_id, e.position, e.position_id
  into v_employee_id, v_employee_branch_id, v_employee_location_ids,
       v_employee_all_locations, v_department_id, v_position_name, v_employee_position_id
  from public.employees e
  where e.organization_id = p_organization_id
    and e.user_id = v_user_id
  limit 1;

  if p_document_id is not null and v_employee_id is not null and exists (
    select 1
    from public.employee_documents ed
    where ed.organization_id = p_organization_id
      and ed.employee_id = v_employee_id
      and ed.document_id = p_document_id
  ) then
    return true;
  end if;

  if coalesce(v_employee_all_locations, false) then
    v_all_locations := true;
  end if;
  if v_employee_branch_id is not null then
    v_branch_ids := v_branch_ids || array[v_employee_branch_id];
  end if;
  if v_employee_location_ids is not null then
    v_branch_ids := v_branch_ids || v_employee_location_ids;
  end if;
  if v_all_locations then
    select coalesce(array_agg(branch.id), '{}')
    into v_branch_ids
    from public.branches branch
    where branch.organization_id = p_organization_id
      and branch.is_active = true;
  end if;

  if v_employee_position_id is not null then
    v_position_ids := array[v_employee_position_id];
  elsif coalesce(nullif(trim(v_position_name), ''), '') <> '' then
    select coalesce(array_agg(position.id), '{}')
    into v_position_ids
    from public.department_positions position
    where position.organization_id = p_organization_id
      and position.is_active = true
      and lower(trim(position.name)) = lower(trim(v_position_name))
      and (v_department_id is null or position.department_id = v_department_id);
  end if;

  v_user_count := case when jsonb_typeof(v_scope->'users') = 'array'
    then jsonb_array_length(v_scope->'users') else 0 end;
  v_location_count := case when jsonb_typeof(v_scope->'locations') = 'array'
    then jsonb_array_length(v_scope->'locations') else 0 end;
  v_department_count := case when jsonb_typeof(v_scope->'department_ids') = 'array'
    then jsonb_array_length(v_scope->'department_ids') else 0 end;
  v_position_count := case when jsonb_typeof(v_scope->'position_ids') = 'array'
    then jsonb_array_length(v_scope->'position_ids') else 0 end;

  if v_user_count > 0 and exists (
    select 1
    from jsonb_array_elements_text(v_scope->'users') scoped(value)
    where scoped.value = v_user_id::text
  ) then
    return true;
  end if;

  if v_user_count > 0
    and v_location_count = 0
    and v_department_count = 0
    and v_position_count = 0 then
    return false;
  end if;

  if v_location_count = 0
    and v_department_count = 0
    and v_position_count = 0
    and p_document_branch_id is null then
    return true;
  end if;

  if v_location_count > 0 then
    v_location_match := exists (
      select 1
      from jsonb_array_elements_text(v_scope->'locations') scoped(value)
      cross join unnest(v_branch_ids) allowed(id)
      where scoped.value = allowed.id::text
    );
  elsif p_document_branch_id is not null then
    v_location_match := p_document_branch_id = any(v_branch_ids);
  else
    v_location_match := true;
  end if;

  if v_department_count > 0 then
    v_department_match := v_department_id is not null and exists (
      select 1
      from jsonb_array_elements_text(v_scope->'department_ids') scoped(value)
      where scoped.value = v_department_id::text
    );
  else
    v_department_match := true;
  end if;

  if v_position_count > 0 then
    v_position_match := coalesce(array_length(v_position_ids, 1), 0) > 0 and exists (
      select 1
      from jsonb_array_elements_text(v_scope->'position_ids') scoped(value)
      cross join unnest(v_position_ids) allowed(id)
      where scoped.value = allowed.id::text
    );
  else
    v_position_match := true;
  end if;

  return v_location_match and v_department_match and v_position_match;
end;
$$;

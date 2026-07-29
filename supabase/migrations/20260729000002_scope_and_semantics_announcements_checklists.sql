-- Alinea avisos y checklists con la Regla de Oro de Alcance (web/README_SCOPE_GOLDEN_RULE.md):
-- "los valores dentro de una dimension usan OR y las dimensiones pobladas usan AND".
--
-- Estado que corrige esta migracion (verificado con sondas directas contra dev,
-- no deducido de los archivos de migracion):
--
--   announcement_scope_match / checklist_scope_match  (jsonb, uuid, uuid[], uuid, uuid[])
--     - Alcance de solo personas: privado. OK.
--     - Dimensiones pobladas: usaba OR. Cumplir la ubicacion alcanzaba para
--       entrar aunque el departamento o el puesto no coincidieran, con lo que
--       agregar un filtro no reducia nada.
--
--   announcement_scope_match / checklist_scope_match  (jsonb, uuid, uuid, uuid, text[])
--     Overloads muertos de marzo. Nada deberia atarse a ellos, pero
--     can_read_announcement/5 lo hacia (ver abajo). Se eliminan para que no
--     puedan volver a capturar una llamada por resolucion de tipos.
--
--   can_read_announcement(uuid, uuid, uuid, jsonb, uuid)
--     Es la que usa realmente la politica announcements_tenant_select. Habia
--     quedado en la version de marzo: calculaba una unica sucursal efectiva
--     (coalesce(membership.branch_id, employee.branch_id)) y pasaba text[] de
--     puestos, con lo que se ataba al overload muerto. Efectos:
--       a) sin soporte multi-sucursal — un empleado con location_scope_ids o
--          all_locations no veia avisos alcanzados por sus sucursales
--          secundarias (el fix de mayo nunca llego a este camino);
--       b) un alcance de solo personas se comportaba como difusion.
--     Los scripts de verificacion apuntaban a can_read_announcement/4, que la
--     politica no usa: por eso ninguna regresion fue detectada.
--
-- can_read_checklist_template ya calculaba bien las sucursales efectivas y
-- llamaba al overload de arrays; no necesita cambios.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ANNOUNCEMENT SCOPE MATCH — OR dentro de cada dimension, AND entre dimensiones
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.announcement_scope_match(
  scope jsonb,
  member_user_id uuid,
  member_branch_ids uuid[],
  employee_department_id uuid,
  employee_position_ids uuid[] default '{}'::uuid[]
)
returns boolean
language sql
stable
as $$
  with prepared as (
    select coalesce(scope, '{}'::jsonb) as value
  ), lengths as (
    select
      jsonb_array_length(coalesce(value->'users', '[]'::jsonb)) as users_len,
      jsonb_array_length(coalesce(value->'locations', '[]'::jsonb)) as locations_len,
      jsonb_array_length(coalesce(value->'department_ids', '[]'::jsonb)) as departments_len,
      jsonb_array_length(coalesce(value->'position_ids', '[]'::jsonb)) as positions_len,
      value
    from prepared
  )
  select case
    -- Excepcion explicita: quien esta en la lista entra siempre.
    when users_len > 0 and exists (
      select 1
      from jsonb_array_elements_text(coalesce(value->'users', '[]'::jsonb)) as scoped_user(item)
      where scoped_user.item = member_user_id::text
    ) then true

    -- Sin filtros: difusion solo si tampoco hay personas. Un alcance de solo
    -- personas es privado para todo el que no este listado.
    when (locations_len + departments_len + positions_len) = 0 then users_len = 0

    -- Dimensiones pobladas: OR dentro de cada una, AND entre ellas.
    else
      (
        locations_len = 0
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'locations', '[]'::jsonb)) as scoped_location(item)
          cross join unnest(coalesce(member_branch_ids, '{}'::uuid[])) as allowed_id
          where scoped_location.item = allowed_id::text
        )
      )
      and (
        departments_len = 0
        or (
          employee_department_id is not null
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(value->'department_ids', '[]'::jsonb)) as scoped_department(item)
            where scoped_department.item = employee_department_id::text
          )
        )
      )
      and (
        positions_len = 0
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'position_ids', '[]'::jsonb)) as scoped_position(item)
          cross join unnest(coalesce(employee_position_ids, '{}'::uuid[])) as allowed_position
          where scoped_position.item = allowed_position::text
        )
      )
  end
  from lengths;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CHECKLIST SCOPE MATCH — misma regla
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.checklist_scope_match(
  scope jsonb,
  member_user_id uuid,
  member_branch_ids uuid[],
  employee_department_id uuid,
  employee_position_ids uuid[] default '{}'::uuid[]
)
returns boolean
language sql
stable
as $$
  with prepared as (
    select coalesce(scope, '{}'::jsonb) as value
  ), lengths as (
    select
      jsonb_array_length(coalesce(value->'users', '[]'::jsonb)) as users_len,
      jsonb_array_length(coalesce(value->'locations', '[]'::jsonb)) as locations_len,
      jsonb_array_length(coalesce(value->'department_ids', '[]'::jsonb)) as departments_len,
      jsonb_array_length(coalesce(value->'position_ids', '[]'::jsonb)) as positions_len,
      value
    from prepared
  )
  select case
    when users_len > 0 and exists (
      select 1
      from jsonb_array_elements_text(coalesce(value->'users', '[]'::jsonb)) as scoped_user(item)
      where scoped_user.item = member_user_id::text
    ) then true

    when (locations_len + departments_len + positions_len) = 0 then users_len = 0

    else
      (
        locations_len = 0
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'locations', '[]'::jsonb)) as scoped_location(item)
          cross join unnest(coalesce(member_branch_ids, '{}'::uuid[])) as allowed_id
          where scoped_location.item = allowed_id::text
        )
      )
      and (
        departments_len = 0
        or (
          employee_department_id is not null
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(value->'department_ids', '[]'::jsonb)) as scoped_department(item)
            where scoped_department.item = employee_department_id::text
          )
        )
      )
      and (
        positions_len = 0
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'position_ids', '[]'::jsonb)) as scoped_position(item)
          cross join unnest(coalesce(employee_position_ids, '{}'::uuid[])) as allowed_position
          where scoped_position.item = allowed_position::text
        )
      )
  end
  from lengths;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CAN READ ANNOUNCEMENT (5 args) — la que usa la politica.
--    Calcula sucursales efectivas y pasa uuid[]/uuid[], igual que checklists.
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
  v_employee_position_ids uuid[] := '{}';
  v_emp_has_all        boolean;
  v_emp_branch_id      uuid;
  v_emp_scope_ids      uuid[];
  v_has_any_audience   boolean := false;
  v_audience_match     boolean := false;
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

  -- Sucursales efectivas: membresia (branch_id + location_scope_ids) combinada
  -- con la ficha de empleado, y expandida a toda la organizacion si tiene
  -- all_locations en cualquiera de las dos.
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

  select e.all_locations, e.branch_id, e.location_scope_ids, e.department_id, e.position
    into v_emp_has_all, v_emp_branch_id, v_emp_scope_ids, v_employee_department_id, v_employee_position
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

  if coalesce(nullif(trim(v_employee_position), ''), '') <> '' then
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

  select exists (
      select 1
      from public.announcement_audiences aa
      where aa.organization_id = ann_org_id
        and aa.announcement_id = ann_id
    )
    into v_has_any_audience;

  if not v_has_any_audience then
    v_audience_match := true;
  else
    v_audience_match := exists (
      select 1
      from public.announcement_audiences aa
      where aa.organization_id = ann_org_id
        and aa.announcement_id = ann_id
        and (
          aa.user_id = v_user_id
          or (aa.user_id is null and aa.branch_id is null)
          or (
            aa.user_id is null
            and aa.branch_id is not null
            and aa.branch_id = any(v_all_branch_ids)
          )
        )
    );
  end if;

  if not v_audience_match then
    return false;
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
-- 4. CAN READ ANNOUNCEMENT (4 args) — pasa a delegar en la de 5.
--    La usan los runners de verificacion; al delegar, prueban el camino real
--    de la politica en lugar de una copia paralela que podia divergir.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.can_read_announcement(
  ann_org_id uuid,
  ann_id uuid,
  ann_branch_id uuid,
  ann_scope jsonb
)
returns boolean
language sql
stable
as $$
  select public.can_read_announcement(ann_org_id, ann_id, ann_branch_id, ann_scope, null::uuid);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Eliminar los overloads muertos de marzo.
--    Ya nadie los referencia despues de los pasos 3 y 4.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.announcement_scope_match(jsonb, uuid, uuid, uuid, text[]);
drop function if exists public.checklist_scope_match(jsonb, uuid, uuid, uuid, text[]);

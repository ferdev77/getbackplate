-- Fix infinite RLS recursion when reading public.document_folders.
--
-- document_folders_tenant_select (added in 20260726000002) uses
-- can_read_document_folder(organization_id, id) as its USING clause.
-- The version of can_read_document_folder currently live in production
-- (redefined by 20260726000004, dropping the earlier admin short-circuit)
-- calls resolve_folder_effective_scope(...) unconditionally, which itself
-- runs a recursive `select ... from public.document_folders` to walk the
-- parent chain. Because resolve_folder_effective_scope is SECURITY INVOKER
-- (the default), that internal select is itself subject to RLS, which
-- re-evaluates can_read_document_folder for the same row, which calls
-- resolve_folder_effective_scope again — infinite recursion, confirmed via
-- "stack depth limit exceeded" for every caller (including company_admin).
--
-- Fix: mark resolve_folder_effective_scope SECURITY DEFINER (same pattern
-- already used by is_superadmin/has_org_membership/can_manage_org), so its
-- internal read of document_folders bypasses RLS instead of re-entering it.
-- The function only returns a resolved scope jsonb (no raw rows), so this
-- does not expose anything beyond what callers already compute.

create or replace function public.resolve_folder_effective_scope(
  p_org_id uuid,
  p_folder_id uuid
)
returns table (scope jsonb, source_folder_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select f.id, f.parent_id, f.access_scope, 0 as depth
    from public.document_folders f
    where f.organization_id = p_org_id and f.id = p_folder_id
    union all
    select f.id, f.parent_id, f.access_scope, c.depth + 1
    from public.document_folders f
    join chain c on f.id = c.parent_id
    where f.organization_id = p_org_id and c.depth < 50
  ),
  scoped as (
    select c.id, c.access_scope, c.depth
    from chain c
    where (
      jsonb_typeof(coalesce(c.access_scope, '{}'::jsonb)->'users') = 'array'
        and jsonb_array_length(coalesce(c.access_scope, '{}'::jsonb)->'users') > 0
      or jsonb_typeof(coalesce(c.access_scope, '{}'::jsonb)->'locations') = 'array'
        and jsonb_array_length(coalesce(c.access_scope, '{}'::jsonb)->'locations') > 0
      or jsonb_typeof(coalesce(c.access_scope, '{}'::jsonb)->'department_ids') = 'array'
        and jsonb_array_length(coalesce(c.access_scope, '{}'::jsonb)->'department_ids') > 0
      or jsonb_typeof(coalesce(c.access_scope, '{}'::jsonb)->'position_ids') = 'array'
        and jsonb_array_length(coalesce(c.access_scope, '{}'::jsonb)->'position_ids') > 0
    )
    order by c.depth asc
    limit 1
  )
  select coalesce((select access_scope from scoped), '{}'::jsonb), (select id from scoped);
$$;

revoke all on function public.resolve_folder_effective_scope(uuid, uuid) from public, anon;
grant execute on function public.resolve_folder_effective_scope(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

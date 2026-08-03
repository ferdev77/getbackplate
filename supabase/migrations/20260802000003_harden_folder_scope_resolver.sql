-- Keep recursive folder reads out of document_folders RLS without exposing a
-- definer-owned scope resolver directly to application roles.

create schema if not exists app_private;

revoke all on schema app_private from public, anon, authenticated, service_role;

create or replace function app_private.resolve_folder_effective_scope(
  p_org_id uuid,
  p_folder_id uuid
)
returns table (scope jsonb, source_folder_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chain as (
    select folder.id, folder.parent_id, folder.access_scope, 0 as depth
    from public.document_folders folder
    where folder.organization_id = p_org_id
      and folder.id = p_folder_id

    union all

    select folder.id, folder.parent_id, folder.access_scope, chain.depth + 1
    from public.document_folders folder
    join chain on folder.id = chain.parent_id
    where folder.organization_id = p_org_id
      and chain.depth < 50
  ),
  scoped as (
    select chain.id, chain.access_scope, chain.depth
    from chain
    where (
      jsonb_typeof(coalesce(chain.access_scope, '{}'::jsonb)->'users') = 'array'
        and jsonb_array_length(coalesce(chain.access_scope, '{}'::jsonb)->'users') > 0
      or jsonb_typeof(coalesce(chain.access_scope, '{}'::jsonb)->'locations') = 'array'
        and jsonb_array_length(coalesce(chain.access_scope, '{}'::jsonb)->'locations') > 0
      or jsonb_typeof(coalesce(chain.access_scope, '{}'::jsonb)->'department_ids') = 'array'
        and jsonb_array_length(coalesce(chain.access_scope, '{}'::jsonb)->'department_ids') > 0
      or jsonb_typeof(coalesce(chain.access_scope, '{}'::jsonb)->'position_ids') = 'array'
        and jsonb_array_length(coalesce(chain.access_scope, '{}'::jsonb)->'position_ids') > 0
    )
    order by chain.depth asc
    limit 1
  )
  select
    coalesce((select scoped.access_scope from scoped), '{}'::jsonb),
    (select scoped.id from scoped);
$$;

revoke all on function app_private.resolve_folder_effective_scope(uuid, uuid)
  from public, anon, authenticated, service_role;

-- RLS calls this helper. It must bypass document_folders RLS while resolving
-- the parent chain, but it exposes only the caller-specific boolean decision.
create or replace function public.can_read_document_folder(
  folder_org_id uuid,
  folder_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective_scope jsonb;
begin
  select resolved.scope
  into v_effective_scope
  from app_private.resolve_folder_effective_scope(folder_org_id, folder_id) resolved;

  return public.current_user_matches_document_scope(
    folder_org_id,
    null,
    v_effective_scope,
    null
  );
end;
$$;

-- Documents with no explicit scope inherit through the same private resolver.
create or replace function public.can_read_document(
  doc_org_id uuid,
  doc_branch_id uuid,
  doc_access_scope jsonb,
  doc_id uuid,
  doc_folder_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_effective_scope jsonb := coalesce(doc_access_scope, '{}'::jsonb);
  v_has_explicit_scope boolean;
begin
  v_has_explicit_scope :=
    (jsonb_typeof(v_effective_scope->'users') = 'array' and jsonb_array_length(v_effective_scope->'users') > 0)
    or (jsonb_typeof(v_effective_scope->'locations') = 'array' and jsonb_array_length(v_effective_scope->'locations') > 0)
    or (jsonb_typeof(v_effective_scope->'department_ids') = 'array' and jsonb_array_length(v_effective_scope->'department_ids') > 0)
    or (jsonb_typeof(v_effective_scope->'position_ids') = 'array' and jsonb_array_length(v_effective_scope->'position_ids') > 0);

  if not v_has_explicit_scope and doc_folder_id is not null then
    select resolved.scope
    into v_effective_scope
    from app_private.resolve_folder_effective_scope(doc_org_id, doc_folder_id) resolved;
  end if;

  return public.current_user_matches_document_scope(
    doc_org_id,
    doc_branch_id,
    v_effective_scope,
    doc_id
  );
end;
$$;

-- Preserve the existing RPC signature for external callers, but authorize the
-- effective scope after resolving it without touching RLS-protected rows as the
-- caller. Unauthorized and nonexistent folders return no rows.
create or replace function public.resolve_folder_effective_scope(
  p_org_id uuid,
  p_folder_id uuid
)
returns table (scope jsonb, source_folder_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope jsonb;
  v_source_folder_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1
    from public.document_folders folder
    where folder.organization_id = p_org_id
      and folder.id = p_folder_id
  ) then
    return;
  end if;

  select resolved.scope, resolved.source_folder_id
  into v_scope, v_source_folder_id
  from app_private.resolve_folder_effective_scope(p_org_id, p_folder_id) resolved;

  if coalesce(auth.role(), '') <> 'service_role'
    and not public.current_user_matches_document_scope(p_org_id, null, v_scope, null) then
    return;
  end if;

  return query select v_scope, v_source_folder_id;
end;
$$;

revoke all on function public.can_read_document_folder(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_read_document(uuid, uuid, jsonb, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_folder_effective_scope(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.can_read_document_folder(uuid, uuid)
  to authenticated;
grant execute on function public.can_read_document(uuid, uuid, jsonb, uuid, uuid)
  to authenticated;
grant execute on function public.resolve_folder_effective_scope(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

-- jsonb_typeof on a missing key returns SQL NULL. Without coalesce, the OR
-- expression that detects an explicit scope also becomes NULL, so `not
-- v_has_explicit_scope` is not true and a document fails to inherit its folder.

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
    coalesce(
      jsonb_typeof(v_effective_scope->'users') = 'array'
      and jsonb_array_length(v_effective_scope->'users') > 0,
      false
    )
    or coalesce(
      jsonb_typeof(v_effective_scope->'locations') = 'array'
      and jsonb_array_length(v_effective_scope->'locations') > 0,
      false
    )
    or coalesce(
      jsonb_typeof(v_effective_scope->'department_ids') = 'array'
      and jsonb_array_length(v_effective_scope->'department_ids') > 0,
      false
    )
    or coalesce(
      jsonb_typeof(v_effective_scope->'position_ids') = 'array'
      and jsonb_array_length(v_effective_scope->'position_ids') > 0,
      false
    );

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

revoke all on function public.can_read_document(uuid, uuid, jsonb, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_read_document(uuid, uuid, jsonb, uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';

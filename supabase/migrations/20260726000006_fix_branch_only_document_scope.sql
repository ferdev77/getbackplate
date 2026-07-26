-- Reconcile environments that applied the scope helper before the legacy
-- branch-only regression was discovered. Fresh environments already receive
-- the corrected definition from migration 20260726000004.
do $$
declare
  v_function_definition text;
  v_old_fragment text := 'if v_location_count = 0 and v_department_count = 0 and v_position_count = 0 then
    return v_user_count = 0 and p_document_branch_id is null;';
  v_new_fragment text := 'if v_location_count = 0 and v_department_count = 0 and v_position_count = 0
    and p_document_branch_id is null then
    return v_user_count = 0;';
begin
  select pg_get_functiondef(
    'public.current_user_matches_document_scope(uuid,uuid,jsonb,uuid)'::regprocedure
  ) into v_function_definition;

  if position(v_old_fragment in v_function_definition) > 0 then
    execute replace(v_function_definition, v_old_fragment, v_new_fragment);
  elsif position(v_new_fragment in v_function_definition) = 0 then
    raise exception 'Unexpected current_user_matches_document_scope definition';
  end if;
end;
$$;

notify pgrst, 'reload schema';

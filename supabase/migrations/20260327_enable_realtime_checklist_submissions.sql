-- Enable realtime replication for checklist_submissions table
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'checklist_submissions'
  ) then
    alter publication supabase_realtime add table checklist_submissions;
  end if;
end
$$;

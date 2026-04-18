do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'scheduled_jobs'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scheduled_jobs'
  ) then
    execute 'alter publication supabase_realtime add table public.scheduled_jobs';
  end if;
end
$$;

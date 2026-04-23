alter table public.feedback_messages
  add column if not exists source_channel text;

update public.feedback_messages
set source_channel = case
  when page_path like '/portal/%' then 'employee'
  else 'company'
end
where source_channel is null;

alter table public.feedback_messages
  alter column source_channel set default 'company';

alter table public.feedback_messages
  alter column source_channel set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feedback_messages_source_channel_check'
  ) then
    alter table public.feedback_messages
      add constraint feedback_messages_source_channel_check
      check (source_channel in ('company', 'employee'));
  end if;
end $$;

create index if not exists feedback_messages_source_channel_idx
  on public.feedback_messages(source_channel);

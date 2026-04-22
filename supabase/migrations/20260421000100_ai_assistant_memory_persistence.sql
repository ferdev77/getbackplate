create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null,
  origin_module text,
  title text,
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  last_message_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_conversations_org_user_idx
  on public.ai_conversations (organization_id, user_id, status, last_message_at desc);

create index if not exists ai_conversations_last_message_idx
  on public.ai_conversations (last_message_at desc);

drop trigger if exists set_updated_at_ai_conversations on public.ai_conversations;
create trigger set_updated_at_ai_conversations
before update on public.ai_conversations
for each row execute function public.set_updated_at();

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  mode text,
  provider text,
  model text,
  confidence text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at desc);

create index if not exists ai_messages_org_user_created_idx
  on public.ai_messages (organization_id, user_id, created_at desc);

create table if not exists public.ai_user_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  profile_summary text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ai_user_memory_unique_org_user unique (organization_id, user_id)
);

create index if not exists ai_user_memory_org_user_idx
  on public.ai_user_memory (organization_id, user_id);

drop trigger if exists set_updated_at_ai_user_memory on public.ai_user_memory;
create trigger set_updated_at_ai_user_memory
before update on public.ai_user_memory
for each row execute function public.set_updated_at();

create or replace function public.cleanup_ai_assistant_data(
  p_message_retention_days integer default 90,
  p_archive_after_days integer default 30,
  p_delete_archived_after_days integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_messages integer := 0;
  v_archived_conversations integer := 0;
  v_deleted_conversations integer := 0;
begin
  update public.ai_conversations
  set status = 'archived', updated_at = timezone('utc', now())
  where status = 'active'
    and last_message_at < timezone('utc', now()) - make_interval(days => p_archive_after_days);

  get diagnostics v_archived_conversations = row_count;

  delete from public.ai_messages
  where created_at < timezone('utc', now()) - make_interval(days => p_message_retention_days);

  get diagnostics v_deleted_messages = row_count;

  delete from public.ai_conversations c
  where c.status = 'archived'
    and c.updated_at < timezone('utc', now()) - make_interval(days => p_delete_archived_after_days)
    and not exists (
      select 1
      from public.ai_messages m
      where m.conversation_id = c.id
    );

  get diagnostics v_deleted_conversations = row_count;

  return jsonb_build_object(
    'archived_conversations', v_archived_conversations,
    'deleted_messages', v_deleted_messages,
    'deleted_conversations', v_deleted_conversations
  );
end;
$$;

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_user_memory enable row level security;

drop policy if exists ai_conversations_select_own on public.ai_conversations;
create policy ai_conversations_select_own
  on public.ai_conversations
  for select
  using (auth.uid() = user_id and public.has_org_membership(organization_id));

drop policy if exists ai_conversations_insert_own on public.ai_conversations;
create policy ai_conversations_insert_own
  on public.ai_conversations
  for insert
  with check (auth.uid() = user_id and public.has_org_membership(organization_id));

drop policy if exists ai_conversations_update_own on public.ai_conversations;
create policy ai_conversations_update_own
  on public.ai_conversations
  for update
  using (auth.uid() = user_id and public.has_org_membership(organization_id))
  with check (auth.uid() = user_id and public.has_org_membership(organization_id));

drop policy if exists ai_conversations_delete_own on public.ai_conversations;
create policy ai_conversations_delete_own
  on public.ai_conversations
  for delete
  using (auth.uid() = user_id and public.has_org_membership(organization_id));

drop policy if exists ai_messages_select_own on public.ai_messages;
create policy ai_messages_select_own
  on public.ai_messages
  for select
  using (
    auth.uid() = user_id
    and public.has_org_membership(organization_id)
    and exists (
      select 1
      from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
        and c.organization_id = organization_id
    )
  );

drop policy if exists ai_messages_insert_own on public.ai_messages;
create policy ai_messages_insert_own
  on public.ai_messages
  for insert
  with check (
    auth.uid() = user_id
    and public.has_org_membership(organization_id)
    and exists (
      select 1
      from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
        and c.organization_id = organization_id
    )
  );

drop policy if exists ai_messages_update_own on public.ai_messages;
create policy ai_messages_update_own
  on public.ai_messages
  for update
  using (
    auth.uid() = user_id
    and public.has_org_membership(organization_id)
    and exists (
      select 1
      from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
        and c.organization_id = organization_id
    )
  )
  with check (
    auth.uid() = user_id
    and public.has_org_membership(organization_id)
    and exists (
      select 1
      from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
        and c.organization_id = organization_id
    )
  );

drop policy if exists ai_messages_delete_own on public.ai_messages;
create policy ai_messages_delete_own
  on public.ai_messages
  for delete
  using (
    auth.uid() = user_id
    and public.has_org_membership(organization_id)
    and exists (
      select 1
      from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
        and c.organization_id = organization_id
    )
  );

drop policy if exists ai_user_memory_select_own on public.ai_user_memory;
create policy ai_user_memory_select_own
  on public.ai_user_memory
  for select
  using (auth.uid() = user_id and public.has_org_membership(organization_id));

drop policy if exists ai_user_memory_insert_own on public.ai_user_memory;
create policy ai_user_memory_insert_own
  on public.ai_user_memory
  for insert
  with check (auth.uid() = user_id and public.has_org_membership(organization_id));

drop policy if exists ai_user_memory_update_own on public.ai_user_memory;
create policy ai_user_memory_update_own
  on public.ai_user_memory
  for update
  using (auth.uid() = user_id and public.has_org_membership(organization_id))
  with check (auth.uid() = user_id and public.has_org_membership(organization_id));

drop policy if exists ai_user_memory_delete_own on public.ai_user_memory;
create policy ai_user_memory_delete_own
  on public.ai_user_memory
  for delete
  using (auth.uid() = user_id and public.has_org_membership(organization_id));

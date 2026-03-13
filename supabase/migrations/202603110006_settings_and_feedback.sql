create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  support_email text,
  support_phone text,
  timezone text,
  primary_color text,
  accent_color text,
  dashboard_note text,
  feedback_whatsapp text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id)
);

create trigger set_org_settings_updated_at
before update on public.organization_settings
for each row
execute function public.set_updated_at();

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null default 'idea' check (feedback_type in ('bug', 'idea', 'other')),
  title text not null,
  message text not null,
  page_path text,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger set_feedback_messages_updated_at
before update on public.feedback_messages
for each row
execute function public.set_updated_at();

create index if not exists feedback_messages_org_created_idx
  on public.feedback_messages(organization_id, created_at desc);

alter table public.organization_settings enable row level security;
alter table public.feedback_messages enable row level security;

create policy organization_settings_tenant_select
  on public.organization_settings for select
  using (public.has_org_membership(organization_id));

create policy organization_settings_tenant_manage
  on public.organization_settings for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy feedback_messages_tenant_select
  on public.feedback_messages for select
  using (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or user_id = auth.uid()
  );

create policy feedback_messages_tenant_insert
  on public.feedback_messages for insert
  with check (
    user_id = auth.uid()
    and public.has_org_membership(organization_id)
  );

create policy feedback_messages_tenant_update
  on public.feedback_messages for update
  using (public.is_superadmin() or public.can_manage_org(organization_id))
  with check (public.is_superadmin() or public.can_manage_org(organization_id));

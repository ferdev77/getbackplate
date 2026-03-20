create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  full_name text,
  role_code text not null default 'company_admin',
  status text not null default 'sent' check (status in ('sent', 'accepted', 'expired', 'revoked')),
  invitation_code text not null,
  sent_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  expires_at timestamptz,
  sent_by uuid references auth.users(id),
  source text not null default 'superadmin',
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists organization_invitations_code_unique_idx
  on public.organization_invitations(invitation_code);

create index if not exists organization_invitations_org_email_idx
  on public.organization_invitations(organization_id, email);

drop trigger if exists set_organization_invitations_updated_at on public.organization_invitations;
create trigger set_organization_invitations_updated_at
before update on public.organization_invitations
for each row
execute function public.set_updated_at();

alter table public.organization_invitations enable row level security;

drop policy if exists organization_invitations_select_policy on public.organization_invitations;
create policy organization_invitations_select_policy
  on public.organization_invitations for select
  using (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
  );

drop policy if exists organization_invitations_insert_policy on public.organization_invitations;
create policy organization_invitations_insert_policy
  on public.organization_invitations for insert
  with check (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
  );

drop policy if exists organization_invitations_update_policy on public.organization_invitations;
create policy organization_invitations_update_policy
  on public.organization_invitations for update
  using (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
  )
  with check (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
  );

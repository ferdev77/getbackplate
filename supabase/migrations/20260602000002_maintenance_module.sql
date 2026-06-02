-- Maintenance module: requests, timeline updates, and attachments.

insert into public.module_catalog (code, name, description, is_core)
values (
  'maintenance',
  'Mantenimiento',
  'Solicitudes de mantenimiento por locacion con historial, visitas y adjuntos.',
  false
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_core = false,
  updated_at = timezone('utc', now());

insert into public.permissions (code, module_code, description)
values
  ('maintenance.view', 'maintenance', 'Ver requests de mantenimiento'),
  ('maintenance.create', 'maintenance', 'Crear requests de mantenimiento'),
  ('maintenance.respond', 'maintenance', 'Responder requests de mantenimiento')
on conflict (code) do update
set
  module_code = excluded.module_code,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.module_code = 'maintenance'
where r.code in ('superadmin', 'company_admin')
on conflict do nothing;

alter table public.employee_module_permissions
  drop constraint if exists employee_module_permissions_module_ck;

alter table public.employee_module_permissions
  add constraint employee_module_permissions_module_ck
  check (module_code in ('announcements', 'checklists', 'documents', 'vendors', 'ai_assistant', 'maintenance'));

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  description text not null,
  category text not null,
  service_item text,
  issue text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'visit_scheduled', 'in_progress', 'needs_parts', 'needs_followup', 'resolved', 'cancelled')),
  scheduled_visit_at timestamptz,
  resolved_at timestamptz,
  last_activity_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.maintenance_request_updates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  update_type text not null default 'comment' check (update_type in ('created', 'submitted', 'comment', 'status_change', 'visit_scheduled', 'parts_needed', 'followup_needed', 'resolved', 'cancelled')),
  from_status text,
  to_status text,
  message text,
  scheduled_visit_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.maintenance_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  file_path text not null,
  file_name text not null,
  mime_type text,
  file_size_bytes bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists maintenance_requests_org_status_idx
  on public.maintenance_requests (organization_id, status, last_activity_at desc);

create index if not exists maintenance_requests_org_branch_idx
  on public.maintenance_requests (organization_id, branch_id, last_activity_at desc);

create index if not exists maintenance_request_updates_request_idx
  on public.maintenance_request_updates (request_id, created_at asc);

create index if not exists maintenance_request_attachments_request_idx
  on public.maintenance_request_attachments (request_id, created_at asc);

drop trigger if exists trg_maintenance_requests_updated_at on public.maintenance_requests;
create trigger trg_maintenance_requests_updated_at
before update on public.maintenance_requests
for each row execute function public.set_updated_at();

create or replace function public.can_access_maintenance_request(
  p_organization_id uuid,
  p_branch_id uuid,
  p_created_by uuid
)
returns boolean
language sql
stable
as $$
  select public.is_superadmin()
    or public.can_manage_org(p_organization_id)
    or exists (
      select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
      left join public.employees e
        on e.organization_id = m.organization_id
       and e.user_id = m.user_id
       and e.status = 'active'
      where m.organization_id = p_organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and r.code = 'employee'
        and (
          p_created_by = auth.uid()
          or m.branch_id = p_branch_id
          or coalesce(e.all_locations, false)
          or p_branch_id = any(coalesce(e.location_scope_ids, array[]::uuid[]))
        )
    );
$$;

alter table public.maintenance_requests enable row level security;
alter table public.maintenance_request_updates enable row level security;
alter table public.maintenance_request_attachments enable row level security;

drop policy if exists maintenance_requests_tenant_select on public.maintenance_requests;
create policy maintenance_requests_tenant_select
  on public.maintenance_requests for select
  using (public.can_access_maintenance_request(organization_id, branch_id, created_by));

drop policy if exists maintenance_requests_tenant_insert on public.maintenance_requests;
create policy maintenance_requests_tenant_insert
  on public.maintenance_requests for insert
  with check (
    public.can_manage_org(organization_id)
    or (
      created_by = auth.uid()
      and public.can_access_maintenance_request(organization_id, branch_id, created_by)
    )
  );

drop policy if exists maintenance_requests_tenant_update on public.maintenance_requests;
create policy maintenance_requests_tenant_update
  on public.maintenance_requests for update
  using (public.can_access_maintenance_request(organization_id, branch_id, created_by))
  with check (public.can_access_maintenance_request(organization_id, branch_id, created_by));

drop policy if exists maintenance_updates_tenant_select on public.maintenance_request_updates;
create policy maintenance_updates_tenant_select
  on public.maintenance_request_updates for select
  using (
    exists (
      select 1
      from public.maintenance_requests mr
      where mr.id = request_id
        and public.can_access_maintenance_request(mr.organization_id, mr.branch_id, mr.created_by)
    )
  );

drop policy if exists maintenance_updates_tenant_insert on public.maintenance_request_updates;
create policy maintenance_updates_tenant_insert
  on public.maintenance_request_updates for insert
  with check (
    actor_user_id = auth.uid()
    and exists (
      select 1
      from public.maintenance_requests mr
      where mr.id = request_id
        and public.can_access_maintenance_request(mr.organization_id, mr.branch_id, mr.created_by)
    )
  );

drop policy if exists maintenance_attachments_tenant_select on public.maintenance_request_attachments;
create policy maintenance_attachments_tenant_select
  on public.maintenance_request_attachments for select
  using (
    exists (
      select 1
      from public.maintenance_requests mr
      where mr.id = request_id
        and public.can_access_maintenance_request(mr.organization_id, mr.branch_id, mr.created_by)
    )
  );

drop policy if exists maintenance_attachments_tenant_insert on public.maintenance_request_attachments;
create policy maintenance_attachments_tenant_insert
  on public.maintenance_request_attachments for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1
      from public.maintenance_requests mr
      where mr.id = request_id
        and public.can_access_maintenance_request(mr.organization_id, mr.branch_id, mr.created_by)
    )
  );

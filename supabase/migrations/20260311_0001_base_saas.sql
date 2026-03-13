-- Base SaaS multi-tenant (fase 1)
-- Requiere Supabase (auth.users + extension pgcrypto)

create extension if not exists pgcrypto;

-- =====================================================
-- Helpers de timestamps
-- =====================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- =====================================================
-- Helpers de auth y permisos
-- =====================================================

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create table if not exists public.superadmin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.is_superadmin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.superadmin_users s
    where s.user_id = auth.uid()
  );
$$;

-- =====================================================
-- Catalogos base SaaS
-- =====================================================

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  status text not null default 'active' check (status in ('active', 'paused', 'suspended')),
  plan_id uuid references public.plans(id),
  country_code text,
  timezone text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  max_branches integer,
  max_users integer,
  max_storage_mb integer,
  max_employees integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id)
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  city text,
  state text,
  country text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists branches_org_code_uk
  on public.branches(organization_id, code)
  where code is not null;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  level integer not null default 100,
  is_system boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module_code text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (role_id, permission_id)
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  branch_id uuid references public.branches(id),
  status text not null default 'active' check (status in ('active', 'invited', 'inactive')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create table if not exists public.module_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_core boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_id uuid not null references public.module_catalog(id) on delete cascade,
  is_enabled boolean not null default false,
  enabled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, module_id)
);

-- =====================================================
-- Helpers de tenant
-- =====================================================

create or replace function public.has_org_membership(org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(org_id uuid, role_code text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.memberships m
    join public.roles r on r.id = m.role_id
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and r.code = role_code
  );
$$;

create or replace function public.can_manage_org(org_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_superadmin()
    or public.has_org_role(org_id, 'company_admin');
$$;

create or replace function public.is_module_enabled(org_id uuid, module_code text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_modules om
    join public.module_catalog mc on mc.id = om.module_id
    where om.organization_id = org_id
      and mc.code = module_code
      and om.is_enabled = true
  );
$$;

-- =====================================================
-- Empleados
-- =====================================================

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id),
  user_id uuid references auth.users(id),
  employee_code text,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  position text,
  department text,
  status text not null default 'active' check (status in ('active', 'inactive', 'vacation', 'leave')),
  hired_at date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists employees_org_code_uk
  on public.employees(organization_id, employee_code)
  where employee_code is not null;

-- =====================================================
-- Documentos
-- =====================================================

create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.document_folders(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id),
  folder_id uuid references public.document_folders(id) on delete set null,
  owner_user_id uuid references auth.users(id),
  title text not null,
  file_path text not null,
  mime_type text,
  file_size_bytes bigint,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.document_access_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  branch_id uuid references public.branches(id),
  role_id uuid references public.roles(id),
  user_id uuid references auth.users(id),
  can_read boolean not null default true,
  can_download boolean not null default false,
  can_edit boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (employee_id, document_id)
);

-- =====================================================
-- Avisos internos
-- =====================================================

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id),
  created_by uuid not null references auth.users(id),
  title text not null,
  body text not null,
  kind text not null default 'general' check (kind in ('general', 'urgent', 'reminder', 'celebration')),
  is_featured boolean not null default false,
  publish_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.announcement_audiences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  branch_id uuid references public.branches(id),
  role_id uuid references public.roles(id),
  user_id uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'whatsapp', 'sms')),
  target text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

-- =====================================================
-- Checklists
-- =====================================================

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id),
  name text not null,
  checklist_type text not null default 'opening' check (checklist_type in ('opening', 'closing', 'prep', 'custom')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.checklist_template_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  section_id uuid not null references public.checklist_template_sections(id) on delete cascade,
  label text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.checklist_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id),
  template_id uuid not null references public.checklist_templates(id),
  submitted_by uuid not null references auth.users(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed')),
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.checklist_submission_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.checklist_submissions(id) on delete cascade,
  template_item_id uuid not null references public.checklist_template_items(id),
  is_checked boolean not null default false,
  is_flagged boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.checklist_item_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_item_id uuid not null references public.checklist_submission_items(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  comment text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.checklist_item_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_item_id uuid not null references public.checklist_submission_items(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  file_path text not null,
  mime_type text,
  file_size_bytes bigint,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.checklist_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_item_id uuid not null references public.checklist_submission_items(id) on delete cascade,
  reported_by uuid not null references auth.users(id),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- =====================================================
-- Auditoria
-- =====================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  branch_id uuid,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

-- =====================================================
-- Triggers updated_at
-- =====================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'plans',
    'organizations',
    'organization_limits',
    'branches',
    'roles',
    'memberships',
    'module_catalog',
    'organization_modules',
    'employees',
    'document_folders',
    'documents',
    'employee_documents',
    'announcements',
    'checklist_templates',
    'checklist_submissions',
    'checklist_submission_items',
    'checklist_flags'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I;', t, t);
    execute format('create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- =====================================================
-- RLS
-- =====================================================

alter table public.superadmin_users enable row level security;
alter table public.plans enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_limits enable row level security;
alter table public.branches enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.module_catalog enable row level security;
alter table public.organization_modules enable row level security;
alter table public.employees enable row level security;
alter table public.document_folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_access_rules enable row level security;
alter table public.employee_documents enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_audiences enable row level security;
alter table public.announcement_deliveries enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_sections enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.checklist_submissions enable row level security;
alter table public.checklist_submission_items enable row level security;
alter table public.checklist_item_comments enable row level security;
alter table public.checklist_item_attachments enable row level security;
alter table public.checklist_flags enable row level security;
alter table public.audit_logs enable row level security;

-- policies superadmin
create policy superadmin_read_superadmin_users
  on public.superadmin_users for select
  using (public.is_superadmin());

-- policies catalogos globales
create policy plans_read_all_authenticated
  on public.plans for select
  using (auth.uid() is not null);

create policy module_catalog_read_all_authenticated
  on public.module_catalog for select
  using (auth.uid() is not null);

create policy roles_read_all_authenticated
  on public.roles for select
  using (auth.uid() is not null);

create policy permissions_read_all_authenticated
  on public.permissions for select
  using (auth.uid() is not null);

create policy role_permissions_read_all_authenticated
  on public.role_permissions for select
  using (auth.uid() is not null);

-- organizations
create policy organizations_select_member_or_superadmin
  on public.organizations for select
  using (public.is_superadmin() or public.has_org_membership(id));

create policy organizations_manage_superadmin
  on public.organizations for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- memberships
create policy memberships_select_same_org
  on public.memberships for select
  using (public.is_superadmin() or public.has_org_membership(organization_id));

create policy memberships_manage_company_admin
  on public.memberships for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

-- helper macro-style: tenant read/write
create policy branches_tenant_select
  on public.branches for select
  using (public.is_superadmin() or public.has_org_membership(organization_id));
create policy branches_tenant_manage
  on public.branches for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy organization_limits_tenant_select
  on public.organization_limits for select
  using (public.is_superadmin() or public.has_org_membership(organization_id));
create policy organization_limits_tenant_manage
  on public.organization_limits for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

create policy organization_modules_tenant_select
  on public.organization_modules for select
  using (public.is_superadmin() or public.has_org_membership(organization_id));
create policy organization_modules_tenant_manage
  on public.organization_modules for all
  using (public.is_superadmin() or public.can_manage_org(organization_id))
  with check (public.is_superadmin() or public.can_manage_org(organization_id));

create policy employees_tenant_select
  on public.employees for select
  using (public.has_org_membership(organization_id));
create policy employees_tenant_manage
  on public.employees for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy document_folders_tenant_select
  on public.document_folders for select
  using (public.has_org_membership(organization_id));
create policy document_folders_tenant_manage
  on public.document_folders for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy documents_tenant_select
  on public.documents for select
  using (public.has_org_membership(organization_id));
create policy documents_tenant_manage
  on public.documents for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy document_access_rules_tenant_select
  on public.document_access_rules for select
  using (public.has_org_membership(organization_id));
create policy document_access_rules_tenant_manage
  on public.document_access_rules for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy employee_documents_tenant_select
  on public.employee_documents for select
  using (public.has_org_membership(organization_id));
create policy employee_documents_tenant_manage
  on public.employee_documents for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy announcements_tenant_select
  on public.announcements for select
  using (public.has_org_membership(organization_id));
create policy announcements_tenant_manage
  on public.announcements for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy announcement_audiences_tenant_select
  on public.announcement_audiences for select
  using (public.has_org_membership(organization_id));
create policy announcement_audiences_tenant_manage
  on public.announcement_audiences for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy announcement_deliveries_tenant_select
  on public.announcement_deliveries for select
  using (public.has_org_membership(organization_id));
create policy announcement_deliveries_tenant_manage
  on public.announcement_deliveries for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy checklist_templates_tenant_select
  on public.checklist_templates for select
  using (public.has_org_membership(organization_id));
create policy checklist_templates_tenant_manage
  on public.checklist_templates for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy checklist_template_sections_tenant_select
  on public.checklist_template_sections for select
  using (public.has_org_membership(organization_id));
create policy checklist_template_sections_tenant_manage
  on public.checklist_template_sections for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy checklist_template_items_tenant_select
  on public.checklist_template_items for select
  using (public.has_org_membership(organization_id));
create policy checklist_template_items_tenant_manage
  on public.checklist_template_items for all
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

create policy checklist_submissions_tenant_select
  on public.checklist_submissions for select
  using (public.has_org_membership(organization_id));
create policy checklist_submissions_tenant_insert
  on public.checklist_submissions for insert
  with check (public.has_org_membership(organization_id));
create policy checklist_submissions_tenant_update
  on public.checklist_submissions for update
  using (public.has_org_membership(organization_id))
  with check (public.has_org_membership(organization_id));

create policy checklist_submission_items_tenant_select
  on public.checklist_submission_items for select
  using (public.has_org_membership(organization_id));
create policy checklist_submission_items_tenant_write
  on public.checklist_submission_items for all
  using (public.has_org_membership(organization_id))
  with check (public.has_org_membership(organization_id));

create policy checklist_item_comments_tenant_select
  on public.checklist_item_comments for select
  using (public.has_org_membership(organization_id));
create policy checklist_item_comments_tenant_write
  on public.checklist_item_comments for all
  using (public.has_org_membership(organization_id))
  with check (public.has_org_membership(organization_id));

create policy checklist_item_attachments_tenant_select
  on public.checklist_item_attachments for select
  using (public.has_org_membership(organization_id));
create policy checklist_item_attachments_tenant_write
  on public.checklist_item_attachments for all
  using (public.has_org_membership(organization_id))
  with check (public.has_org_membership(organization_id));

create policy checklist_flags_tenant_select
  on public.checklist_flags for select
  using (public.has_org_membership(organization_id));
create policy checklist_flags_tenant_write
  on public.checklist_flags for all
  using (public.has_org_membership(organization_id))
  with check (public.has_org_membership(organization_id));

create policy audit_logs_tenant_select
  on public.audit_logs for select
  using (
    public.is_superadmin()
    or (
      organization_id is not null
      and public.has_org_membership(organization_id)
    )
  );

create policy audit_logs_tenant_insert
  on public.audit_logs for insert
  with check (
    public.is_superadmin()
    or (
      organization_id is not null
      and public.has_org_membership(organization_id)
    )
  );

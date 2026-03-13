create index if not exists memberships_org_status_idx
  on public.memberships(organization_id, status);

create index if not exists memberships_role_org_status_idx
  on public.memberships(role_id, organization_id, status);

create index if not exists employees_org_status_idx
  on public.employees(organization_id, status);

create index if not exists org_modules_org_enabled_idx
  on public.organization_modules(organization_id, is_enabled);

create index if not exists documents_org_created_idx
  on public.documents(organization_id, created_at);

create index if not exists documents_org_status_idx
  on public.documents(organization_id, status);

create index if not exists checklist_submissions_org_created_idx
  on public.checklist_submissions(organization_id, created_at);

create index if not exists announcements_org_window_idx
  on public.announcements(organization_id, publish_at, expires_at);

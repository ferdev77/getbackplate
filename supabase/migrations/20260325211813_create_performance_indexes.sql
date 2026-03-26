-- Migration to generate performance indexes for querying by tenant and branch

-- Suppress the transaction block to allow concurrently building indexes
commit;

-- 1. audit_logs
create index concurrently if not exists idx_audit_logs_org_branch_date 
  on public.audit_logs (organization_id, branch_id, created_at desc);

-- 2. documents
create index concurrently if not exists idx_documents_org_branch_date 
  on public.documents (organization_id, branch_id, created_at desc);

-- 3. checklist_submissions
create index concurrently if not exists idx_checklist_submissions_org_branch_date 
  on public.checklist_submissions (organization_id, branch_id, created_at desc);

-- 4. announcements
create index concurrently if not exists idx_announcements_org_branch_date 
  on public.announcements (organization_id, branch_id, created_at desc);

-- 5. employees
create index concurrently if not exists idx_employees_org_branch_date 
  on public.employees (organization_id, branch_id, created_at desc);

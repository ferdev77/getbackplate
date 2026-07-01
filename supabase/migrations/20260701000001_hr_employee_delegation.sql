-- HR Employee Delegation: adds 'employees' module to delegated permissions.
-- Allows company_admin to delegate HR management (create/edit/delete/view employees)
-- to employees, scoped to their assigned locations.

alter table public.employee_module_permissions
  drop constraint if exists employee_module_permissions_module_ck;

alter table public.employee_module_permissions
  add constraint employee_module_permissions_module_ck
  check (module_code in ('announcements', 'checklists', 'documents', 'vendors', 'ai_assistant', 'maintenance', 'employees'));

alter table public.employee_module_permissions
  drop constraint if exists employee_module_permissions_module_ck;

alter table public.employee_module_permissions
  add constraint employee_module_permissions_module_ck
  check (module_code in ('announcements', 'checklists', 'documents', 'ai_assistant'));

do $$
declare
  v_table_name text;
  target_tables text[] := array[
    'announcement_audiences',
    'announcement_deliveries',
    'announcements',
    'audit_logs',
    'branches',
    'checklist_flags',
    'checklist_item_attachments',
    'checklist_item_comments',
    'checklist_submission_items',
    'checklist_submissions',
    'checklist_template_items',
    'checklist_template_sections',
    'checklist_templates',
    'department_positions',
    'document_access_rules',
    'document_folders',
    'document_processing_jobs',
    'documents',
    'employee_contracts',
    'employee_documents',
    'employees',
    'feedback_messages',
    'memberships',
    'module_catalog',
    'organization_departments',
    'organization_invitations',
    'organization_limits',
    'organization_modules',
    'organization_settings',
    'organization_user_profiles',
    'organizations',
    'permissions',
    'plan_modules',
    'plans',
    'role_permissions',
    'roles',
    'scheduled_jobs',
    'stripe_customers',
    'subscriptions',
    'superadmin_impersonation_sessions',
    'superadmin_users',
    'user_preferences'
  ];
begin
  foreach v_table_name in array target_tables loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = v_table_name
    ) and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table_name);
    end if;
  end loop;
end
$$;

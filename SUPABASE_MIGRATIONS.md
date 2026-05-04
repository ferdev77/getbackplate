# Supabase Migrations

Listado completo de migraciones SQL. Fuente de verdad: `supabase/migrations/`.

> **Última actualización:** 2026-05-04 (101 migraciones)

## Todas las migraciones (orden cronológico)

| # | Archivo | Descripción breve |
|---|---|---|
| 1 | `20260311000100_base_saas.sql` | Schema base SaaS: orgs, tenants, roles, memberships, modules, RLS |
| 2 | `202603110002_plan_pricing.sql` | Planes y pricing |
| 3 | `202603110003_seed_base_catalogs.sql` | Seed de catálogos base |
| 4 | `202603110004_expand_can_manage_org_to_manager.sql` | Expandir can_manage_org a rol manager |
| 5 | `202603110005_fix_rls_recursion_auth_helpers.sql` | Fix recursión RLS con helpers de auth |
| 6 | `202603110006_settings_and_feedback.sql` | Settings de org y feedback |
| 7 | `202603110007_user_preferences_and_billing.sql` | Preferencias de usuario y billing |
| 8 | `202603110008_checklist_template_metadata.sql` | Metadata de templates de checklists |
| 9 | `202603110009_modal_scope_metadata.sql` | Metadata de scope en modales |
| 10 | `202603110010_employee_profile_contracts.sql` | Perfiles y contratos de empleados |
| 11 | `202603110011_employee_contract_signing_fields.sql` | Campos de firma en contratos |
| 12 | `202603110012_document_security_and_processing.sql` | Seguridad y procesamiento de documentos |
| 13 | `202603110013_org_departments_and_links.sql` | Departamentos y vínculos de org |
| 14 | `202603120001_harden_document_rls.sql` | Hardening RLS de documentos |
| 15 | `202603120002_harden_checklist_rls.sql` | Hardening RLS de checklists |
| 16 | `202603120003_harden_announcement_rls.sql` | Hardening RLS de announcements |
| 17 | `202603120004_department_positions.sql` | Posiciones por departamento |
| 18 | `202603120005_document_position_scope.sql` | Scope de documentos por posición |
| 19 | `202603120006_user_preferences_onboarding_seen.sql` | Flag onboarding visto en preferencias |
| 20 | `202603130001_announcement_position_scope.sql` | Scope de announcements por posición |
| 21 | `202603130002_document_effective_branch_scope.sql` | Scope efectivo de documentos por branch |
| 22 | `202603130003_effective_branch_checklists_announcements.sql` | Scope efectivo de checklists/announcements |
| 23 | `202603130004_plan_limits.sql` | Límites por plan (branches, users, employees, storage) |
| 24 | `202603130005_superadmin_health_snapshot.sql` | Snapshot de salud para superadmin |
| 25 | `202603130006_superadmin_health_indexes.sql` | Índices de health para superadmin |
| 26 | `202603130007_guard_core_module_disable.sql` | Guard contra deshabilitar módulos core |
| 27 | `202603130008_guard_core_module_catalog_demotion.sql` | Guard contra degradar módulos core en catálogo |
| 28 | `202603130009_plan_modules.sql` | Módulos por plan |
| 29 | `202603130010_backfill_core_modules_enabled.sql` | Backfill de módulos core habilitados |
| 30 | `202603130011_user_preferences_multi_tenant_key.sql` | Preferencias multi-tenant key |
| 31 | `202603130012_announcements_optional_and_core_policy.sql` | Announcements opcionales y policy core |
| 32 | `202603130013_seed_smoke_optional_org.sql` | Seed org de prueba opcional |
| 33 | `202603130014_user_id_by_email_rpc.sql` | RPC: obtener user_id por email |
| 34 | `202603130015_company_users_rpc.sql` | RPC: listar usuarios de empresa |
| 35 | `20260315025939_optimize_announcements_view.sql` | Optimización de vista de announcements |
| 36 | `202603160001_stripe_billing.sql` | Integración Stripe billing |
| 37 | `202603160002_plans_stripe_price_id.sql` | Mapeo stripe_price_id en plans |
| 38 | `202603170001_fix_company_users_exclude_employees.sql` | Fix: excluir employees del RPC company_users |
| 39 | `202603180000_employee_mockup_fields.sql` | Campos mockup de empleados |
| 40 | `202603190001_employee_contracts_upsert.sql` | Upsert de contratos de empleados |
| 41 | `202603190002_organization_user_profiles.sql` | Perfiles de usuario por org |
| 42 | `202603190003_user_profiles_nullable_user_id.sql` | user_id nullable en perfiles |
| 43 | `202603190004_organization_user_profiles_status.sql` | Status en perfiles de usuario |
| 44 | `202603200001_organization_invitations.sql` | Sistema de invitaciones |
| 45 | `202603200002_superadmin_impersonation_sessions.sql` | Sesiones de impersonación superadmin |
| 46 | `202603200003_announcement_deliveries_email_channel.sql` | Canal email en entregas de announcements |
| 47 | `202603200004_organization_invitations_first_login.sql` | Flag primer login en invitaciones |
| 48 | `202603230001_organization_settings_website_url.sql` | URL del sitio web en settings de org |
| 49 | `202603230002_branches_phone.sql` | Teléfono en branches |
| 50 | `20260325211813_create_performance_indexes.sql` | Índices de rendimiento |
| 51 | `20260326000000_employee_and_checklist_atomic_rpcs.sql` | RPCs atómicos para empleados y checklists |
| 52 | `20260326010000_count_accessible_documents_rpc.sql` | RPC: contar documentos accesibles |
| 53 | `20260326020000_create_scheduled_jobs.sql` | Sistema de scheduled jobs |
| 54 | `20260326030000_feedback_messages_status.sql` | Status en mensajes de feedback |
| 55 | `20260327000000_enable_realtime_checklist_submissions.sql` | Realtime para envíos de checklists |
| 56 | `20260327000001_fix_checklist_submission_rpc.sql` | Fix RPC de envío de checklists |
| 57 | `202603290002_organization_settings_branding_logo.sql` | Logo de branding en settings |
| 58 | `202603290003_module_catalog_custom_branding.sql` | Módulo custom_branding en catálogo |
| 59 | `202603290004_organization_settings_branding_dark_logo.sql` | Logo dark de branding |
| 60 | `202603310001_billing_activation_gate.sql` | Gate de activación de billing |
| 61 | `20260331210100_organization_user_profiles_delete_policy.sql` | Policy de borrado en perfiles |
| 62 | `20260403000001_stripe_processed_events.sql` | Tabla dedup de eventos Stripe |
| 63 | `20260403000002_get_tenant_access_context_rpc.sql` | RPC: contexto de acceso de tenant |
| 64 | `20260403000003_get_organization_storage_bytes_rpc.sql` | RPC: bytes de almacenamiento de org |
| 65 | `20260403203000_add_ai_assistant_module.sql` | Módulo AI assistant |
| 66 | `20260403221500_sync_realtime_publication.sql` | Sincronizar publicación realtime |
| 67 | `20260404001000_get_employee_access_context_rpc.sql` | RPC: contexto de acceso de empleado |
| 68 | `20260405000000_organization_settings_branding_favicon.sql` | Favicon de branding en settings |
| 69 | `20260407000000_organization_domains.sql` | Dominios custom de organización |
| 70 | `20260409000100_limit_one_custom_domain_per_org.sql` | Límite 1 dominio custom por org |
| 71 | `202604100001_employee_documents_review_comment.sql` | Comentario de review en documentos |
| 72 | `202604100002_employee_documents_expiration_reminders.sql` | Reminders de expiración de documentos |
| 73 | `202604100003_employee_documents_no_expiration.sql` | Flag sin expiración en documentos |
| 74 | `202604100004_employee_documents_signature_state.sql` | Estado de firma en documentos |
| 75 | `202604120001_employee_documents_signature_improvements.sql` | Mejoras de firma de documentos |
| 76 | `202604140001_employee_documents_requested_and_pending_sla.sql` | SLA de documentos solicitados/pendientes |
| 77 | `202604140002_remove_manager_role.sql` | Eliminación del rol manager → fusión en company_admin |
| 78 | `20260415000002_vendors_module.sql` | Módulo de vendors |
| 79 | `20260416000100_add_sort_order_hierarchy.sql` | Orden y jerarquía de sorting |
| 80 | `20260417000100_add_scheduled_jobs_to_realtime_publication.sql` | Scheduled jobs en publicación realtime |
| 81 | `20260417000200_ensure_scheduled_jobs_schema.sql` | Asegurar schema de scheduled jobs |
| 82 | `20260418000001_core_employee_module_permissions.sql` | Permisos core del módulo employees |
| 83 | `20260419000100_announcement_creator_rls.sql` | RLS para creadores de announcements |
| 84 | `20260419000200_fix_announcement_audiences_branch_policy.sql` | Fix policy de audiencias por branch |
| 85 | `20260420000100_rename_announcements_labels_to_avisos.sql` | Renombrar labels de announcements a avisos |
| 86 | `20260421000100_ai_assistant_memory_persistence.sql` | Persistencia de memoria del AI assistant |
| 87 | `20260422000100_scope_golden_rule.sql` | Golden rule de scope |
| 88 | `20260422000200_employee_ai_assistant_delegation.sql` | Delegación de AI assistant a empleados |
| 89 | `20260423000100_employee_vendors_view_permissions.sql` | Permisos de vista de vendors para empleados |
| 90 | `20260423090000_checklist_remove_department_guard.sql` | Eliminar guard de departamento en checklists |
| 91 | `20260423100000_feedback_messages_source_channel.sql` | Canal fuente en mensajes de feedback |
| 92 | `20260423113000_vendor_contact_whatsapp.sql` | WhatsApp en contacto de vendors |
| 93 | `20260423130000_vendor_categories_management.sql` | Gestión de categorías de vendors |
| 94 | `20260426150000_qbo_r365_integration_foundation.sql` | Fundación integración QBO/R365 |
| 95 | `20260427010000_qbo_r365_template_variants.sql` | Variantes de templates QBO/R365 |
| 96 | `20260429000100_employee_all_locations_scope.sql` | Scope "todas las ubicaciones" para empleados |
| 97 | `20260429000200_employee_multi_location_scope_ids.sql` | IDs de scope multi-ubicación |
| 98 | `20260501000001_fix_multilocacion_rls.sql` | Fix RLS multi-ubicación |
| 99 | `20260501000002_fix_vendors_rls_multilocacion.sql` | Fix RLS vendors multi-ubicación |
| 100 | `20260502000001_stripe_events_status_field.sql` | Campo status en eventos Stripe procesados |
| 101 | `20260503000001_qbo_lookback_allow_zero.sql` | QBO lookback permitir cero |

## Convención de naming

Se utilizan dos formatos de timestamp (ambos válidos para Supabase que ordena alfabéticamente):

- `YYYYMMDD####` — 12 chars, usado en las migraciones iniciales
- `YYYYMMDDHHmmss` — 14 chars, usado en migraciones generadas por herramientas

## Cómo verificar integridad

```bash
npm run verify:migrations-sync
```

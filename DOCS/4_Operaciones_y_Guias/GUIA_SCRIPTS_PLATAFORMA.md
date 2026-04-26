# Guia de Scripts de la Plataforma

Objetivo: tener un indice unico, rapido y operativo de todos los scripts del repo.

## Reglas de uso

- Ejecutar primero en local/dev siempre que sea posible.
- En produccion, correr solo scripts con objetivo claro y con backup/log de salida.
- Para scripts SQL en `scripts/`, usar `supabase db query --linked -f <archivo.sql>`.
- Para scripts JS/MJS/TS en `web/scripts/`, usar `node -r dotenv/config` o `tsx -r dotenv/config` con el `dotenv_config_path` correcto.

## Scripts raiz (`scripts/`)

- `scripts/apply-signature-migration.mjs`: aplica migracion operativa de firma/documentos.
- `scripts/cleanup_juans_prod_keep_admin_locations_departments_positions.sql`: limpia tenant Juans en prod manteniendo admins, locaciones, departamentos y puestos.
- `scripts/remove_user_from_org_with_auth.sql`: elimina un usuario de una empresa y tambien su auth (script generico).
- `scripts/remove_juan_ramos_from_juans_prod.sql`: alias historico (ahora generico), mantiene la misma logica de borrado por org+email.

## Script generico de borrado por empresa + usuario

Archivo recomendado:
- `scripts/remove_user_from_org_with_auth.sql`

Que hace:
- Busca la empresa por `slug`.
- Busca usuario en `auth.users` por email exacto.
- Borra filas del usuario en todas las tablas `public` que tengan `organization_id` + `user_id`.
- Borra invitaciones de esa empresa para ese email.
- Borra `audit_logs` del actor para permitir hard delete.
- Borra el usuario en `auth.users`.

Como usar:
1. Abrir `scripts/remove_user_from_org_with_auth.sql`.
2. Reemplazar:
   - `__ORG_SLUG__` por el slug de la empresa.
   - `__USER_EMAIL__` por el email del usuario.
3. Ejecutar:

```bash
npx supabase db query --linked -f "scripts/remove_user_from_org_with_auth.sql"
```

## Scripts web (`web/scripts/`)

### Migraciones / parches de esquema

- `add_soft_delete_to_documents.mjs`: agrega soporte soft-delete a documentos.
- `apply-announcement-position-scope-migration.mjs`: aplica migracion de scope por puesto en avisos.
- `apply-department-positions-migration.mjs`: aplica migracion de puestos por departamento.
- `apply-document-effective-branch-migration.mjs`: agrega/ajusta branch efectivo en documentos.
- `apply-document-position-scope-migration.mjs`: aplica scope por puesto en documentos.
- `apply-effective-branch-checklists-announcements-migration.mjs`: alinea branch efectivo en checklists+avisos.
- `apply-migration-and-verify-rls.mjs`: aplica migracion y valida RLS.
- `apply-official-plan-packaging.mjs`: aplica empaquetado oficial de planes/modulos.
- `apply-plan-limits-migration.mjs`: aplica migracion de limites de plan.
- `apply-stripe-migration.mjs`: aplica migracion de Stripe.
- `apply-superadmin-health-migrations.mjs`: aplica migraciones de salud superadmin.
- `apply-user-onboarding-seen-migration.mjs`: agrega/migra flag de onboarding visto.
- `deploy-migration.cjs`: wrapper de despliegue de migracion.
- `run-migration-rpc.mjs`: ejecuta migracion via RPC.
- `migrations/20260416_add_sort_order_to_branches.sql`: agrega orden manual en locaciones.

### Backfill / correcciones de datos

- `backfill-announcement-global-audience.mjs`: corrige audiencias globales de avisos.
- `backfill-orphan-employee-memberships.mjs`: corrige memberships huerfanas de empleados.
- `patch_document_queries.mjs`: parche de queries de documentos.
- `rewrite-employee-route.mjs`: ajuste asistido de ruta empleados.
- `reset-onboarding-seen-for-employees.mjs`: resetea onboarding visto para empleados.

### Seed / setup de entornos

- `apply-seed-operational-demo.mjs`: carga seed demo operativo.
- `seed-announcements-checklists.mjs`: seed de avisos + checklists.
- `seed-massive-test.mjs`: seed volumetrico para prueba masiva.
- `setup-demo.mjs`: setup demo base.
- `setup-e2e-communications.mjs`: prepara datos E2E de comunicaciones.
- `setup-e2e-documents.mjs`: prepara datos E2E de documentos.
- `setup-master-e2e.mjs`: setup maestro de E2E.
- `setup-puntos-cardinales.mjs`: setup de empresa Puntos Cardinales.
- `setup-tenant-qa-7-locations.mjs`: setup tenant QA con 7 locaciones.
- `sync-juan-prod-to-dev.mjs`: sincroniza datos de Juan prod -> dev (controlado).

### Verificacion / smoke / auditoria

- `check-schema.mjs`: chequeo rapido de esquema.
- `smoke-modules.mjs`: smoke funcional por modulos.
- `verify-announcements-documents-checklists-flow.mjs`: valida flujo integrado principal.
- `verify-audit-coverage.mjs`: valida cobertura de auditoria.
- `verify-branding-email-send.ts`: prueba de envio de emails con branding y fallback.
- `verify-document-guardrails.mjs`: verifica guardrails de documentos.
- `verify-docuseal-integration.mjs`: verifica integracion DocuSeal.
- `verify-employee-documents-custom-flow.mjs`: valida flujo custom de docs de empleado.
- `verify-layout-guardrails.mjs`: valida guardrails de layout/ui.
- `verify-massive-test.mjs`: valida escenario de carga masiva.
- `verify-master-e2e.mjs`: validacion E2E maestra.
- `verify-migrations-sync.mjs`: verifica sincronia de migraciones.
- `verify-module-role-e2e.mjs`: valida permisos modulo-rol E2E.
- `verify-official-plan-packaging.mjs`: verifica empaquetado oficial de planes.
- `verify-operational-metrics-consistency.mjs`: consistencia de metricas operativas.
- `verify-operational-metrics.mjs`: verificacion de metricas operativas.
- `verify-plan-change-rules.mjs`: valida reglas de cambio de plan.
- `verify-plan-limit-enforcement.mjs`: valida enforcement de limites.
- `verify-plan-limit-messages.mjs`: valida mensajes de limites de plan.
- `verify-reports-isolation.mjs`: valida aislamiento de reportes por tenant.
- `verify-role-permissions.mjs`: valida matriz de permisos por rol.
- `verify-scope-matrix.mjs`: valida matriz de scopes.
- `verify-superadmin-radar.mjs`: valida radar de salud superadmin.
- `verify-tenant-7-locations.mjs`: valida setup tenant 7 locaciones.
- `verify-tenant-isolation.mjs`: valida aislamiento multi-tenant.
- `verify_e2e_db.mjs`: verificacion de base para E2E.

### Jobs / cron / procesos

- `process-document-jobs.mjs`: procesa cola/tareas de documentos.
- `evaluate-operational-alerts.mjs`: evalua alertas operativas.
- `enable-realtime-checklist.js`: habilita realtime para checklist_submissions.

### Reportes / medicion / performance

- `generate-tenant-usage-report.mjs`: reporte de uso por tenant.
- `measure-route-latency.mjs`: mide latencia de endpoints/rutas.

### Debug / utilidades puntuales

- `debug-announcement-visibility.mjs`: depura visibilidad de avisos.
- `temp_run_sql.mjs`: ejecuta SQL ad-hoc temporal.
- `test-anthropic.mjs`: test de conexion a Anthropic.
- `test-docuseal-coords.mjs`: test de coordenadas de firma DocuSeal.
- `update-bucket.js`: utilitario para bucket/storage.

## Comandos recomendados

### Ejecutar script JS/MJS en dev

```bash
node -r dotenv/config scripts/<script>.mjs dotenv_config_path=.env.local
```

### Ejecutar script TS en dev

```bash
npx tsx -r dotenv/config scripts/<script>.ts dotenv_config_path=.env.local
```

### Ejecutar en prod (con mucho cuidado)

```bash
node -r dotenv/config scripts/<script>.mjs dotenv_config_path=.env.production.local
```

## Nota operativa

- Este documento es indice operativo. Si un script cambia de alcance, actualizar esta guia en el mismo PR/commit.

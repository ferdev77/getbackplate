# DOCUMENTACION TECNICA

## Estado actual

Documento base inicial del proyecto SaaS multiempresa. Este archivo ira creciendo por fases.

Nombre de producto vigente: `GetBackplate`.

### Entregables ya creados

- Analisis funcional de mockups: `ANALISIS_MOCKUPS.md`
- Estructura modular objetivo: `ESTRUCTURA_PROYECTO.md`
- Migracion SQL base tenant: `supabase/migrations/20260311_0001_base_saas.sql`
- Seed inicial: `supabase/seed.sql`
- Scaffold Next.js + TS + Tailwind: `web/`
- Capa base Supabase en app: `web/src/infrastructure/supabase/client/`
- Auth inicial (login + callback + logout): `web/src/app/auth/` y `web/src/modules/auth/actions.ts`
- Guardas por rol/contexto: `web/src/shared/lib/access.ts`
- Flujo superadmin empresas/modulos (base): `web/src/app/(superadmin)/superadmin/organizations/page.tsx`
- App shell empresa inspirado en mockups: `web/src/shared/ui/company-shell.tsx`
- Superadmin CRUD real sobre DB: organizaciones, limites, modulos y planes
- Auditoria activa en acciones clave via `audit_logs` y helper `web/src/shared/lib/audit.ts`

## 1. Objetivo tecnico

Construir una plataforma SaaS multi-tenant con aislamiento real de datos, modulos activables por empresa y separacion estricta entre:

- superadmin global
- admin de empresa
- roles operativos (manager/empleado)

## 2. Stack propuesto

- Next.js (App Router)
- TypeScript estricto
- Tailwind CSS
- Supabase (Auth, Postgres, Storage, RLS)
- PostgreSQL (modelo relacional)

## 3. Arquitectura objetivo

Arquitectura modular por capas:

1. `presentation` (UI, layouts, rutas)
2. `application` (casos de uso)
3. `domain` (entidades, reglas de negocio)
4. `infrastructure` (repositorios, Supabase adapters)

### Principios

- seguridad por defecto
- bajo acoplamiento, alta cohesion
- validaciones centralizadas
- permisos en backend + DB (no solo frontend)
- preparacion para escalar por modulos y planes

### Directriz UX/UI activa

Se define como baseline visual del producto el patrón aplicado en superadmin planes/organizaciones/modulos:

- header limpio + resumen KPI
- alta en bloque desplegable
- tarjetas desplegables por entidad para datos secundarios
- acciones con iconos y feedback de resultado
- confirmación reusable para acciones destructivas (`ConfirmSubmitButton`)
- responsive obligatorio y consistente

Todo módulo nuevo debe adherir a este estándar.

## 4. Analisis de mockups (resumen)

Fuente principal: carpeta `Mockups`.

Pantallas clave detectadas:

- admin: documentos, avisos, checklists, usuarios, empleados, reportes
- empleado: inicio, instrucciones, documentos
- onboarding guiado
- ejecucion checklist operativo con evidencias

Detalle completo en `ANALISIS_MOCKUPS.md`.

## 5. Modelo de datos base (MVP)

### SaaS / tenant

- `organizations`
- `branches`
- `memberships`
- `roles`
- `permissions`
- `module_catalog`
- `organization_modules`
- `plans`
- `organization_limits`

### Personas

- `users` (auth)
- `employees`

### Documentos

- `document_folders`
- `documents`
- `document_access_rules`
- `employee_documents`

### Comunicacion

- `announcements`
- `announcement_audiences`
- `announcement_deliveries`

### Checklists y reportes

- `checklist_templates`
- `checklist_template_sections`
- `checklist_template_items`
- `checklist_submissions`
- `checklist_submission_items`
- `checklist_item_comments`
- `checklist_item_attachments`
- `checklist_flags`

### Trazabilidad

- `audit_logs`

## 6. Multi-tenancy

### Regla base

Toda entidad de negocio del tenant debe incluir `organization_id`.

### Segmentacion opcional

- `branch_id` cuando aplique.

### Politicas de seguridad

- RLS en todas las tablas de tenant.
- queries siempre acotadas por tenant.
- validacion de membership activa en backend.

## 7. Roles y permisos iniciales

- `superadmin`
- `company_admin`
- `manager`
- `employee`

Permisos controlados por:

1. rol base
2. modulo activo del tenant
3. alcance (empresa/sucursal)

## 8. Modulos como servicio

Catalogo base de modulos:

- empleados
- onboarding
- documentos
- anuncios
- checklist
- reportes
- dashboards
- configuracion

Activar un modulo impacta:

- menu/navegacion
- endpoints habilitados
- policies de lectura/escritura
- acciones disponibles

### KPIs superadmin de modulos

- `Dashboard Superadmin > Modulos activos`:
  - fuente: tabla `organization_modules`
  - regla: cuenta filas con `is_enabled = true`
  - interpreta activaciones efectivas por tenant (no cantidad de modulos del catalogo)

- `Superadmin > Catalogo de modulos > Asignaciones tenant-modulo`:
  - fuente: tabla `organization_modules`
  - regla: cuenta todas las filas (habilitadas y deshabilitadas)
  - formula habitual: `cantidad_organizaciones x cantidad_modulos` (si existe relacion para todos)

### Notas de planes (comercial)

La tabla `plans` contempla precio y facturacion:

- `price_amount`
- `currency_code`
- `billing_period`

## 9. Auth y sesion

- Supabase Auth para identidad.
- Memberships para mapear usuario <-> empresa <-> rol.
- Contexto de tenant obligatorio para toda operacion autenticada.

## 10. Storage y archivos

Buckets separados por tipo:

- documentos corporativos
- documentos de empleado
- evidencias de checklist

Controlar:

- tipo MIME permitido
- tamano maximo
- ruta por `organization_id`

## 11. Flujo tecnico por modulo (resumen)

1. Documentos: crear carpeta -> subir archivo -> asignar acceso -> consulta por rol/tenant.
2. Avisos: crear aviso -> definir audiencia -> publicar -> notificaciones opcionales.
3. Checklist: ejecutar plantilla -> registrar comentarios/fotos/flags -> enviar reporte -> seguimiento admin.
4. Onboarding: lectura guiada -> confirmacion -> estado completado por empleado.

## 12. Roadmap tecnico

### Fase 1

- base SaaS multi-tenant
- auth + memberships + RBAC
- superadmin minimo
- empresas, sucursales, empleados

#### Estado de avance fase 1

- [x] Modelo SQL base definido
- [x] RLS base definida para tablas de tenant
- [x] Catalogos iniciales (roles, permisos, modulos)
- [x] Implementacion Next.js (estructura y rutas base)
- [x] Integracion base Supabase server-side (clientes + middleware)
- [x] Pantallas superadmin funcionales (dashboard + organizaciones base)
- [x] Flujo inicial crear empresa + activar/desactivar modulos
- [x] Flujo inicial empleados (alta + listado por tenant)
- [x] Superadmin: editar empresa/estado/plan + limites + catalogo de modulos + planes

### Fase 2

- onboarding + documentos + avisos

### Fase 3

- checklists + reportes

#### Estado actual checklists/reportes

- [x] Checklists con persistencia real:
  - `checklist_templates`
  - `checklist_template_sections`
  - `checklist_template_items`
  - `checklist_submissions`
  - `checklist_submission_items`
  - `checklist_flags`
- [x] Reportes conectados a datos reales (checklists + incidencias + volumen de documentos/anuncios)
- [x] Migracion aplicada: `202603110008_checklist_template_metadata.sql`

### Fase 4

- auditoria avanzada, analytics, hardening

## 20. Estado consolidado de modulos (2026-03-13)

Estado funcional general:

- `empleados`: disponible
- `onboarding`: disponible (en hardening continuo)
- `documentos`: disponible (en hardening continuo)
- `anuncios`: disponible (en hardening continuo)
- `checklist`: disponible
- `reportes`: disponible
- `dashboards`: disponible
- `configuracion`: disponible

Nota operativa:

- La etapa actual se enfoca en madurez de producto: observabilidad, auditoria avanzada, limites por plan y calidad de release.

## 21. Auditoria avanzada (B1) - estado documental

Se definio la especificacion funcional y tecnica de auditoria avanzada en:

- `web/docs/audit-advanced-spec.md`

Alcance actual:

- solo diseno y criterios de aceptacion
- sin cambios de UI
- sin cambios de flujos
- sin cambios funcionales
- sin cambios en reglas de base de datos

## 13. Riesgos iniciales y mitigacion

1. Riesgo: fuga de datos entre tenants.
   - Mitigacion: RLS + validacion server-side + tests de acceso cruzado.
2. Riesgo: permisos solo visuales.
   - Mitigacion: enforcement en DB y backend.
3. Riesgo: duplicidad por mockups inconsistentes.
   - Mitigacion: unificacion documentada en `ANALISIS_MOCKUPS.md`.

## 14. Convenciones iniciales

- idioma: espanol en documentacion y mensajes de negocio.
- TypeScript estricto, sin `any` en logica critica.
- nombres claros por dominio.
- cambios relevantes deben registrarse en esta documentacion.

## 15. Variables de entorno esperadas

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `SUPABASE_DB_POOLER_HOST`
- `SUPABASE_DB_POOLER_PORT`
- `SUPABASE_DB_NAME`
- `SUPABASE_DB_USER`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_DB_POOLER_URL`

### Directriz operativa de credenciales

- Las credenciales de DB para operaciones SQL/migraciones quedan centralizadas en `web/.env.local`.
- Para tareas futuras de depuracion/migraciones, primero consultar `web/.env.local` y reutilizar esas variables.
- No volver a solicitar credenciales al usuario salvo que haya rotacion de password o cambio de proyecto.

## 16. Notas importantes de seguridad

1. `SUPABASE_SERVICE_ROLE_KEY` solo en servidor, nunca en cliente.
2. Storage debe usar rutas por tenant (`organization_id/...`).
3. Cualquier operacion sensible debe verificar:

## 17. Directriz de datos reales

- La UI de GetBackplate debe consumir datos reales desde Supabase como fuente de verdad.
- Se evita usar mocks hardcodeados para modulos operativos (documentos, anuncios, checklists, usuarios, empleados, reportes).
- Si un flujo necesita datos iniciales para pruebas, se deben crear datos coherentes en DB por tenant (sin romper aislamiento).
   - membership activa
   - rol
   - modulo habilitado para ese tenant

## 18. Hardening aplicado (2026-03-12)

Se aplicaron mejoras de seguridad y consistencia de datos en backend y portal empleado:

- Endpoints API con validaciones mas estrictas (`zod`) en settings y feedback (`/api/company/settings`, `/api/company/feedback`).
- Verificacion de modulo habilitado en backend para operaciones sensibles:
  - empleados (`module_code = employees`)
  - billing/feedback (`module_code = settings`)
- Endurecimiento de acceso documental en descarga (`/api/documents/[documentId]/download`):
  - ya no alcanza con pertenecer al tenant
  - se valida asignacion directa (`employee_documents`) o alcance por `access_scope` (usuario/sucursal/departamento)
  - admins/manager conservan acceso operativo completo
- Hardening de RLS en base de datos para documentos:
  - nueva migracion `supabase/migrations/202603120001_harden_document_rls.sql`
  - `documents_tenant_select` ahora usa `public.can_read_document(...)`
  - `employee_documents_tenant_select` limita lectura del empleado a sus propios vinculos
- Hardening de RLS en base de datos para checklists:
  - nueva migracion `supabase/migrations/202603120002_harden_checklist_rls.sql`
  - select de `checklist_templates/sections/items` ahora respeta branch/departamento/target_scope por usuario
  - select/insert/update de `checklist_submissions` y tablas hijas ahora restringe por ownership (o admin/manager)
- Hardening de RLS en base de datos para anuncios:
  - nueva migracion `supabase/migrations/202603120003_harden_announcement_rls.sql`
  - `announcements_tenant_select` ahora usa `public.can_read_announcement(...)`
  - `announcement_audiences_tenant_select` ahora expone solo filas relevantes (propias, globales o de su sucursal) para empleados
  - `announcement_deliveries_tenant_select` queda limitado a gestion (`can_manage_org`)
- Portal empleado sin datos hardcodeados:
  - `portal/checklist` ahora lee plantillas/items reales y progreso real desde `checklist_submissions`
  - `portal/onboarding` ahora muestra estado derivado de `employees`, `employee_documents` y `employee_contracts`
  - `portal/documents` filtra visibilidad por asignacion/scope real

Impacto:

- menor riesgo de sobreexposicion de documentos en tenant
- mayor enforcement backend de modulos y payloads
- mejor coherencia entre UI y fuente real en Supabase

## 19. Verificacion operativa de aislamiento (RLS documentos)

Script creado para aplicar migraciones y validar aislamiento entre dos empleados:

- `web/scripts/apply-migration-and-verify-rls.mjs`

Ejecucion:

- `node --env-file=.env.local scripts/apply-migration-and-verify-rls.mjs`

Que hace:

1. Aplica `202603120001_harden_document_rls.sql`, `202603120002_harden_checklist_rls.sql` y `202603120003_harden_announcement_rls.sql`.
2. Si faltan usuarios de prueba, crea `rls.testa@getbackplate.local` y `rls.testb@getbackplate.local`.
3. Genera un documento privado por `access_scope.users` para actor A.
4. Verifica con `public.can_read_document(...)`:
   - actor A: permitido
   - actor B: bloqueado
5. Verifica con `public.can_read_checklist_template(...)` y `public.can_submit_checklist(...)`:
   - actor A: permitido
   - actor B: bloqueado
6. Verifica con `public.can_read_announcement(...)`:
   - actor A: permitido
   - actor B: bloqueado
7. Revierte datos temporales de prueba al finalizar (rollback transaccional).

## 20. Estado consolidado de modulos (2026-03-13)

Estado funcional general:

- `empleados`: disponible
- `onboarding`: disponible (en hardening continuo)
- `documentos`: disponible (en hardening continuo)
- `anuncios`: disponible (en hardening continuo)
- `checklist`: disponible
- `reportes`: disponible
- `dashboards`: disponible
- `configuracion`: disponible

Nota operativa:

- La etapa actual se enfoca en madurez de producto: observabilidad, auditoria avanzada, limites por plan y calidad de release.

## 21. Auditoria avanzada (B1)

Especificacion funcional y tecnica:

- `web/docs/audit-advanced-spec.md`

Alcance implementado (backend interno, sin cambios visuales):

- extension de `web/src/shared/lib/audit.ts` con:
  - taxonomia `outcome` y `severity`
  - sanitizacion de metadata para evitar guardar secretos
  - helpers de auth y denegacion de acceso
- instrumentacion en `web/src/modules/auth/actions.ts`:
  - `login.success`
  - `login.failed`
  - `logout.success`
- instrumentacion en `web/src/shared/lib/access.ts` para denegaciones:
  - faltante de superadmin
  - faltante de membresia activa
  - modulo deshabilitado por tenant
  - faltante de rol para panel empresa/portal empleado

Garantias de no impacto funcional:

- sin cambios de UI
- sin cambios de flujos funcionales
- sin cambios en reglas RLS
- sin cambios en esquema de tablas

Verificacion tecnica:

- `npm run lint` OK
- `npm run build` OK

## 22. Implementacion interna adicional (sin impacto visual)

Se reforzo instrumentacion de auditoria en acciones criticas superadmin:

- `web/src/modules/organizations/actions.ts`
- `web/src/modules/plans/actions.ts`
- `web/src/modules/modules-catalog/actions.ts`

Mejora aplicada:

- eventos ahora incluyen `eventDomain`, `outcome` y `severity` para mejor trazabilidad.

Se extrajo logica de metricas de salud superadmin a servicio backend reusable:

- `web/src/modules/superadmin/lib/health-metrics.ts`
- consumo en `web/src/app/(superadmin)/superadmin/dashboard/page.tsx`

Resultado:

- mismo comportamiento funcional y visual del dashboard
- mejor separacion de responsabilidades para evolucion futura (B2/B5)

Se agrego helper backend de alertas operativas (preparacion B5):

- `buildTenantOperationalAlerts(...)` en `web/src/modules/superadmin/lib/health-metrics.ts`
- codigos iniciales: `tenant_not_active`, `missing_active_admin`, `no_enabled_modules`, `no_active_employees`, `no_recent_activity`
- sin cambios de UI y sin nuevas rutas

Validacion:

- `npm run lint` OK
- `npm run build` OK

## 23. B2/D1 implementados sin impacto visual

### B2 - Metricas operativas backend

Se amplio `web/src/modules/superadmin/lib/health-metrics.ts` con:

- `getSuperadminOperationalMetrics(windowDays)`
  - total de eventos en ventana
  - eventos `denied`
  - eventos `error`
  - `login.failed`
  - `access.denied.*`
  - mutaciones superadmin (`organization.*`, `plan.*`, `module.*`)
  - adopcion de modulos por tenant activo
  - promedio de modulos habilitados por tenant activo

Se agrego script de verificacion:

- `web/scripts/verify-operational-metrics.mjs`
- comando: `npm run verify:operational-metrics`

Resultado de ejecucion local reciente:

- ventana: 7 dias
- metricas calculadas correctamente y mostradas en consola

### D1 - Aislamiento multi-tenant automatizado

Se agrego script dedicado (sin aplicar migraciones, solo verificacion):

- `web/scripts/verify-tenant-isolation.mjs`
- comando: `npm run verify:rls-isolation`
- `web/scripts/verify-reports-isolation.mjs`
- comando: `npm run verify:reports-isolation`

Cobertura actual:

- documentos privados por usuario
- checklists privados por usuario
- anuncios privados por usuario
- slices de reportes (submission/items/comments/flags/attachments) por ownership

### D2 - Permisos por rol en acciones criticas (automatizado)

Se agrego script de verificacion de matriz de acceso por rol:

- `web/scripts/verify-role-permissions.mjs`
- comando: `npm run verify:role-permissions`

Matriz validada:

- `company_admin`: acceso de gestion (`manage_scope`) + acceso panel empresa, sin portal empleado
- `manager`: acceso de gestion (`manage_scope`) + acceso panel empresa, sin portal empleado
- `employee`: sin gestion, sin panel empresa, con acceso portal empleado

Resultado de ejecucion local reciente:

- matriz OK para los tres roles

### D3 - Smoke tests por modulo (release rapido)

Se agrego script de smoke tests modulares:

- `web/scripts/smoke-modules.mjs`
- comando: `npm run verify:smoke-modules`

Cobertura actual de smoke:

- `superadmin` (planes/catalogo/organizaciones)
- `employees`
- `documents`
- `announcements`
- `checklists`
- `reports`
- `settings`
- `audit`
- estado de activacion de modulos por tenant (`is_module_enabled`)

Resultado de ejecucion local reciente:

- smoke OK en todos los modulos verificados

### D4 - Guardrails de carga/descarga de archivos

Se aplicaron validaciones backend internas (sin cambios visuales) en:

- `web/src/app/api/company/documents/route.ts`
- `web/src/modules/documents/actions.ts`
- `web/src/app/api/company/employees/route.ts`
- `web/src/app/api/documents/[documentId]/download/route.ts`

Mejoras aplicadas:

- validacion de ruta de storage por tenant (`organization_id/`) antes de upload/reuso de duplicados
- bloqueo de descarga si el documento no cumple guardrails de seguridad (path/mime/size)
- compatibilidad controlada para rutas legacy `seed/` en lectura/borrado

Se agrego util compartido:

- `web/src/shared/lib/storage-guardrails.ts`

Se agrego script de verificacion:

- `web/scripts/verify-document-guardrails.mjs`
- comando: `npm run verify:document-guardrails`

Resultado de ejecucion local reciente:

- guardrails validados OK
- paths legacy detectados y reportados sin romper flujo actual

### D5 - Protocolo de incidentes y rollback operativo

Se documentaron runbooks operativos:

- `web/docs/security-incident-runbook.md`
- `web/docs/operational-rollback-protocol.md`

Contenido cubierto:

- clasificacion de severidad y proceso de contencion
- triage tecnico con scripts de verificacion ya implementados
- criterios de recuperacion y cierre
- estrategia de rollback por capas (feature/app/data)
- evidencia minima obligatoria para auditoria operativa

Impacto en producto:

- sin cambios de UI/UX
- sin cambios de rutas o navegacion visible
- sin cambios en reglas RLS
- sin migraciones ni cambios de estructura de tablas

Resultado de ejecucion local reciente:

- empleado A: permitido
- empleado B: bloqueado
- verificacion OK en dominios de documentos/anuncios/checklists/reportes

## 24. Cierre B1/B2/B5 sin impacto visual

### B1 - Auditoria avanzada

Refuerzo aplicado en backend:

- taxonomia centralizada en `web/src/shared/lib/audit-taxonomy.ts`
- tipado de dominio/razon en `web/src/shared/lib/audit.ts`
- nuevos eventos auditados en acciones mutables sin cobertura previa:
  - `web/src/modules/settings/actions.ts`
  - `web/src/modules/onboarding/actions.ts`
  - mejoras de dominio/severidad en `documents`, `announcements`, `checklists`, `employees`

Verificacion de cobertura:

- script: `web/scripts/verify-audit-coverage.mjs`
- comando: `npm run verify:audit-coverage`
- resultado local: cobertura OK (0 acciones mutables sin auditoria)

### B2 - Metricas operativas

Se extendio `getSuperadminOperationalMetrics` en `web/src/modules/superadmin/lib/health-metrics.ts` con:

- totales de ventana actual y ventana previa equivalente
- ratios (`denied_rate_pct`, `error_rate_pct`, `auth_failure_rate_pct`)
- tendencias (`events_trend_pct`, `denied_trend_pct`, `error_trend_pct`)

Verificacion de consistencia:

- script: `web/scripts/verify-operational-metrics-consistency.mjs`
- comando: `npm run verify:operational-metrics-consistency`
- resultado local: OK en ventanas 7d y 30d

### B5 - Alertas operativas ejecutables

Se habilito evaluacion operativa por script:

- script: `web/scripts/evaluate-operational-alerts.mjs`
- comando: `npm run verify:operational-alerts`

Salida:

- resumen por severidad (`critical/high/medium`)
- top de tenants con alertas priorizadas

## 25. Garantias mantenidas

Cambios de esta etapa mantienen:

- sin cambios de UI/UX
- sin cambios de rutas o navegacion visible
- sin cambios en reglas RLS
- sin migraciones ni cambios de estructura de tablas

## 26. Cierre D padre + avance C1/C2

### Estado bloque D (padres)

Se consideran cerrados los puntos padre D1/D2/D3/D4/D5 con evidencia ejecutable y documental:

- aislamiento multi-tenant: `verify:rls-isolation`, `verify:reports-isolation`
- permisos por rol: `verify:role-permissions`
- smoke modular: `verify:smoke-modules`
- guardrails de archivos: `verify:document-guardrails`
- runbooks: incidentes + rollback

### C1 - Planes oficiales

Se definio y documento packaging oficial:

- `web/docs/official-plan-packaging.md`
- Starter / Pro (`code=growth`) / Enterprise con limites exactos

Se aplico y verifico en datos:

- `npm run apply:official-plan-packaging`
- `npm run verify:official-plan-packaging`

### C2 - Enforcement backend de limites por plan

Se implemento enforcement en backend sin cambios visuales:

- util central: `web/src/shared/lib/plan-limits.ts`
- enforcement en acciones/API:
  - `web/src/modules/settings/actions.ts` (sucursales)
  - `web/src/modules/employees/actions.ts` (usuarios/empleados)
  - `web/src/app/api/company/employees/route.ts` (usuarios/empleados/storage)
  - `web/src/modules/documents/actions.ts` (storage)
  - `web/src/app/api/company/documents/route.ts` (storage)

Verificacion automatizada:

- `npm run verify:plan-limit-enforcement`

### C3 - Mensajes claros al superar limites

Se estandarizaron mensajes de bloqueo por limite en backend (sin cambios de interfaz):

- `PlanLimitExceededError` + `getPlanLimitErrorMessage` en `web/src/shared/lib/plan-limits.ts`
- adopcion en acciones/API criticas:
  - `web/src/modules/settings/actions.ts`
  - `web/src/modules/employees/actions.ts`
  - `web/src/modules/documents/actions.ts`
  - `web/src/app/api/company/employees/route.ts`
  - `web/src/app/api/company/documents/route.ts`

Verificacion automatizada:

- `npm run verify:plan-limit-messages`

### C4 - Reglas de upgrade/downgrade con consistencia

Regla aplicada en backend para cambio de plan:

- se bloquea el downgrade cuando el uso actual excede limites del plan destino
- no se borran datos ni se fuerzan recortes automaticos

Implementacion:

- `assertOrganizationCanSwitchToPlan` + `PlanDowngradeBlockedError` en `web/src/shared/lib/plan-limits.ts`
- validacion previa al cambio de plan en `web/src/modules/organizations/actions.ts`

Verificacion automatizada:

- `npm run verify:plan-change-rules`
- incluye chequeo de guardia en codigo y evaluacion de impacto org-plan

### C5 - Reporte de uso por tenant para soporte comercial

Se agrego reporte backend-first para operacion/comercial:

- script: `web/scripts/generate-tenant-usage-report.mjs`
- comandos:
  - `npm run report:tenant-usage` (tabla)
  - `npm run report:tenant-usage:json`
  - `npm run report:tenant-usage:csv`

Contenido del reporte por tenant:

- plan actual (`code` y nombre)
- consumo y limite de sucursales, usuarios, empleados y storage
- porcentaje de uso por recurso
- modulos habilitados
- ultima actividad de auditoria
- `support_risk` para priorizacion operativa

Resultado de ejecucion local reciente:

- reporte generado OK
- resumen operativo disponible para soporte comercial

Validacion final de etapa:

- `npm run lint` OK
- `npm run build` OK

## 27. B3 implementado: panel de observabilidad basico

Se agrego bloque de observabilidad en dashboard superadmin con foco operativo:

- ruta: `web/src/app/(superadmin)/superadmin/dashboard/page.tsx`
- servicio backend: `web/src/modules/superadmin/lib/health-metrics.ts`

Metricas visibles (ventana 7 dias):

- eventos totales
- errores
- accesos bloqueados
- fallos de login
- tiempo de respuesta promedio (cuando exista metadata de duracion)
- p95 de respuesta (cuando exista metadata de duracion)

Adicional:

- ranking "areas con mas fallos" por dominio auditado (`event_domain`) con estado `OK/Alerta/Critico`
- calculo de fallos por area usando `outcome = error|denied`

Nota:

- los tiempos de respuesta se calculan solo si hay valores en metadata (`duration_ms`, `response_time_ms`, `latency_ms`, `elapsed_ms`)
- si no hay datos de duracion, la UI muestra `Sin datos` y mantiene el resto de metricas operativas

Estado de despliegue actual:

- card de observabilidad oculta temporalmente en `superadmin/dashboard` para continuar iteracion antes de exponerla en UI
- calculos backend de observabilidad se mantienen listos para reactivar la card sin rehacer servicio

## 28. Decisiones de producto vigentes (2026-03-13)

Se dejan asentadas decisiones funcionales definidas para el modelo SaaS actual:

- Alta de empleado existente en otra empresa: permitido.
- Si una empresa registra a una persona que ya existe en otra empresa, se maneja como empleado independiente por tenant (registro propio en esa empresa, sin mezclar historial ni datos operativos entre empresas).
- No aplicar bloqueo de manager para crear/asignar admins: se mantiene comportamiento actual por decision de negocio.

Impacto operativo:

- se prioriza autonomia por empresa en gestion de personal
- se mantiene separacion multi-tenant de datos por `organization_id`
- el cambio sugerido de "bloquear manager -> admin" queda descartado por ahora

## 29. Seleccion de empresa activa (multiempresa)

Se implemento seleccion estable de empresa activa para usuarios con acceso a multiples empresas.

Regla aplicada:

1. Si la URL incluye `?org=<organization_id>`, se toma esa empresa y se guarda como activa.
2. Si no viene en URL, se usa la ultima empresa activa guardada en cookie (`gb_active_org_id`) si el usuario tiene acceso a ella.
3. Si el usuario tiene acceso a multiples empresas y no hay empresa activa guardada, se redirige a selector de empresa.
4. Si el usuario solo tiene acceso a una empresa, se usa esa directamente.

Cambios tecnicos relevantes:

- nueva pagina selector: `web/src/app/auth/select-organization/page.tsx`
- nueva accion server para confirmar empresa: `selectOrganizationAction` en `web/src/modules/auth/actions.ts`
- resolucion deterministica de membresia: `resolvePreferredMembership` en `web/src/modules/memberships/queries.ts`
- acceso backend alineado al tenant activo por cookie + selector: `web/src/shared/lib/access.ts`
- captura de `org` en URL y persistencia en cookie desde proxy: `web/src/proxy.ts`
- utilidades de tenant activo: `web/src/shared/lib/tenant-selection.ts` y `web/src/shared/lib/tenant-selection-shared.ts`

## 30. Auditoria de actor/accion/fecha en datos (sin pantalla nueva)

Decisiones y estado aplicado:

- Se prioriza guardar auditoria en datos para acciones criticas (quien hizo que y cuando).
- La pantalla visual `Superadmin > Auditoria` se posterga para una iteracion posterior.

Cobertura agregada en API de empresa:

- `web/src/app/api/company/users/route.ts`
  - `user.membership.update`
  - `user.membership.delete`
- `web/src/app/api/company/employees/route.ts`
  - `employee.create`
  - `employee.update`
  - `employee.status.update`
  - `employee.delete`
- `web/src/app/api/company/document-folders/route.ts`
  - `document.folder.update`
  - `document.folder.delete`
- `web/src/app/api/company/settings/route.ts`
  - `settings.profile.update`
  - `settings.preferences.update`
  - `settings.billing.update`
  - `settings.theme.update`
- `web/src/app/api/company/feedback/route.ts`
  - `feedback.create`

Cada evento guarda en `audit_logs`:

- actor (`actor_user_id`)
- accion (`action`)
- cuando (timestamp de insercion)
- tenant (`organization_id`)
- estado (`outcome`: `success` / `error`)

## 31. Integridad de alta de empleado (todo o nada)

Se reforzo `POST /api/company/employees` para evitar estados parciales en alta.

Mejora aplicada:

- si falla una etapa posterior a crear el empleado (documentos, vinculos o contrato), se ejecuta rollback best-effort de la alta.

Rollback incluye:

- borrado de `employee_documents` del empleado creado
- borrado de `employee_contracts` del empleado creado
- borrado del registro en `employees`
- borrado de documentos creados en la operacion
- borrado de jobs de post-proceso asociados a esos documentos
- borrado de archivos subidos en storage durante la operacion
- si la membresia se creo en esta misma solicitud, se revierte
- si el usuario auth se creo en esta misma solicitud, se revierte

Archivo principal:

- `web/src/app/api/company/employees/route.ts`

## 32. Integridad de submit de checklist (todo o nada)

Se reforzo `POST /api/employee/checklists/submit` para evitar envios parciales.

Mejora aplicada:

- si falla una etapa despues de crear `checklist_submissions` (items, comentarios, flags o evidencias), se ejecuta rollback best-effort del envio.

Rollback incluye:

- borrado de archivos de evidencia subidos en storage durante la operacion
- borrado de `checklist_item_attachments` creados
- borrado de `checklist_item_comments` creados
- borrado de `checklist_flags` creados
- borrado de `checklist_submission_items` creados
- borrado de `checklist_submissions` del envio

Archivo principal:

- `web/src/app/api/employee/checklists/submit/route.ts`

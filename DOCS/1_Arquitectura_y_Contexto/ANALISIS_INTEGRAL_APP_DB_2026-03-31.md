# Analisis Integral de App + Database (2026-03-31)

> ESTADO DOCUMENTAL: HISTORICO DE DIAGNOSTICO.
> Este documento representa una foto tecnica al 2026-03-31.
> Para decisiones operativas actuales usar: `DOCS/00_START_HERE.md` y `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md`.

## 1) Alcance y metodologia

Este analisis se realizo revisando:

- Aplicacion web (`web/`): arquitectura, proxy/middleware, APIs, seguridad, observabilidad y operaciones.
- Base de datos Supabase/Postgres (`supabase/migrations/` + `supabase/seed.sql`): modelo, RLS, funciones, RPCs, indices y consistencia evolutiva.
- Documentacion tecnica y operativa existente (`DOCS/`): alineacion entre contrato funcional y estado implementado.

Objetivo: dejar un diagnostico accionable con fortalezas, debilidades, plan de mejora y checklist operativo.

---

## 2) Resumen ejecutivo

Estado general: **la base del producto es solida y avanzada para un SaaS multi-tenant**, especialmente en aislamiento por tenant, cobertura funcional y tooling de verificacion.

Nivel de madurez observado: **intermedio-alto**.

Principal hallazgo: existe una **brecha de consistencia** entre algunas migraciones/seed y el estado funcional actual (riesgo de drift en DB y deuda operativa acumulada).

Recomendacion macro:

1. Blindar seguridad SQL (RPC `SECURITY DEFINER`, grants y validaciones `auth.uid()`).
2. Resolver inconsistencias de migraciones/seed para tener una sola fuente de verdad reproducible.
3. Modularizar endpoints muy extensos y unificar convenciones de calidad/operacion.

---

## 3) Inventario tecnico actual

### 3.1 Stack

- Frontend/backend app: Next.js App Router + TypeScript (`web/package.json`).
- DB/Auth/Storage: Supabase (Postgres + RLS + Auth + Storage).
- Billing: Stripe.
- Notificaciones: Brevo/Twilio.
- Rate limiting: Upstash Redis (con fallback en memoria en algunos flujos).
- Observabilidad funcional: `audit_logs` + scripts de verificacion operativa.

### 3.2 Arquitectura de app

- Ruteo por contexto:
  - `web/src/app/(superadmin)/...`
  - `web/src/app/(company)/...`
  - `web/src/app/(employee)/...`
- Dominios modulares en `web/src/modules/*`.
- Capa de acceso/guardas centralizada en `web/src/shared/lib/access.ts`.
- Clientes Supabase diferenciados:
  - server/SSR (`web/src/infrastructure/supabase/client/server.ts`)
  - admin/service-role (`web/src/infrastructure/supabase/client/admin.ts`)

### 3.3 Arquitectura de datos (schema funcional)

Dominios principales detectados:

- SaaS core/multi-tenant:
  - `organizations`, `plans`, `organization_limits`, `branches`
  - `roles`, `permissions`, `role_permissions`, `memberships`
  - `module_catalog`, `organization_modules`, `plan_modules`
- Personas:
  - `employees`, `organization_user_profiles`, `organization_invitations`
  - `employee_contracts`, `superadmin_impersonation_sessions`
- Documentos:
  - `document_folders`, `documents`, `document_access_rules`, `employee_documents`, `document_processing_jobs`
- Comunicacion:
  - `announcements`, `announcement_audiences`, `announcement_deliveries`
- Checklists:
  - `checklist_templates`, `checklist_template_sections`, `checklist_template_items`
  - `checklist_submissions`, `checklist_submission_items`
  - `checklist_item_comments`, `checklist_item_attachments`, `checklist_flags`
  - `scheduled_jobs`
- Configuracion y trazabilidad:
  - `organization_settings`, `user_preferences`, `feedback_messages`, `audit_logs`

### 3.4 Seguridad de datos

- RLS habilitado ampliamente desde base (`20260311_0001_base_saas.sql`) y endurecido por dominio.
- Funciones de acceso por contexto (ej. `can_read_document`, `can_read_checklist_template`, `can_read_announcement`).
- Politicas por tenant con helpers (`has_org_membership`, `can_manage_org`, `is_module_enabled`).

---

## 4) Puntos fuertes

### 4.1 Multi-tenant y seguridad

- Modelo tenant-first consistente: la gran mayoria de entidades de negocio incluye `organization_id`.
- RLS profunda por dominio (documentos, checklists, anuncios) con funciones de alcance por usuario/sucursal/departamento/puesto.
- Control por modulo y por rol en backend (`access.ts`), no solo en UI.
- Soporte de impersonacion superadmin y trazabilidad asociada.

### 4.2 Cobertura funcional real

- Tres contextos operativos claros: superadmin, empresa y empleado.
- Funcionalidades criticas resueltas: RRHH, documentos, anuncios, checklists, reportes, billing, branding y asistente IA.
- Integraciones productivas (Stripe, cron interno y externo, email/SMS/WhatsApp).

### 4.3 Operacion y calidad

- Muy buena base de scripts de verificacion (`verify:*`, `smoke-modules`, aislamiento RLS, plan limits, auditoria, metricas).
- Auditoria centralizada con sanitizacion de metadatos (`web/src/shared/lib/audit.ts`).
- Indices de performance en tablas calientes y snapshots operativos para superadmin.

### 4.4 Evolucion de producto

- Historial de migraciones activo y granular.
- Documentacion viva en `DOCS/` con entregables, runbooks y planes de versionado.

---

## 5) Puntos debiles (con prioridad)

## P0 - Riesgo alto (seguridad/consistencia)

1. **RPCs `SECURITY DEFINER` con superficie de exposicion alta**
   - Ejemplos: `get_company_users`, `get_user_id_by_email`, RPCs atomicas.
   - Hallazgo: al menos algunas funciones no validan explicitamente `auth.uid()` ni membresia dentro de la funcion.
   - Riesgo: fuga de datos cross-tenant si existen grants amplios a `authenticated`/`public`.

2. **Inconsistencias de migraciones potencialmente rompedoras**
   - `20260326030000_feedback_messages_status.sql` vuelve a agregar columna `status` en `feedback_messages` (ya existe desde `202603110006_settings_and_feedback.sql`) y redefine semantica de estados.
   - Riesgo: fallo en despliegue de migraciones o divergencia entre entornos.

3. **Drift schema-app por columnas no versionadas formalmente**
   - El codigo consulta `documents.deleted_at` en multiples puntos (`plan-limits`, `ai/chat`), pero no existe migracion detectada que agregue esa columna.
   - Riesgo: errores runtime por columna inexistente y resultados inconsistentes entre ambientes.

## P1 - Riesgo medio-alto (mantenibilidad/robustez)

4. **Inconsistencia en contratos de columnas dentro de RPC atomica**
   - En `20260326000000_employee_and_checklist_atomic_rpcs.sql`, `create_employee_transaction` inserta columnas de `employee_contracts` que no coinciden con schema observado (`status`, `signer_name_snapshot` vs `contract_status`, `signer_name`).
   - Riesgo: falla de ejecucion al activar ese RPC.

5. **Desalineacion seed vs contrato comercial actual**
   - `supabase/seed.sql` sigue sembrando planes `starter/growth/enterprise`, mientras la documentacion operativa vigente habla de `basico/pro`.
   - Riesgo: confusion operativa y datos de QA no representativos del negocio real.

6. **Endpoints demasiado largos y con alta carga de responsabilidad**
   - Ejemplo: `web/src/app/api/company/ai/chat/route.ts` (~940 lineas) y `web/src/app/api/company/employees/route.ts` (>1400 lineas por referencias internas).
   - Riesgo: baja mantenibilidad, mayor probabilidad de regresiones y testing dificil.

## P2 - Riesgo medio (operacion/calidad)

7. **`middleware.ts` con warning de deprecacion documentado**
   - Existe advertencia interna sobre migrar de `middleware` a `proxy` en Next.

8. **Uso extendido de cliente admin/service-role en capa app**
   - Es valido para operaciones server-side, pero requiere disciplina estricta de guardas previas en todos los paths.

9. **Heterogeneidad de convenciones SQL/TS en el tiempo**
   - Nombres/estados/campos evolucionados con estilos mixtos; aumenta costo cognitivo para nuevos devs.

---

## 6) Analisis del schema de datos (profundo)

### 6.1 Fortalezas de modelado

- Modelo relacional bien normalizado para SaaS B2B multi-tenant.
- Relacionamiento consistente con FKs y restricciones de estado (`check`).
- `organization_limits` + `plans` + `plan_modules` permiten control comercial y tecnico desacoplado.
- Dominio documental y checklist modelado con granularidad suficiente para trazabilidad operativa.

### 6.2 Fortalezas de seguridad en DB

- RLS no superficial: incluye funciones de acceso por alcance y ownership.
- Helpers de permisos reutilizables y centralizados en SQL.
- Politicas de lectura/escritura por rol/tenant en tablas sensibles.

### 6.3 Riesgos estructurales del schema

- Evolucion por muchas migraciones incrementales sin una etapa de consolidacion.
- Presencia de RPCs `SECURITY DEFINER` sin blindaje homogeneo de seguridad contextual.
- Posible deuda por campos legacy coexistiendo con campos nuevos (ej. perfiles, estados y scopes).

### 6.4 Indices y performance

- Buen trabajo en indices por `organization_id`, `branch_id`, fechas y estado.
- Acierto: migracion dedicada de performance (`20260325211813_create_performance_indexes.sql`) y snapshot superadmin para KPIs.
- Oportunidad: revisar planes de ejecucion reales en produccion para funciones de acceso con JSONB (scopes) y RPCs de alto trafico.

---

## 7) Plan de mejora propuesto

## Fase 0 (0-7 dias) - Contencion critica

1. Auditoria SQL de seguridad:
   - Inventariar todas las funciones `SECURITY DEFINER`.
   - Forzar validaciones internas por `auth.uid()` + pertenencia tenant en cada funcion expuesta.
   - Revisar y endurecer grants (`REVOKE EXECUTE FROM PUBLIC` + grants minimos necesarios).

2. Corregir migraciones conflictivas:
   - Crear migraciones de remediacion para `feedback_messages_status` y para contratos de RPC de empleados.
   - Asegurar que `supabase db push` sea idempotente en ambiente limpio.

3. Resolver drift de `deleted_at`:
   - O se agrega migracion formal de soft-delete en `documents`, o se quitan referencias del codigo.

## Fase 1 (8-21 dias) - Estabilizacion de plataforma

1. Refactor de rutas criticas largas:
   - Dividir `employees` y `ai/chat` en servicios + validadores + mapeadores por responsabilidad.
   - Mantener handlers delgados (parseo + auth + orquestacion).

2. Consolidacion de contrato de planes:
   - Alinear `seed.sql`, docs y codigo a un unico set de planes vigentes.
   - Evitar coexistencia de contratos comerciales antiguos en scripts de setup.

3. Governance de migraciones:
   - Regla: toda referencia nueva de columna en app requiere migracion asociada en el mismo lote.
   - Check CI: levantar DB desde cero + correr smoke de schema.

## Fase 2 (22-45 dias) - Madurez operativa

1. Observabilidad tecnica avanzada:
   - Tablero con SLOs: errores API, latencia p95, fallos de webhook, colas cron, denegaciones RLS.

2. Testing sistematico:
   - Suite de tests de contrato DB/app para funciones SQL criticas y RLS.
   - Tests de regresion sobre cambios de plan y modulos.

3. Hardening de costos IA:
   - Presupuesto por tenant, alertas por consumo y circuit-breakers automaticos.

---

## 8) Checklist operativo (ejecutable)

## Diario

- [ ] Verificar salud de cron: `daily`, `process-recurrence`, `deliveries`.
- [ ] Revisar errores 5xx y top fallos auth/acceso en logs.
- [ ] Confirmar que no haya crecimiento anomalo en `audit_logs` y colas pendientes.
- [ ] Validar webhooks Stripe recientes sin eventos en error.

## Semanal

- [ ] Ejecutar bateria QA tecnica:
  - `npm run verify:smoke-modules`
  - `npm run verify:role-permissions`
  - `npm run verify:rls-isolation`
  - `npm run verify:reports-isolation`
  - `npm run verify:plan-limit-enforcement`
  - `npm run verify:audit-coverage`
- [ ] Revisar tendencias de metricas operativas (`verify:operational-metrics-consistency`).
- [ ] Auditar invitaciones pendientes/expiradas y sesiones de impersonacion activas.

## Pre-release

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Ejecutar scripts `verify:*` de seguridad, modulos y planes.
- [ ] Validar migraciones en entorno limpio (reset + apply completo).
- [ ] Verificar que no haya drift entre schema esperado y schema real.

## Mensual

- [ ] Revisar permisos SQL/grants de funciones sensibles.
- [ ] Revisar cardinalidad e indices en tablas de mayor crecimiento.
- [ ] Revisar costo de IA y notificaciones por tenant.
- [ ] Simular incidente (runbook) y tiempo real de recuperacion.

## Incidentes (L1/L2)

- [ ] Aplicar runbook vigente (`DOCS/4_Operaciones_y_Guias/OPS_RUNBOOK.md`).
- [ ] Clasificar severidad y activar contencion (app/data/infra).
- [ ] Preservar evidencia tecnica minima (logs, queries, auditoria).
- [ ] Ejecutar plan de rollback por capas sin cambios manuales no trazables en prod.

---

## 9) KPIs recomendados de seguimiento

- Seguridad:
  - tasa `access.denied.*` por 1.000 requests
  - incidentes de aislamiento tenant
- Confiabilidad:
  - error rate API
  - disponibilidad endpoints criticos
- Performance:
  - p95/p99 de rutas top
  - tiempo de cron y colas pendientes
- Producto/operacion:
  - adopcion de modulos por tenant
  - cumplimiento de checklists
  - documentos pendientes

---

## 10) Conclusiones

La plataforma ya tiene cimientos correctos para escalar: buen modelo multi-tenant, RLS avanzada, modulo comercial por plan y una cultura de verificacion automatizada por encima del promedio.

La prioridad ahora no es agregar mas features, sino **cerrar deuda estructural de consistencia y seguridad SQL** para sostener crecimiento sin riesgo operativo.

Si se ejecuta el plan propuesto (Fase 0-2), el sistema puede pasar de un estado intermedio-alto a **madurez alta**, con releases mas predecibles y menor riesgo de incidentes cross-tenant.

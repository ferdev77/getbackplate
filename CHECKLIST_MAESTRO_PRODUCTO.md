# Checklist Maestro de Avance - GetBackplate

Este archivo es la fuente de verdad para avanzar sin limite de tiempo.
Para el modulo de Recursos Humanos (flujo 2.0), complementar con `ACTUALIZACION_2.0_SAAS.md` como especificacion funcional detallada vigente.
Cada paso se marca con check cuando queda terminado y validado.

## Como usar este checklist

- Marcar `[x]` solo cuando el paso este terminado de punta a punta.
- Si un paso depende de otro, no saltar el orden.
- Al cerrar cada bloque, actualizar `DOCUMENTACION_TECNICA.md` y `GUIA_BASICA_SISTEMA.md`.

---

## Bloque A - Gobierno y estado real del producto

- [x] A1. Unificar estado real de modulos en documentacion tecnica y guia basica.
- [x] A2. Definir matriz unica de modulos por estado: `disponible`, `parcial`, `en hardening`, `listo comercial`.
- [x] A3. Definir matriz de rutas protegidas por rol y por modulo activo.
- [x] A4. Definir criterio de release: que debe estar OK para publicar a produccion.

## Bloque B - Madurez tecnica y operativa

- [x] B1. Implementar auditoria avanzada por eventos criticos (auth, permisos, cambios de plan, acciones destructivas).
- [x] B1.a Especificacion funcional/tecnica documentada en `web/docs/audit-advanced-spec.md` (sin cambios de codigo/DB).
- [x] B1.b Instrumentacion backend inicial aplicada (auth + denegaciones de acceso) sin cambios de UI ni reglas RLS.
- [x] B1.c Instrumentacion superadmin reforzada (organizaciones, planes y catalogo de modulos) con `eventDomain/outcome/severity`.
- [x] B1.d Cobertura de auditoria validada en acciones mutables (`npm run verify:audit-coverage`).
- [x] B1.e Auditoria de actor/accion/fecha reforzada en APIs criticas de empresa (`users`, `employees`, `document-folders`, `settings`, `feedback`).
- [x] B2. Definir y exponer metricas de salud por tenant (actividad, errores, adopcion de modulos).
- [x] B2.a Servicio backend reutilizable creado para metricas superadmin (`getSuperadminHealthMetrics`) sin cambiar UI.
- [x] B2.b Metricas operativas agregadas desde `audit_logs` (`getSuperadminOperationalMetrics`) sin UI nueva.
- [x] B2.c Script de verificacion operacional disponible (`npm run verify:operational-metrics`).
- [x] B2.d Metricas con tendencias y ratios (7d/ventana previa) agregadas en backend.
- [x] B2.e Script de consistencia de metricas disponible (`npm run verify:operational-metrics-consistency`).
- [x] B3. Construir panel de observabilidad basico (errores, tiempos de respuesta, fallos de endpoints criticos).
- [x] B3.a Card de observabilidad oculta temporalmente en UI para iteracion adicional antes de release visible.
- [-] B3.b Crear pantalla dedicada `Superadmin > Auditoria` con filtros y export (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] B4. Completar y documentar `score` superadmin con acciones sugeridas por riesgo (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [x] B5. Agregar alertas operativas minimas (tenant sin admins activos, modulos clave deshabilitados, sin actividad reciente).
- [x] B5.a Helper backend de alertas operativas definido en `health-metrics.ts` (sin exponer UI aun).
- [x] B5.b Evaluacion operativa ejecutable disponible (`npm run verify:operational-alerts`).

## Bloque C - Negocio y monetizacion ejecutable

- [x] C1. Definir planes comerciales oficiales (Starter, Pro, Enterprise) con limites exactos.
- [x] C2. Implementar enforcement backend de limites por plan (usuarios, sucursales, modulos, almacenamiento, volumen operativo).
- [x] C1.a Packaging oficial documentado en `web/docs/official-plan-packaging.md`.
- [x] C1.b Packaging oficial aplicado y verificado (`npm run apply:official-plan-packaging` + `npm run verify:official-plan-packaging`).
- [x] C1. Definir planes comerciales oficiales (Starter, Pro, Enterprise) con limites exactos.
- [x] C2.a Libreria backend de enforcement de limites creada (`src/shared/lib/plan-limits.ts`).
- [x] C2.b Enforcement aplicado en acciones/API criticas (sucursales, usuarios, empleados, storage documentos).
- [x] C2.c Verificacion automatizada disponible (`npm run verify:plan-limit-enforcement`).
- [x] C2. Implementar enforcement backend de limites por plan (usuarios, sucursales, modulos, almacenamiento, volumen operativo).
- [x] C3.a Mensajes de limite estandarizados en backend (`getPlanLimitErrorMessage` en rutas/acciones criticas).
- [x] C3.b Verificacion automatizada de consistencia de mensajes (`npm run verify:plan-limit-messages`).
- [x] C3. Bloquear acciones al superar limites con mensajes claros en UI.
- [x] C4.a Regla backend aplicada: bloquear downgrade cuando uso actual excede limites de plan destino.
- [x] C4.b Verificacion automatizada de reglas de cambio de plan (`npm run verify:plan-change-rules`).
- [x] C4. Definir flujo de upgrade/downgrade con reglas de consistencia de datos.
- [x] C5.a Script de reporte operativo por tenant disponible (`npm run report:tenant-usage`).
- [x] C5.b Exportacion soporte lista en JSON/CSV (`report:tenant-usage:json` / `report:tenant-usage:csv`).
- [x] C5. Crear reportes de uso por tenant para soporte comercial.

## Bloque D - Seguridad y calidad

- [x] D1. Automatizar pruebas de aislamiento multi-tenant (documentos, anuncios, checklists, reportes).
- [x] D1.a Script automatizado de aislamiento multi-tenant listo (`npm run verify:rls-isolation`).
- [x] D1.b Script automatizado de aislamiento para slices de reportes listo (`npm run verify:reports-isolation`).
- [x] D2. Automatizar pruebas de permisos por rol en acciones criticas.
- [x] D2.a Script de matriz de permisos por rol listo (`npm run verify:role-permissions`).
- [x] D3. Definir smoke tests por modulo para validar release rapido.
- [x] D3.a Script de smoke tests por modulo definido y ejecutable (`npm run verify:smoke-modules`).
- [x] D4. Validar y fortalecer carga de archivos (MIME, tamano, rutas por tenant, acceso de descarga).
- [x] D4.a Guardrails backend de almacenamiento aplicados (rutas seguras por tenant + validaciones de descarga).
- [x] D4.b Script de verificacion de guardrails de documentos listo (`npm run verify:document-guardrails`).
- [ ] D5. Documentar protocolo de incidentes de seguridad y rollback operativo.
- [x] D5.a Runbook de incidentes de seguridad documentado (`web/docs/security-incident-runbook.md`).
- [x] D5.b Protocolo de rollback operativo documentado (`web/docs/operational-rollback-protocol.md`).
- [x] D5. Documentar protocolo de incidentes de seguridad y rollback operativo.

## Bloque E - UX operativa y consistencia

- [-] E1. Estandarizar feedback de exito/error en todos los modulos activos (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] E2. Estandarizar confirmaciones de acciones destructivas en toda la app (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] E3. Revisar y corregir estados vacios y mensajes de error en rutas principales (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] E4. Asegurar reflejo inmediato de cambios en UI sin recarga manual (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] E5. Validar responsive real en desktop/tablet/mobile para vistas clave (Migrado a ACTUALIZACION_2.2_SAAS.md).

## Bloque H - Consistencia transaccional de flujos criticos

- [x] H1. Alta de empleado endurecida a comportamiento "todo o nada" con rollback best-effort en fallos posteriores.
- [x] H2. Submit de checklist con evidencias endurecido a comportamiento "todo o nada" con rollback best-effort.
- [-] H3. Definir set minimo de operaciones criticas que deben ejecutarse en RPC transaccional (Migrado a ACTUALIZACION_2.2_SAAS.md).

## Bloque F - Datos y performance

- [-] F1. Revisar indices de tablas criticas por `organization_id`, `branch_id` y fechas de consulta (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] F2. Definir vistas/materialized views para metricas superadmin y reportes pesados (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] F3. Medir y optimizar consultas de dashboard, reports y portal empleado (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] F4. Definir politica de retencion de logs y datos historicos (Migrado a ACTUALIZACION_2.2_SAAS.md).

## Bloque G - Operacion continua

- [-] G1. Definir runbook tecnico para soporte (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] G2. Definir runbook funcional para onboarding de nuevos tenants (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] G3. Definir checklist de alta de tenant (Migrado a ACTUALIZACION_2.2_SAAS.md).
- [-] G4. Definir checklist de cierre/suspension de tenant con trazabilidad (Migrado a ACTUALIZACION_2.2_SAAS.md).

---

## Criterio de cierre global

Se considera que la etapa de madurez esta cerrada cuando:

- todos los pasos criticos A/B/C/D esten en `[x]`
- la documentacion este sincronizada con el estado real
- exista evidencia verificable (tests, metricas, logs, validaciones funcionales)

## Historial de avance

- Inicio del checklist maestro: 2026-03-13
- Responsable operativo: equipo GetBackplate + asistente

### Refactorizacion arquitectonica (2026-03-26)

- [x] Extraccion de capa de servicios en 3 modulos criticos:
  - `checklists/actions.ts` (843 → 270 ln, -68%) → `services/checklist-audience.service.ts` + `services/checklist-template.service.ts`
  - `organizations/actions.ts` (992 → 380 ln, -62%) → `services/invitation.service.ts` + `services/organization.service.ts`
  - `settings/actions.ts` (558 → 280 ln, -50%) → `services/org-structure.service.ts`
- [x] 3 builds consecutivos OK (`next build` exit code 0)
- [x] Cero cambios visuales, cero cambios en firmas exportadas
- [x] Convencion documentada en `ESTRUCTURA_PROYECTO.md` y `reglas_desarrollo.md`

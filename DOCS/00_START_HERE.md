# Start Here - Canonical Reading Order

Objetivo: evitar confusion entre fases globales del producto y subfases internas de complementos.

## Vigente vs Historico (lectura de 30 segundos)

Usar como vigente primero:
- `DOCS/00_START_HERE.md`
- `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md`
- `DOCS/complemento_etapa_1/COMP_F1_ESTADO_REAL_Y_ROADMAP.md`

Tomar como historico/contextual (no como estado runtime unico):
- `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.0_SAAS.md`
- `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.1_SAAS.md`
- `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.2_SAAS.md`
- `DOCS/1_Arquitectura_y_Contexto/ANALISIS_INTEGRAL_APP_DB_2026-03-31.md`

Regla rapida: si un documento historico contradice uno vigente, prevalece el vigente.

## 1) Si la pregunta es "cual es la siguiente fase de implementacion"

Leer primero:
- `DOCS/complemento_etapa_1/COMP_F1_ESTADO_REAL_Y_ROADMAP.md`

Luego validar detalle de flujo:
- `DOCS/complemento_etapa_1/COMP_F1_ALCANCE_Y_FLUJOS.md`

## 2) Si la pregunta es "cual es el roadmap global"

Leer:
- `DOCS/2_Planes_y_Checklists/PROD_ROADMAP_MACRO.md`
- `DOCS/2_Planes_y_Checklists/PROD_F1_PLAN_BASE_SAAS.md`

## 3) Si la pregunta es seguridad/riesgo tecnico

Leer:
- `DOCS/1_Arquitectura_y_Contexto/ANALISIS_INTEGRAL_APP_DB_2026-03-31.md`
- `DOCS/2_Planes_y_Checklists/PLAN_EJECUCION_TABLERO_OPERATIVO_SIN_FECHAS.md`

## 4) Si la pregunta es flujo de documentos de empleados (slots fijos/custom)

Leer:
- `DOCS/4_Operaciones_y_Guias/GUIA_FLUJO_DOCUMENTOS_CUSTOM_EMPLEADOS.md`
- `DOCS/4_Operaciones_y_Guias/GUIA_SEPARACION_DOCUMENTOS_LABORALES_OPERATIVOS.md`

## 5) Si la pregunta es validar flujos DB (anuncios, documentos, checklists) en local/prod

Leer:
- `DOCS/4_Operaciones_y_Guias/GUIA_VALIDACION_FLUJOS_LOCAL_PROD.md`
- `DOCS/4_Operaciones_y_Guias/REPORTE_VALIDACION_FLUJOS_LOCAL_PROD_2026-04-16.md`

## 6) Si la pregunta es modulo core de permisos (delegacion a employees)

Leer:
- `DOCS/2_Planes_y_Checklists/TECH_REMEDIATION_TRACK_MODULO_CORE_PERMISOS_PLAN_CHECKLIST.md`

## 7) Si la pregunta es como operar releases/migraciones/repositorio

Leer:
- `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_CLI_OBLIGATORIA.md`

## 8) Si la pregunta es mejora de arquitectura/modularizacion

Leer:
- `DOCS/1_Arquitectura_y_Contexto/AUDITORIA_ARQUITECTURA_MODULARIZACION_2026-04-19.md`
- `DOCS/2_Planes_y_Checklists/PLAN_IMPLEMENTACION_SENIOR_ARQUITECTURA_MODULAR_2026-04-19.md`
- `DOCS/4_Operaciones_y_Guias/REPORTE_EJECUCION_ULTRA_PASADA_ARQUITECTURA_2026-04-19.md`

## 9) Si la pregunta es toggle/vistas de Documentos (empresa + portal)

Leer:
- `DOCS/2_Planes_y_Checklists/TECH_REMEDIATION_TRACK_DOCUMENTOS_TOGGLE_Y_VISTAS_PLAN_2026-04-21.md`
- `DOCS/4_Operaciones_y_Guias/GUIA_FLUJO_DOCUMENTOS_CUSTOM_EMPLEADOS.md`

## 10) Si la pregunta es scripts operativos (que hace cada script y como correrlo)

Leer:
- `DOCS/4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md`

## 11) Si la pregunta es integracion QuickBooks Online -> Restaurant365

Leer (orden recomendado):
- `DOCS/4_Operaciones_y_Guias/GUIA_ONBOARDING_QBO_R365_RAPIDA.md`
- `DOCS/2_Planes_y_Checklists/PRODUCT_PHASE_INTEGRACION_QBO_R365_PROPUESTA_IMPLEMENTACION.md`
- `DOCS/1_Arquitectura_y_Contexto/PRODUCT_PHASE_QBO_R365_ESPECIFICACION_TECNICA.md`
- `DOCS/2_Planes_y_Checklists/PRODUCT_PHASE_QBO_R365_MATRIZ_MAPEO_BASE.md`
- `DOCS/2_Planes_y_Checklists/PRODUCT_PHASE_QBO_R365_PLAN_IMPLEMENTACION_CHECKLIST.md`
- `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md`
- `DOCS/4_Operaciones_y_Guias/GUIA_CONFIGURACION_QBO_R365_SANDBOX.md`

## 12) Si la pregunta es scope/permisos de empleados multi-locacion

El sistema tiene dos contextos de acceso:
- **Admin** (`/app/*`): scope global, todas las locaciones
- **Portal empleado** (`/portal/*`): scope restringido a locaciones asignadas

Archivos clave en codigo (no en DOCS, leer directamente):
- `web/src/shared/lib/employee-api-scope.ts` — resolver locaciones permitidas para APIs
- `web/src/shared/lib/employee-location-scope.ts` — resolver scope para paginas del portal
- `web/src/shared/lib/employee-module-permissions.ts` — permisos delegados por modulo
- `web/src/shared/lib/scope-policy.ts` — logica de matcheo de audiencia
- `web/src/shared/lib/scope-validation.ts` — validacion de IDs de scope contra BD

Estado al 2026-05-01: scope multi-locacion corregido en todas las rutas API de empleado
(announcements, documents, document-folders, checklists/templates, checklists/submit, vendors).

## Regla operativa para IA o humanos

1. Responder primero lo puntual pedido por el usuario.
2. Citar el documento canonico del tema.
3. Solo despues agregar contexto adicional.
4. Operar siempre por CLI oficial (`supabase`, `vercel`, `gh`) cuando aplique.

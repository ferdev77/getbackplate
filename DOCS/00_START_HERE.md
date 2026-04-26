# Start Here - Canonical Reading Order

Objetivo: evitar confusion entre fases globales del producto y subfases internas de complementos.

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

## Regla operativa para IA o humanos

1. Responder primero lo puntual pedido por el usuario.
2. Citar el documento canonico del tema.
3. Solo despues agregar contexto adicional.
4. Operar siempre por CLI oficial (`supabase`, `vercel`, `gh`) cuando aplique.

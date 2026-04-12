# DOC_ID: COMP_F1_EXECUTION_REPRIORITIZED_PLAN
# DOC_LEVEL: COMPLEMENTO
# PHASE_NAMESPACE: COMP_F1_SUBPHASE
# SOURCE_OF_TRUTH_FOR: orden oficial de ejecucion y control check-by-check de Complemento Fase 1

# Plan de ejecucion repriorizado - Complemento Fase 1

Fecha de emision: 2026-04-09
Estado: aprobado para ejecucion

## 1) Objetivo del plan

Ejecutar Complemento Fase 1 con nuevo orden de negocio, sin romper arquitectura SaaS actual, y con trazabilidad completa por checklist de fase.

## 2) Orden oficial de prioridad

1. Fase 1: Custom Domain
2. Fase 2: Mis Documentos + Vencimientos con alerta + DocuSeal
3. Fase 3: Stripe branding + Vista de columnas
4. Fase 4: Bitacora + Proveedores

## 3) Checklist canonico por fase (obligatorio)

- `DOCS/2_Planes_y_Checklists/COMP_F1_FASE_1_CUSTOM_DOMAIN_CHECKLIST.md`
- `DOCS/2_Planes_y_Checklists/COMP_F1_FASE_2_DOCUMENTOS_ALERTAS_DOCUSEAL_CHECKLIST.md`
- `DOCS/2_Planes_y_Checklists/COMP_F1_FASE_3_STRIPE_BRANDING_COLUMNAS_CHECKLIST.md`
- `DOCS/2_Planes_y_Checklists/COMP_F1_FASE_4_BITACORA_PROVEEDORES_CHECKLIST.md`

Regla: no se avanza de fase sin evidencia de cierre de la fase actual.

## 4) Reglas de ejecucion (check-by-check)

1. Marcar `[x]` solo cuando el paso este terminado y validado.
2. No saltar pasos dependientes.
3. Cada paso tecnico debe tener evidencia breve (archivo, comando, resultado).
4. Si un paso cambia alcance, registrar Decision Log en la misma fase.
5. Todo cambio sensible debe respetar tenant isolation, RLS y permisos por rol.

## 5) Evidencia minima obligatoria por fase

- Build: `npm run build`
- Lint: `npm run lint`
- Smoke principal: `npm run verify:smoke-modules`
- Seguridad/aislamiento (segun impacto):
  - `npm run verify:rls-isolation`
  - `npm run verify:role-permissions`

Nota: si una fase no toca una capa, se documenta explicitamente "no aplica" con motivo.

## 6) Criterio de cierre transversal

Una fase queda cerrada cuando:

1. Todos los checks de la fase estan en `[x]`.
2. Se adjunto evidencia tecnica y funcional.
3. Se actualizaron documentos obligatorios:
   - `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md`
   - `DOCS/4_Operaciones_y_Guias/GUIA_BASICA_SISTEMA.md`
4. Se registro avance en:
   - `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_2.2_SAAS.md` o nueva actualizacion vigente.

## 7) Fuentes canonicas relacionadas

- `DOCS/complemento_etapa_1/COMP_F1_ESTADO_REAL_Y_ROADMAP.md`
- `DOCS/complemento_etapa_1/COMP_F1_ALCANCE_Y_FLUJOS.md`
- `DOCS/00_START_HERE.md`
- `DOCS/01_DOC_GOVERNANCE_AND_NAMING.md`

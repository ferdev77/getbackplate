# Documentation Governance and Naming

## Scope namespaces (obligatorio)

- `PRODUCT_PHASE`: fases globales del producto (ej: Fase 1, Fase 2, Fase 3).
- `COMP_F1_SUBPHASE`: subfases internas de Complemento Fase 1.
- `TECH_REMEDIATION_TRACK`: planes tecnicos transversales (seguridad, migraciones, hardening).
- `OPERATIONS_RUNBOOK`: guias operativas y procedimientos.

## Naming convention

Formato recomendado:
- `<SCOPE>_<TOPIC>_<TYPE>.md`

Ejemplos:
- `PROD_F1_PLAN_BASE_SAAS.md`
- `PROD_ROADMAP_MACRO.md`
- `COMP_F1_ESTADO_REAL_Y_ROADMAP.md`
- `COMP_F1_ALCANCE_Y_FLUJOS.md`

## Header minimo requerido por documento canonico

Agregar al inicio:
- `DOC_ID`
- `DOC_LEVEL`
- `PHASE_NAMESPACE`
- `SOURCE_OF_TRUTH_FOR`

## Reglas para evitar confusion

1. Nunca usar "Fase 2" sin prefijo de namespace.
2. Si es subfase de complemento, escribir siempre `COMP_F1_SUBPHASE`.
3. Si es fase global, escribir siempre `PRODUCT_PHASE`.
4. Mantener archivos legacy solo como punteros a documento canonico.

## Canonical map (actual)

- Siguiente fase de implementacion de complemento:
  - `DOCS/complemento_etapa_1/COMP_F1_ESTADO_REAL_Y_ROADMAP.md`
- Flujo funcional por modulo de complemento:
  - `DOCS/complemento_etapa_1/COMP_F1_ALCANCE_Y_FLUJOS.md`
- Roadmap macro del producto:
  - `DOCS/2_Planes_y_Checklists/PROD_ROADMAP_MACRO.md`
- Fase 1 global del producto:
  - `DOCS/2_Planes_y_Checklists/PROD_F1_PLAN_BASE_SAAS.md`

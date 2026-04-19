# Plan de Implementacion Senior - Arquitectura Modular (2026-04-19)

Base: `DOCS/1_Arquitectura_y_Contexto/AUDITORIA_ARQUITECTURA_MODULARIZACION_2026-04-19.md`

## Meta

Llevar la base actual a una arquitectura modular consistente, con menor acoplamiento y mayor testabilidad, sin romper los flujos ya operativos de negocio.

## Objetivos concretos

1. Reducir hotspots >1200 lineas en archivos de negocio critico.
2. Estandarizar contratos y tipos compartidos entre modulos.
3. Consolidar dominio de permisos delegados y ownership en una capa reusable.
4. Aumentar cobertura de validacion automatica en rutas de riesgo.

## Enfoque de ejecucion

Estrategia incremental en 4 tracks paralelos, con releases pequenas y verificables.

Tracks:

- Track A: API y dominio (`company/employees`, `access`, `employee/*/manage`)
- Track B: UI Employees (modal monolitico -> secciones + hooks)
- Track C: UI Shells/Workspaces grandes (`company-shell`, `portal/layout`, `documents-tree-workspace`)
- Track D: Tipos/contratos/test de regresion

## Fases

### Fase 0 - Baseline y guardrails

Entregables:

- snapshot de tamano de archivos criticos,
- checklist de contratos actuales de endpoints,
- smoke test documentado de permisos delegados.

Exit criteria:

- baseline medible para comparar antes/despues.

### Fase 1 - API delgada + dominio reusable (P0)

Objetivo:

- convertir routes largas en handlers delgados + servicios de dominio.

Implementacion:

1. Crear `modules/employees/services/company-employee-upsert.service.ts`.
2. Crear `modules/employees/services/company-employee-account.service.ts`.
3. Crear `modules/permissions/services/delegation-policy.service.ts`.
4. Mover validaciones de ownership/capability repetidas a helpers comunes.
5. Dejar `route.ts` como orquestador de request/response.

Exit criteria:

- `web/src/app/api/company/employees/route.ts` <= 1200 lineas.
- sin cambios de comportamiento en smoke tests.

### Fase 2 - Refactor profundo de New Employee Modal (P0)

Objetivo:

- partir `new-employee-modal.tsx` en piezas cohesivas.

Implementacion:

1. Subcomponentes de tabs (`account`, `permissions`, `documents`, `contract`).
2. Hook `useEmployeeModalState` para estado y validaciones.
3. Hook `useEmployeeDocumentReview` para review/signature/upload.
4. Contratos de props tipados desde `modules/employees/contracts`.

Exit criteria:

- `new-employee-modal.tsx` <= 1200 lineas.
- cada seccion con responsabilidad unica.

### Fase 3 - Tipos compartidos y contratos (P1)

Objetivo:

- eliminar duplicacion de tipos de opcion/scope.

Implementacion:

1. Crear `shared/contracts/scope-options.ts` con tipos canonicos:
   - `BranchOption`, `DepartmentOption`, `PositionOption`, `UserOption`.
2. Migrar imports en `announcements`, `checklists`, `documents`, `employees`.
3. Crear `shared/contracts/api-errors.ts` para shape de errores.

Exit criteria:

- 0 redefiniciones locales de tipos canonicos en modulos migrados.

### Fase 4 - Hardening y pruebas (P1/P2)

Objetivo:

- asegurar que modularizacion no rompa reglas de permisos y ownership.

Implementacion:

1. Tests de contrato API para:
   - create/edit/delete delegated per module,
   - ownership enforcement,
   - `company_admin` bypass.
2. Tests de integracion de UI minima para:
   - apertura modales compartidos,
   - transicion tabs,
   - errores visibles y success paths.
3. Gate de CI para build + test set minimo.

Exit criteria:

- build verde + suite minima verde,
- checklist de regresion aprobado.

## Checklist operativo

- [ ] Baseline de lineas y contratos generado.
- [ ] `company/employees/route.ts` dividido en servicios.
- [ ] `new-employee-modal.tsx` dividido en secciones + hooks.
- [ ] Tipos de opciones/scope consolidados en shared contracts.
- [ ] API error shape estandarizado.
- [ ] Tests de permisos delegados y ownership en CI.
- [ ] Documentacion actualizada en `DOCUMENTACION_TECNICA.md`.

## Indicadores de exito (KPIs)

1. Reduccion de hotspots:
   - `company/employees/route.ts`: 2492 -> <= 1200
   - `new-employee-modal.tsx`: 2361 -> <= 1200
2. Reduccion de tipos duplicados de opcion/scope a 0 en modulos objetivo.
3. 0 regresiones de permisos delegados en smoke/regression suite.
4. Tiempo de cambio en flujos employee/company menor (medido por PR size y review churn).

## Riesgos y mitigacion

Riesgo 1: regresion de autorizacion.

- Mitigacion: tests de contrato + feature flags por bloque.

Riesgo 2: refactor muy grande en un solo PR.

- Mitigacion: PRs pequenos por fase y por dominio.

Riesgo 3: drift entre docs y codigo.

- Mitigacion: regla de cierre: no cerrar fase sin actualizar docs + evidencia CLI.

## Regla de implementacion

Toda ejecucion de este plan debe seguir `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_CLI_OBLIGATORIA.md`:

- DB por Supabase CLI,
- deploy/entornos por Vercel CLI,
- flujo repo/PR/checks por GitHub CLI.

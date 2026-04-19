# Auditoria Arquitectura y Modularizacion (2026-04-19)

## Objetivo

Hacer una ultima pasada de auditoria tecnica para detectar oportunidades de mejora de arquitectura, modularizacion, mantenibilidad y escalabilidad.

Alcance revisado:

- `web/src` (front + api routes + shared libs)
- enfasis en `employees`, `checklists`, `documents`, `access`

## Hallazgos ejecutivos

1. Hay avances fuertes de modularizacion, pero todavia existen archivos monoliticos que concentran demasiada responsabilidad.
2. Existen tipos de UI repetidos en multiples modulos (`BranchOption`, `UserOption`, etc.) que deberian consolidarse.
3. Hay rutas API con logica transversal mezclada (validacion, permisos, persistencia, side-effects, auditoria) en un solo archivo.
4. El patron de ownership/permisos delegados esta bien encaminado, pero debe terminar de estandarizarse en helpers de dominio para evitar drift.
5. Falta una capa estable de hooks reutilizables para estado complejo de cliente en algunos workspaces grandes.

## Evidencia objetiva (tamano de archivos)

Top de archivos grandes en `web/src` (lineas aprox):

- `web/src/app/api/company/employees/route.ts` -> 2492
- `web/src/shared/ui/company-shell.tsx` -> 2467
- `web/src/modules/employees/ui/new-employee-modal.tsx` -> 2361
- `web/src/modules/documents/ui/documents-tree-workspace.tsx` -> 1166
- `web/src/shared/lib/access.ts` -> 688
- `web/src/app/(employee)/portal/layout.tsx` -> 669

Interpretacion:

- >1200 lineas en un solo archivo suele ser señal de demasiadas responsabilidades.
- Archivos criticos de acceso/permisos (`access.ts`, routes de company) necesitan separacion por capas para bajar riesgo de regresiones.

## Hallazgos por area

### A) Frontend Workspaces y Modals

Estado actual:

- Se avanzo bien en extraccion de modales y acciones en `documents`.
- `checklists` employee ya separo tabs y seccion de creados.
- `employees/new-employee-modal` sigue siendo el mayor hotspot de UI.

Riesgo:

- costo alto para modificar flujos de alta/edicion de empleados,
- testing manual pesado,
- alta chance de side effects por cambios locales.

### B) API Routes (Server)

Estado actual:

- `company/employees/route.ts` concentra parseo, negocio, persistencia, sincronizacion de permisos, flujo de cuenta, y manejo de errores.
- Rutas employee (`announcements/manage`, `checklists/templates`, `documents/manage`) ya estan separadas por modulo, pero aun con utilidades repetidas de scope/context.

Riesgo:

- reglas de negocio duplicadas,
- divergencia entre company y employee,
- dificultad para pruebas unitarias finas.

### C) Tipado y contratos

Estado actual:

- hay multiples definiciones locales de `BranchOption`, `DepartmentOption`, `UserOption` en varios componentes.

Riesgo:

- drift de tipos,
- bug silencioso en props,
- mayor friccion al refactor.

### D) Capa de acceso/permisos

Estado actual:

- se incorporo bien `employee-module-permissions` + enforcement por capability + ownership.
- el archivo `shared/lib/access.ts` sigue creciendo y mezcla reglas de muchos contextos.

Riesgo:

- acoplamiento alto,
- regresiones de autorizacion al tocar reglas de otro rol/contexto.

## Oportunidades de mejora priorizadas

Prioridad P0 (impacto alto / riesgo alto):

1. Desarmar `company/employees/route.ts` en handlers + servicios de dominio.
2. Desarmar `new-employee-modal.tsx` en secciones y hooks de estado.
3. Definir catalogo unico de tipos UI compartidos para scopes/opciones.

Prioridad P1 (impacto alto / riesgo medio):

4. Extraer capa `permissions-domain` para ownership/capabilities reusable por rutas.
5. Estandarizar respuestas de API y manejo de errores (shape unico).
6. Consolidar hooks de workspaces complejos (`documents`, `checklists`, `employees`).

Prioridad P2 (impacto medio):

7. Reducir tamano de `company-shell.tsx` y `portal/layout.tsx` con subcomponentes + hooks.
8. Crear bateria minima de tests de contrato para rutas criticas de permisos delegados.

## Principios de arquitectura recomendados

1. Vertical slice por dominio: `module/ui`, `module/hooks`, `module/services`, `module/contracts`.
2. Routes delgadas: parsean input, llaman servicio de dominio, devuelven respuesta.
3. Dominio reusable: reglas de negocio sin dependencia de UI.
4. Tipos compartidos en un solo lugar por bounded context.
5. Estados complejos encapsulados en hooks reutilizables.

## Criterio de cierre de esta auditoria

La auditoria queda cerrada con:

- este documento de hallazgos,
- plan de implementacion senior enlazado en `DOCS/2_Planes_y_Checklists`.

# GUIA DE SEPARACION: DOCUMENTOS LABORALES VS OPERATIVOS

## Objetivo

Evitar cruces entre dos dominios de documentos que comparten tabla fisica (`documents`) pero tienen flujos distintos.

## Definiciones canonicas

- **Documentos laborales (RRHH)**
  - Se crean y gestionan desde los modales de empleado.
  - Siempre tienen vinculo en `employee_documents`.
  - No se administran desde la pagina `/app/documents`.

- **Documentos operativos**
  - Se crean y gestionan desde la pagina de Documentos (`/app/documents`).
  - No tienen vinculo en `employee_documents`.
  - Son visibles en `/app/documents` (empresa) y `/portal/documents` (empleado) segun alcance.

## Matriz oficial de comportamiento

1. **Empleado sube documento en modal de perfil**
   - Endpoint: `web/src/app/api/employee/profile/documents/route.ts`
   - Resultado: documento laboral (con link en `employee_documents`).
   - Debe verse en modales de empleado/empresa (flujo RRHH), no en `/app/documents`.

2. **Empresa sube documento a empleado desde modal**
   - Endpoint: `web/src/app/api/company/employees/documents/upload/route.ts`
   - Resultado: documento laboral (con link en `employee_documents`).
   - Debe verse en modales de empleado/empresa (flujo RRHH), no en `/app/documents`.

3. **Empresa sube documento en pagina Documentos**
   - Endpoint: `web/src/app/api/company/documents/route.ts` (POST)
   - Resultado: documento operativo.
   - Debe verse en `/app/documents` y en `/portal/documents` segun scope.

## Reglas tecnicas obligatorias

- **Empresa `/app/documents`** debe excluir documentos de dominio laboral usando `getEmployeeDocumentIdSet(...)`.
  - Referencia: `web/src/app/(company)/app/documents/page.tsx`
- **Portal empleado `/portal/documents`** debe excluir documentos del dominio laboral (links en `employee_documents`).
  - Referencia: `web/src/app/(employee)/portal/documents/page.tsx`
- **No usar heuristicas de UI como unica barrera** (ejemplo: prefijos de titulo). La frontera principal es el link en `employee_documents`.

## Invariantes para PR/revision

- Si un cambio toca `employee_documents`, revisar impacto en:
  - `web/src/app/(company)/app/documents/page.tsx`
  - `web/src/app/(employee)/portal/documents/page.tsx`
  - `web/src/app/api/company/documents/route.ts`
- Si un cambio toca `/app/documents`, confirmar que no rompa el aislamiento de RRHH.
- Si un cambio toca modales de empleado, confirmar que no contamine Documentos operativos.

## Checklist QA rapido

1. Empleado sube en modal -> visible en modales RRHH, ausente en `/app/documents`.
2. Empresa sube al empleado en modal -> visible en modales RRHH, ausente en `/app/documents`.
3. Empresa sube operativo en `/app/documents` -> visible en `/app/documents` y en `/portal/documents` (si scope permite).
4. Empleado sin alcance no ve operativo en `/portal/documents`.

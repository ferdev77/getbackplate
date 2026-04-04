# Modal Fluency Master Plan

Objetivo: que todos los modales de `empresa`, `empleado` y `superadmin` abran instantaneo (UI-first), con datos frescos en segundo plano y sin degradar costos/latencia.

## North Star UX

- `click -> modal visible`: < 100ms
- `click -> formulario utilizable`: < 500ms en red normal
- nunca bloquear apertura por fetch si hay cache local vigente
- errores de refresh no cierran modal si hay datos cacheados

## Patron tecnico unico (obligatorio)

1. **UI-first open**
   - el modal se abre al instante con estado local.
2. **Catalog cache en cliente**
   - cache por `scope + modalKey + tenantId (+ userId si aplica)`.
3. **Prefetch silencioso**
   - al entrar al shell/pagina correspondiente.
4. **Revalidacion inteligente**
   - al abrir, solo si TTL vencio.
5. **Fallback seguro**
   - si revalidacion falla, usar cache existente.
6. **Payload minimo**
   - endpoints de catalogo solo devuelven lo necesario para abrir modal.

## Politica de cache/TTL

- catálogos estables (branches/departments/positions/roles): `60s`
- catálogos semi-volatiles (usuarios activos): `30s`
- detalles de edicion por id: `0s` (sin cache fuerte, pero con apertura optimista)
- invalidacion local inmediata al crear/editar entidades relacionadas

## Endpoints de catalogo (convencion)

- `GET /api/company/<modulo>?catalog=<modal_key>`
- `GET /api/employee/<modulo>?catalog=<modal_key>`
- `GET /api/superadmin/<modulo>?catalog=<modal_key>`

Respuesta base sugerida:

```ts
type ModalCatalogResponse<T> = {
  ok: true;
  version: string;
  fetchedAt: string;
  data: T;
};
```

## Inventario y rollout pagina por pagina

### Company (`/app/*`)

1. `app/announcements` - `Nuevo Aviso`
   - Estado: **implementado** (UI-first + prefetch + TTL + revalidate).
2. `app/documents` - `Crear Carpeta`, `Subir Archivo`
   - Catalogos: folders, branches, departments, positions, users, recientes.
   - Accion: mover apertura de sidebar a quick-action local con cache.
3. `app/employees` - `Nuevo Usuario/Empleado`
   - Catalogos: branches, departments, positions, publisher/company context.
   - Accion: quick-action local desde shell + revalidate TTL.
4. `app/users` - `Nuevo Administrador`
   - Catalogos: branches + roleOptions.
   - Accion: quick-action local desde shell + revalidate TTL.
5. `app/checklists` - `Nuevo Checklist`
   - Catalogos: branches, departments, positions, users.
   - Accion: reemplazar flujo por query `new` con quick modal local para create.

### Employee (`/portal/*`)

1. `portal/home` - `EmployeeWelcomeModal`
   - Accion: asegurar apertura local sin espera de datos; prefetch de recursos de onboarding.
2. `portal/checklist` - `EmployeeChecklistPreviewModal`
   - Accion: lazy payload por checklist + cache corto para previews consecutivos.

### Superadmin (`/superadmin/*`)

1. `superadmin/organizations` - `create/view/edit/delete`
   - Estado actual: modal via query param (`?action=`) con rerender server.
   - Accion: migrar a workspace cliente UI-first (manteniendo server actions).
   - Datos: organizations, plans, modules, limits, usage, admin emails.
   - Estrategia: abrir instantaneo con snapshot inicial + refresh diferencial por org al abrir.
2. `superadmin/plans` - `Nuevo Plan`, `Editar Plan`, `Eliminar Plan`
   - Estado actual: modal con `details`, ya UI-first local.
   - Accion: estandarizar cache de catalogo de modulos y evitar recalculos costosos.

## Orden de ejecucion recomendado (un solo ciclo)

1. **Infra comun**
   - util/hook compartido para cache TTL + prefetch + revalidate.
   - contrato unico de endpoints de catalogo.
2. **Company quick-actions**
   - documents, employees, users, checklists.
3. **Employee optimizations**
   - onboarding/checklist preview.
4. **Superadmin organizations migration**
   - pasar de query-driven server modal a client workspace modal.
5. **Hardening**
   - metricas de apertura, telemetria de cache hit/miss, ajuste fino de TTL.

## Reglas de calidad

- no romper permisos por rol ni module gating.
- no duplicar consultas pesadas entre page + modal endpoint.
- evitar traer listas completas cuando modal solo requiere subset.
- mantener cierre de modal sin navegacion forzada cuando se abre como quick-action.

## KPIs de aceptacion

- cache-hit ratio por modal > 70% en navegacion normal.
- reduccion de `navigation-to-modal-ready` >= 40% en rutas con modal.
- cero regresiones en server actions (create/update/delete).

## Riesgos y mitigaciones

- **Riesgo**: datos stale visibles en modal.
  - **Mitigacion**: TTL corto + refresh al abrir + invalidacion tras mutaciones.
- **Riesgo**: sobrecarga por prefetch masivo.
  - **Mitigacion**: prefetch escalonado y solo para modulos habilitados.
- **Riesgo**: inconsistencias entre vistas antiguas y quick-actions.
  - **Mitigacion**: feature-flag por modal durante rollout.

## Estado actual del repo

- Company `Nuevo Aviso`: listo con quick-open, prefetch y TTL.
- Siguiente bloque prioritario para llevar todo a nivel pro: `documents -> employees -> users -> checklists -> superadmin/organizations`.

# Checklist tecnico de implementacion - Asignacion real de modulos

## Objetivo
Implementar control real de modulos por tenant en empresa y empleado, con enforcement en UI, rutas y backend.

## Matriz base de modulos
- Core (no apagables): `company_portal`, `employee_portal`, `dashboard`, `settings`, `employees`.
- Comerciales (apagables): `documents`, `announcements`, `checklists`, `reports`, `onboarding`.

## Commit 1 - Infra de modulos (base unificada)
- Estado: completado.
- Crear/ajustar helpers en `web/src/shared/lib/access.ts`:
  - `requireTenantModule(moduleCode)` para paginas/server actions.
  - `assertTenantModuleApi(moduleCode)` para API routes (respuesta tipada para `403`).
- Estandarizar error: `module_disabled_for_tenant`.
- Agregar util de resolucion de modulos por tenant para evitar logica duplicada.

## Commit 2 - Hardening de APIs (enforcement real)
- Estado: completado.
- Aplicar `assertTenantModuleApi(...)` en:
  - `web/src/app/api/company/settings/route.ts` -> `settings`.
  - `web/src/app/api/company/feedback/route.ts` -> `settings`.
  - `web/src/app/api/company/employees/route.ts` (POST/PATCH/DELETE) -> `employees`.
  - `web/src/app/api/company/users/route.ts` -> `employees`.
  - `web/src/app/api/employee/checklists/submit/route.ts` -> `checklists`.
- Eliminar checks manuales redundantes de `is_module_enabled`.

## Commit 3 - Navegacion dinamica company + employee
- Estado: completado.
- `web/src/app/(company)/app/layout.tsx`: cargar modulos activos y pasarlos al shell.
- `web/src/shared/ui/company-shell.tsx`: ocultar secciones/items de modulos OFF.
- `web/src/app/(employee)/portal/layout.tsx`: exponer flags por modulo (`documents`, `checklists`, `announcements`, `onboarding`).
- `web/src/shared/ui/employee-shell.tsx`: tabs condicionales por modulo activo.

## Commit 4 - Bloqueo de URL directa en paginas
- Estado: completado.
- Verificar/aniadir `requireTenantModule(...)` en:
  - `/app/documents`, `/app/announcements`, `/app/checklists`, `/app/reports`.
  - `/portal/documents`, `/portal/checklist`, `/portal/onboarding`.
- En `/portal/home`, fallback limpio cuando `announcements` este OFF.

## Commit 5 - Core no desactivable (app + DB)
- Estado: completado.
- `web/src/modules/organizations/actions.ts`:
  - Impedir desactivar modulos `is_core=true`.
- `web/src/app/(superadmin)/superadmin/organizations/page.tsx`:
  - Mostrar core como bloqueado/no toggle.
- Nueva migracion en `supabase/migrations/`:
  - Trigger/guard para rechazar `is_enabled=false` si `module_catalog.is_core=true`.

## Commit 6 - Auditoria + smoke tests
- Estado: completado.
- Registrar `module.access_denied` en denegaciones relevantes.
- Smoke tests por modulo OFF:
  - Menu oculto.
  - URL directa bloqueada.
  - API devuelve `403 module_disabled_for_tenant`.
  - Sin fuga de datos.
- Validacion final:
  - `npm run lint`
  - `npm run build`
  - tests del proyecto (si aplica)

## Mensajes de commit sugeridos
- `feat(access): unify tenant module guards for pages and APIs`
- `fix(api): enforce module access across company and employee endpoints`
- `feat(ui): hide company and employee navigation by enabled modules`
- `fix(routing): block direct access to disabled module routes`
- `feat(superadmin): prevent disabling core modules in app and DB`
- `chore(observability): audit module access denials and add smoke checks`

## Pendiente futuro (producto)
- Agregar opcion en edicion de organizacion para cambio de plan:
  - `Sincronizar modulos con plan` (default recomendado: activado).
  - Si esta activado: al cambiar plan se fuerza `organization_modules = modulos del plan + core`.
  - Si esta desactivado: al cambiar plan se mantienen overrides manuales de modulos del tenant.
- Definir alcance UX:
  - Mostrar advertencia de impacto antes de guardar cuando la sincronizacion este activada.
  - Guardar en auditoria el modo elegido (`forced_sync` vs `preserve_overrides`).

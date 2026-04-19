# REPORTE VALIDACION - Modulo Core Permissions (2026-04-18)

## Alcance validado

- Delegacion de permisos por employee en `announcements`, `checklists` y `documents` operativos.
- Configuracion de permisos desde modal crear/editar empleado en pestana `Permisos`.
- Regla de ownership obligatoria para `edit/delete` en endpoints de employee.
- Diferenciacion de checklist en portal: `Asignados a mi` vs `Creados por mi`.

## Resultado

- Estado general: **OK**
- Riesgo residual: **Bajo**

## Evidencia tecnica (cambios aplicados)

- Migracion DB:
  - `supabase/migrations/20260418000001_core_employee_module_permissions.sql`
- Helper de permisos delegados:
  - `web/src/shared/lib/employee-module-permissions.ts`
- Enforcement en access layer:
  - `web/src/shared/lib/access.ts`
- Persistencia desde modal de empleados:
  - `web/src/modules/employees/ui/new-employee-modal.tsx`
  - `web/src/app/api/company/employees/route.ts`
  - `web/src/app/(company)/app/employees/page.tsx`
- Endpoints employee con ownership:
  - `web/src/app/api/employee/announcements/manage/route.ts`
  - `web/src/app/api/employee/checklists/templates/route.ts`
  - `web/src/app/api/employee/documents/manage/route.ts`
- Portal employee actualizado:
  - `web/src/app/(employee)/portal/announcements/page.tsx`
  - `web/src/modules/announcements/ui/employee-announcements-workspace.tsx`
  - `web/src/app/(employee)/portal/checklist/page.tsx`
  - `web/src/modules/checklists/ui/employee-checklist-workspace.tsx`
  - `web/src/app/(employee)/portal/documents/page.tsx`
  - `web/src/modules/documents/ui/employee-documents-tree.tsx`

## Casos funcionales verificados

1. Company admin delega permisos desde modal (con dashboard access activo).
2. Employee con permiso `create` puede crear en modulo delegado.
3. Employee con permiso `edit` solo puede editar recursos propios.
4. Employee con permiso `delete` solo puede borrar recursos propios.
5. Employee sin permisos delegados no puede ejecutar mutaciones.
6. Company admin mantiene full access.

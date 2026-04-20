# Matriz de Cobertura Realtime

Fecha: 2026-04-19
Proyecto: GetBackplate

Este documento audita que pantallas escuchan cambios en tiempo real y por que via lo hacen.

## 1) Listeners activos (inventario)

- `web/src/shared/ui/global-realtime.tsx`
  - Listener global de fallback (`postgres_changes` en `public`).
  - Se monta en `web/src/app/layout.tsx`.

- `web/src/shared/ui/company-shell.tsx`
  - Listener scoped por tenant (`organization_id`) para modulo empresa.
  - Cubre cambios de anuncios, checklists, documentos, empleados, membresias, perfiles, estructura y modulos.
  - Optimizado por ruta activa: se suscribe solo a tablas del modulo visible.

- `web/src/shared/ui/employee-shell.tsx`
  - Listener scoped por tenant/usuario para portal empleado.
  - Cubre anuncios, audiencias de avisos, documentos, carpetas, templates, jobs, modulos, submissions propias, perfil empleado y preferencias.
  - Optimizado por ruta activa: reduce refrescos cuando el modulo no esta visible.
  - Temporalmente incluye fallback de `router.refresh()` periodico cada 8s en rutas criticas del portal empleado.

- `web/src/shared/ui/superadmin-realtime-listener.tsx`
  - Listener dedicado para superadmin.
  - Cubre organizaciones, planes, catalogo de modulos, modulos por organizacion, limites, plan_modules, feedback y datos operativos globales.

- `web/src/modules/reports/ui/checklist-reports-dashboard.tsx`
  - Listener especifico para reportes de checklist (submissions, items, flags, comments, attachments).

- `web/src/modules/checklists/ui/employee-checklist-realtime-refresh.tsx`
  - Listener especifico para checklist empleado (templates, submissions propias, scheduled jobs).
  - Integrado en `web/src/app/(employee)/portal/checklist/page.tsx`.

- `web/src/modules/documents/ui/documents-tree-workspace.tsx`
  - Listener especifico de documentos empresa (documents, document_folders).

## 2) Matriz por pantalla

| Grupo | Pantalla | Cobertura realtime actual | Estado |
|---|---|---|---|
| Empresa | `/app/dashboard` | `company-shell` (tenant-scoped) | OK |
| Empresa | `/app/dashboard/location` | `company-shell` (tenant-scoped) | OK |
| Empresa | `/app/announcements` | `company-shell` (tenant-scoped) | OK |
| Empresa | `/app/checklists` | `company-shell` (tenant-scoped) | OK |
| Empresa | `/app/checklists/new` | `company-shell` (tenant-scoped) | OK |
| Empresa | `/app/reports` | `company-shell` + listener especifico de reportes | OK |
| Empresa | `/app/documents` | `company-shell` + listener especifico de documentos | OK |
| Empresa | `/app/employees` | `company-shell` (tenant-scoped) | OK |
| Empresa | `/app/users` | `company-shell` (tenant-scoped) | OK |
| Empresa | `/app/settings` | `company-shell` (tenant-scoped) | OK |
| Empresa | `/app/trash` | `company-shell` (tenant-scoped) | OK |
| Empleado | `/portal/home` | `employee-shell` (tenant/usuario scoped) + fallback 8s temporal | OK (temporal) |
| Empleado | `/portal/announcements` | `employee-shell` (tenant/usuario scoped) + fallback 8s temporal | OK (temporal) |
| Empleado | `/portal/checklist` | `employee-shell` + listener especifico checklist | OK |
| Empleado | `/portal/documents` | `employee-shell` (tenant/usuario scoped) + fallback 8s temporal | OK (temporal) |
| Empleado | `/portal/onboarding` | `employee-shell` (tenant/usuario scoped) | OK |
| Superadmin | `/superadmin/*` | listener dedicado superadmin + fallback global | OK |

## 3) Conclusiones

- Si, hoy las pantallas criticas de checklist/reportes ya quedan con realtime efectivo.
- En empresa, la cobertura es fuerte: shell scoped + listeners especificos en modulos pesados.
- En empleado, checklist tiene listener dedicado y el shell quedo scoped por tenant/usuario.
- Superadmin ya no depende solo del fallback global: tiene listener dedicado por dominio.
- Empresa y empleado ya aplican estrategia de ruta activa para bajar ruido de eventos.
- Se detecto incidente real en portal empleado donde avisos no reflejaban cambios hasta F5.
- Causa raiz de DB: policy `announcement_audiences_tenant_select` validaba branch solo por `memberships.branch_id` y no por `employees.branch_id`.
- Fix aplicado en ambas DB con migracion `supabase/migrations/20260419000200_fix_announcement_audiences_branch_policy.sql`.
- Mitigacion temporal vigente: polling de 8s en rutas criticas de portal empleado mientras se estabiliza el canal realtime end-to-end.

## 4) Recomendacion tecnica (siguiente iteracion)

Para seguir mejorando eficiencia y evitar refresh redundante:

1. Instrumentar estado de canal (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, reconexiones) y persistir trazas por ruta.
2. Remover polling permanente de 8s y dejar fallback solo condicional a error/no-suscripcion sostenida.
3. Ajustar listeners de modulos internos para refrescar estado local antes de `router.refresh` cuando sea posible.
4. Agregar metricas de frecuencia de refresh por ruta para detectar ruido residual.
5. Mantener `global-realtime` como fallback de seguridad, no como mecanismo principal.

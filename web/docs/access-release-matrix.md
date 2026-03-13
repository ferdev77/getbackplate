# Access Matrix and Release Criteria

Documento operativo para gobierno de accesos y publicacion segura.

## 1) Matriz de rutas protegidas

### Superadmin

| Ruta | Guardia | Rol requerido | Modulo requerido |
| --- | --- | --- | --- |
| `/superadmin/*` | `requireSuperadmin()` | `superadmin` | no aplica |

### Panel empresa (admin/manager)

| Ruta | Guardia | Roles permitidos | Modulo requerido |
| --- | --- | --- | --- |
| `/app/dashboard` | `requireTenantContext()` + layout `requireCompanyAccess()` | `company_admin`, `manager` | no |
| `/app/employees` | `requireTenantContext()` + layout `requireCompanyAccess()` | `company_admin`, `manager` | no (recomendado: `employees`) |
| `/app/settings` | `requireTenantContext()` + layout `requireCompanyAccess()` | `company_admin`, `manager` | parcial (acciones usan `settings`) |
| `/app/documents` | `requireTenantModule("documents")` + layout `requireCompanyAccess()` | `company_admin`, `manager` | `documents` |
| `/app/announcements` | `requireTenantModule("announcements")` + layout `requireCompanyAccess()` | `company_admin`, `manager` | `announcements` |
| `/app/checklists` | `requireTenantModule("checklists")` + layout `requireCompanyAccess()` | `company_admin`, `manager` | `checklists` |
| `/app/reports` | `requireTenantModule("reports")` + layout `requireCompanyAccess()` | `company_admin`, `manager` | `reports` |

### Portal empleado

| Ruta | Guardia | Rol requerido | Modulo requerido |
| --- | --- | --- | --- |
| `/portal/*` | `requireEmployeeAccess()` | `employee` | no (RLS y reglas por feature) |

## 2) Matriz de acciones por modulo (server actions)

| Modulo | Archivo principal | Guardia de modulo |
| --- | --- | --- |
| organizations (superadmin) | `src/modules/organizations/actions.ts` | `requireSuperadmin()` |
| plans (superadmin) | `src/modules/plans/actions.ts` | `requireSuperadmin()` |
| modules catalog (superadmin) | `src/modules/modules-catalog/actions.ts` | `requireSuperadmin()` |
| employees | `src/modules/employees/actions.ts` | `requireTenantContext()` |
| onboarding | `src/modules/onboarding/actions.ts` | `requireTenantContext()` |
| documents | `src/modules/documents/actions.ts` | `requireTenantModule("documents")` |
| announcements | `src/modules/announcements/actions.ts` | `requireTenantModule("announcements")` |
| checklists | `src/modules/checklists/actions.ts` | `requireTenantModule("checklists")` |
| settings/feedback | `src/modules/settings/actions.ts` | mixto (`requireTenantModule("settings")` + `requireTenantContext()`) |

## 3) Gaps detectados (a resolver)

- En `employees` y `onboarding` falta enforcement por `requireTenantModule("employees")` y/o `requireTenantModule("onboarding")` para consistencia comercial.
- En `settings` hay acciones bajo `requireTenantContext()` sin guardia de modulo; conviene unificar criterio.
- En rutas que hoy no exigen modulo, el layout ya limita por rol (`company_admin/manager`), pero falta consistencia total con feature flags.

## 4) Criterio de release publicable (A4)

Un release es publicable solo si cumple todo:

1. **Seguridad**: sin regresiones de RLS, sin acceso cruzado entre tenants, sin endpoints criticos abiertos sin rol.
2. **Permisos**: cada accion write valida rol + tenant + modulo activo cuando corresponda.
3. **Calidad funcional**: smoke test verde en rutas clave (`/superadmin/dashboard`, `/app/dashboard`, `/app/documents`, `/app/checklists`, `/portal/home`).
4. **Datos reales**: vistas operativas sin mocks hardcodeados.
5. **Observabilidad minima**: errores capturados con contexto de tenant y accion.
6. **Documentacion**: estado de modulos y cambios relevantes actualizados en docs.

## 5) Checklist rapido pre-release

- [ ] Migraciones SQL aplicadas y verificadas.
- [ ] Lint/build sin errores.
- [ ] Pruebas de acceso por rol ejecutadas.
- [ ] Prueba de aislamiento A/B (tenant cruzado) ejecutada.
- [ ] Validacion manual de rutas principales.
- [ ] Documentacion sincronizada.

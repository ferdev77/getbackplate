# Estructura del Proyecto (base recomendada)

Este documento define como se organiza el codigo en Next.js.

Implementacion actual: `web/src/`.

## Objetivo

Separar bien UI, casos de uso, dominio e infraestructura para que el sistema sea:

- mantenible
- seguro
- escalable
- facil de extender por modulos

## Arbol base recomendado

```txt
web/src/
  app/
    (superadmin)/
      superadmin/
        dashboard/
        organizations/
        modules/
        plans/
    (company)/
      app/
        dashboard/
        employees/
        documents/
        announcements/
        checklists/
        reports/
        settings/
    (employee)/
      portal/
        home/
        onboarding/
        documents/
        checklist/
    api/
      health/
      webhooks/
    auth/
      login/
      callback/

  modules/
    auth/
    organizations/
      services/            # invitation.service.ts, organization.service.ts
    branches/
    memberships/
    modules-catalog/
    employees/
      services.ts          # data-fetching con React.cache
    onboarding/
    documents/
    announcements/
      services/            # deliveries.ts
    checklists/
      services/            # checklist-audience.service.ts, checklist-template.service.ts
    reports/
    audit/
    settings/
      services/            # org-structure.service.ts

  shared/
    ui/
    lib/
    validation/
    types/
    constants/

  infrastructure/
    supabase/
      client/
      repositories/
      mappers/

  application/
    use-cases/

  domain/
    entities/
    services/
    value-objects/
```

## Reglas de implementacion

1. No mezclar queries SQL directo en componentes de UI.
2. Toda validacion sensible va en backend (route handlers/server actions).
3. Toda operacion debe pasar por contexto tenant (`organization_id`).
4. Modulos activados/desactivados deben validar en backend.
5. Politicas RLS son obligatorias y siempre activas en tablas tenant.
6. La logica de negocio pesada va en `services/` del modulo, no en `actions.ts`.

## Patron de servicios por modulo

Los `actions.ts` de cada modulo actuan como **controllers finos**: parsean FormData, validan auth/permisos, llaman al servicio, hacen audit y redirect.

La logica de dominio vive en `services/{dominio}.service.ts`:

- Reciben dependencias inyectadas (supabase client, organizationId).
- Retornan discriminated unions (`{ ok: true } | { ok: false; message }`).
- No usan `"use server"`, no hacen `redirect()`, no hacen `revalidatePath()`.
- Son testeables de forma aislada.

## Rutas objetivo iniciales

### Superadmin

- `/superadmin/dashboard`
- `/superadmin/organizations`
- `/superadmin/modules`
- `/superadmin/plans`

### Empresa (admin/manager)

- `/app/dashboard`
- `/app/employees`
- `/app/documents`
- `/app/announcements`
- `/app/checklists`
- `/app/reports`

### Empleado

- `/portal/home`
- `/portal/onboarding`
- `/portal/documents`
- `/portal/checklist`

## Convenciones

- `kebab-case` para carpetas.
- `PascalCase` para componentes React.
- `camelCase` para funciones y variables.
- `zod` para validaciones de entrada en backend.
- Tipos de dominio centralizados en `src/shared/types`.

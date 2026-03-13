# Plan de Ejecucion - Fase 1

## Objetivo

Levantar nucleo SaaS multi-tenant funcional con seguridad real.

## Sprint tecnico propuesto

1. Scaffold de Next.js + TypeScript + Tailwind.
2. Configuracion Supabase client/server.
3. Auth base (login/logout/callback).
4. Resolver contexto tenant desde membership.
5. Middleware de proteccion por rol.
6. Primeras pantallas:
   - superadmin dashboard
   - listado de empresas
   - panel empresa dashboard
7. Modulo empresas + sucursales (CRUD basico).
8. Modulo empleados (listado + alta).
9. Guardas por modulo activo (`organization_modules`).
10. Auditoria minima en acciones clave.

## Criterios de aceptacion fase 1

- login funcional con Supabase Auth
- separacion de panel superadmin vs empresa
- empresa aislada por `organization_id`
- no existe lectura cruzada entre tenants
- modulo empleados usable por empresa
- base lista para onboarding/documentos/anuncios

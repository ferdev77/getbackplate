# Web App (Next.js)

Aplicacion principal del proyecto SaaS multi-tenant.

Este README cubre solo la app `web/`; para alcance global del repositorio y entrega tecnica ver `../README.md`.

## Requisitos

- Node.js 20+
- npm

## Variables de entorno

1. Copia `.env.example` a `.env.local`
2. Completa:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`

## Comandos

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Estructura clave

- `src/app/` rutas por contexto (superadmin, empresa, empleado)
- `src/modules/` modulos del dominio
- `src/infrastructure/supabase/` clientes y repositorios
- `src/shared/` utilidades, tipos, UI comun

## Estandar UI actual (obligatorio)

Tomar como referencia interna el estilo aplicado en:

- `/superadmin/plans`
- `/superadmin/organizations`
- `/superadmin/modules`

Patrones obligatorios:

- tarjetas de resumen
- bloques de alta desplegables
- tarjetas desplegables por entidad
- iconos consistentes
- feedback de exito/error
- confirmacion para acciones destructivas
- responsive completo

## Rutas base disponibles

- `/auth/login`
- `/superadmin/dashboard`
- `/superadmin/organizations`
- `/app/dashboard`
- `/app/employees`
- `/portal/home`

## Verificar conexion con Supabase

Con variables cargadas, puedes probar:

- `/api/health/supabase`

Si responde `ok: true`, la app ya esta conectada.

## Notas

- La base SQL y RLS esta en `../supabase/migrations/`.
- El seed inicial esta en `../supabase/seed.sql`.

## Entornos Supabase

- `Produccion`: `Getbackplate` (`mfhyemwypuzsqjqxtbjf`) - `https://mfhyemwypuzsqjqxtbjf.supabase.co`
- `Desarrollo`: `Getbackplate Dev` (`uubdslmtfxwraszinpao`) - `https://uubdslmtfxwraszinpao.supabase.co`

Regla operativa:

- `.env.local` y pruebas locales deben apuntar a `Getbackplate Dev`.
- Scripts de debug, seed y limpieza no deben ejecutarse contra `Produccion`.

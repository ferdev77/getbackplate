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

## Validacion de flujos DB (obligatorio en operaciones)

Comandos canonicos:

```bash
npm run verify:flow:local
npm run verify:flow:local:cleanup
npm run verify:flow:prod:cleanup
```

Guia completa:
- `../DOCS/4_Operaciones_y_Guias/GUIA_VALIDACION_FLUJOS_LOCAL_PROD.md`

## Estructura clave

- `src/app/` rutas por contexto (superadmin, empresa, empleado)
- `src/modules/` modulos del dominio
- `src/infrastructure/supabase/` clientes y repositorios
- `src/shared/` utilidades, tipos, UI comun

## Layout de contenido unificado (obligatorio)

Para cualquier pagina nueva de `company`, `employee` o `superadmin`, usar `PageContent`:

- Componente base: `src/shared/ui/page-content.tsx`
- Tokens globales de layout: `src/app/globals.css` (`--gbp-content-*`)

Regla de uso:

- `default`: vistas operativas estandar (tablas, listados, dashboard)
- `roomy`: vistas con bloques grandes o formularios extensos
- `shell`: contenedores de shell/layout (wrappers superiores)
- `none`: cuando solo necesitas centrado horizontal sin padding vertical

Ejemplos canonicos:

```tsx
<PageContent>
  ...contenido...
</PageContent>

<PageContent spacing="roomy" className="flex flex-col gap-6">
  ...contenido...
</PageContent>

<PageContent as="section" spacing="none" className="pt-6">
  ...contenido...
</PageContent>
```

No permitido en paginas nuevas:

- repetir clases manuales de layout como `mx-auto w-full max-w-7xl px-... py-...`
- hardcodear anchos/paddings de contenedor si ya los cubre `PageContent`

Si hay que cambiar el layout global del producto, modificar solo:

- `src/shared/ui/page-content.tsx`
- `src/app/globals.css`

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
- La separacion funcional entre documentos laborales (modal empleado) y operativos (pagina documentos) esta en `../DOCS/4_Operaciones_y_Guias/GUIA_SEPARACION_DOCUMENTOS_LABORALES_OPERATIVOS.md`.

## Entornos Supabase

- `Produccion`: `Getbackplate` (`mfhyemwypuzsqjqxtbjf`) - `https://mfhyemwypuzsqjqxtbjf.supabase.co`
- `Desarrollo`: `Getbackplate Dev` (`uubdslmtfxwraszinpao`) - `https://uubdslmtfxwraszinpao.supabase.co`

Regla operativa:

- `.env.local` y pruebas locales deben apuntar a `Getbackplate Dev`.
- Scripts de debug, seed y limpieza no deben ejecutarse contra `Produccion`.

## Permisos delegados de empleado (incluye IA)

- La tabla `employee_module_permissions` define permisos delegados por módulo para usuarios con rol `employee`.
- Módulos soportados: `announcements`, `checklists`, `documents`, `vendors`, `ai_assistant`.
- En `ai_assistant`, el permiso `create` se usa como habilitador funcional de acceso al asistente IA en el panel de empleado.
- Si `ai_assistant` no está habilitado en el plan de la organización, el asistente no se muestra aunque exista permiso delegado.

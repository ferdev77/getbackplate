# GetBackplate - README tecnico (Etapa 1)

Repositorio principal del SaaS multi-tenant **GetBackplate**.

Este README cubre el repositorio completo y la entrega tecnica de Etapa 1; para detalles operativos de la app web ver `web/README.md`.

## 1) Alcance del repositorio

- App web (Next.js): `web/`
- Esquema y migraciones de Supabase: `supabase/migrations/`
- Documentacion funcional/operativa: `DOCS/`

## 2) Requisitos locales

- Node.js 20+
- npm 10+
- Git
- Opcional pero recomendado:
  - Supabase CLI (`npx supabase ...`)
  - Vercel CLI (`vercel ...`)

## 3) Puesta en marcha local

1. Instalar dependencias:

```bash
cd web
npm install
```

2. Crear entorno local:

```bash
cp .env.example .env.local
```

3. Completar valores reales en `web/.env.local`.

4. Levantar proyecto:

```bash
npm run dev
```

5. Verificar salud de Supabase:

- Abrir `http://localhost:3000/api/health/supabase`
- Debe responder `ok: true`

## 4) Scripts principales

Desde `web/`:

- `npm run dev`: desarrollo local
- `npm run lint`: lint
- `npm run build`: build de produccion
- `npm run verify:migrations-sync`: valida sincronizacion de migraciones entre:
  - `supabase/migrations` (fuente de verdad)
  - proyecto Supabase linkeado (dev)
  - base de production (leyendo Vercel env)

## 5) Servicios conectados y como se usan

- **Supabase (DB/Auth/Storage/Realtime)**
  - Clientes server/browser/admin en `web/src/infrastructure/supabase/client/`
  - Migraciones SQL versionadas en `supabase/migrations/`
  - Storage para branding y documentos
  - Realtime para vistas operativas

- **Stripe (billing)**
  - Endpoints API en `web/src/app/api/stripe/`
  - Variables: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

- **Brevo (email transaccional)**
  - Cliente en `web/src/infrastructure/email/client.ts`
  - Variables: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, opcional `BREVO_SENDER_NAME`

- **Twilio (SMS/WhatsApp)**
  - Integracion de notificaciones en backend
  - Variables: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER`, `TWILIO_TRIAL_MODE`

- **IA (Anthropic/OpenRouter)**
  - Endpoint principal: `web/src/app/api/company/ai/chat/route.ts`
  - Variables principales: `ANTHROPIC_API_KEY` (principal) y `OPENROUTER_API_KEY` (fallback)

- **Upstash Redis (rate limit/cache opcional)**
  - Variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## 6) Migraciones Supabase (fuente de verdad)

- Ubicacion obligatoria: `supabase/migrations/`
- Convencion: archivos SQL versionados por timestamp/prefijo
- Comando para listar:

```bash
ls supabase/migrations
```

- Verificacion de sincronizacion completa:

```bash
cd web
npm run verify:migrations-sync
```

## 7) Entornos Supabase y despliegue

### Dos bases de datos separadas

| Entorno | Proyecto Supabase | Región AWS | Archivo de configuración |
|---|---|---|---|
| **Desarrollo local** | `uubdslmtfxwraszinpao` | `us-east-1` | `web/.env.local` |
| **Producción** | `mfhyemwypuzsqjqxtbjf` | `us-west-2` | `web/.env.production.local` |

Regla: el esquema debe estar alineado en ambos entornos mediante `supabase/migrations`.

### Despliegue en Vercel

La app está publicada en Vercel bajo el proyecto `getbackplate`:
- **URL de producción:** `https://app.getbackplate.com`
- **Project ID:** `prj_IvTEU3Ta3ApMY5Sa8tZCY4SxT0Mc`
- **Org ID:** `team_Ajv0vLA1g46FuSu4It7WjJSk`
- Configurado en `.vercel/project.json`

En producción, Vercel inyecta las variables de `web/.env.production.local` automáticamente.

### Correr localmente contra producción (solo para debugging)

Por defecto `npm run dev` apunta a la base de **desarrollo**. Si necesitás conectarte a producción desde local:

```bash
# Opción recomendada: usar el archivo de producción directamente
node --env-file=web/.env.production.local scripts/mi-script.mjs

# Para el servidor de Next.js completo contra producción
# (requiere pasar las variables manualmente en la sesión de PowerShell)
$env:NEXT_PUBLIC_SUPABASE_URL="https://mfhyemwypuzsqjqxtbjf.supabase.co"
npm run dev
```

> ⚠️ **ADVERTENCIA:** Correr localmente apuntando a producción significa operar sobre **datos reales de clientes activos**. Usar exclusivamente para debugging puntual y nunca ejecutar scripts de seeds, migraciones destructivas o limpieza masiva contra producción desde local.

## 8) Entrega de bundle Git

Comando correcto para bundle completo:

```bash
git bundle create getbackgplate.bundle --all
```

Nota: en algunos pedidos aparece `-all`, pero la forma valida en Git es `--all`.

## 9) Checklist rapido de cierre Etapa 1

- [ ] `npm run lint` sin errores
- [ ] `npm run build` sin errores
- [ ] `npm run verify:migrations-sync` en OK
- [ ] `web/.env.example` actualizado y sin secretos
- [ ] `git status` limpio
- [ ] bundle generado: `getbackgplate.bundle`

## 10) Guias operativas clave

- Tenant lifecycle (alta/baja): `DOCS/4_Operaciones_y_Guias/TENANT_OPS_GUIDE.md`
- Custom Domains (estado actual + runbook + checklists): `DOCS/4_Operaciones_y_Guias/GUIA_CUSTOM_DOMAINS.md`

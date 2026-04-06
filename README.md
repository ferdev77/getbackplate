# GetBackplate - README tecnico (Etapa 1)

Repositorio principal del SaaS multi-tenant **GetBackplate**.

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

- **IA (OpenRouter/OpenAI)**
  - Endpoint principal: `web/src/app/api/company/ai/chat/route.ts`
  - Variables principales: `OPENROUTER_API_KEY` o `OPENAI_API_KEY`

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

## 7) Entornos Supabase esperados

- Produccion: `mfhyemwypuzsqjqxtbjf`
- Desarrollo: `uubdslmtfxwraszinpao`

Regla: esquema alineado en ambos entornos con `supabase/migrations`.

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

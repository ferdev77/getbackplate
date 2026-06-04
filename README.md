# GetBackplate — Repositorio Principal

SaaS multi-tenant para operación interna de empresas. En producción en `https://app.getbackplate.com`.

---

## Para desarrolladores — empezá por acá

| Documento | Qué encontrás |
|---|---|
| **[AGENTS.md](AGENTS.md)** | Convenciones del codebase, modelo de datos, flujos de billing, patrones obligatorios. **Leer primero.** |
| **[web/ARCHITECTURE.md](web/ARCHITECTURE.md)** | Estructura de módulos, estrategia de caché, patrones de API routes, tests. |
| **[DOCS/00_START_HERE.md](DOCS/00_START_HERE.md)** | Índice completo de documentación — dónde buscar cada tema. |
| **[CHANGELOG.md](CHANGELOG.md)** | Historial de cambios con fecha. |

---

## Estructura del repositorio

```
getbackplate/
├── web/                    # App Next.js 16 (ver web/README.md)
├── supabase/migrations/    # Migraciones SQL versionadas (fuente de verdad)
├── scripts/                # Scripts operativos de migración y diagnóstico
├── DOCS/                   # Documentación funcional y operativa
├── AGENTS.md               # Guía técnica para devs y agentes IA
├── SUPABASE_MIGRATIONS.md  # Índice completo de migraciones
└── CHANGELOG.md            # Historial de cambios
```

---

## Puesta en marcha local

```bash
# 1. Instalar dependencias
cd web && npm install

# 2. Crear entorno local
cp .env.example .env.local
# Completar valores en web/.env.local (ver sección Variables de entorno abajo)

# 3. Levantar
npm run dev

# 4. Verificar conexión
# Abrir http://localhost:3000/api/health/supabase → debe responder ok: true
```

---

## Scripts principales (desde `web/`)

```bash
npm run dev                          # Desarrollo local
npm run lint                         # Lint
npm run build                        # Build de producción
npm test                             # Tests unitarios (215 tests)
npm run e2e:smoke                    # E2E smoke de API
npm run verify:migrations-sync       # Valida sincronía de migraciones DEV/PROD
npm run verify:flow:local:cleanup    # Valida flujo DB y limpia datos de prueba
```

Guía completa de testing: [`DOCS/4_Operaciones_y_Guias/GUIA_TESTING_Y_CI.md`](DOCS/4_Operaciones_y_Guias/GUIA_TESTING_Y_CI.md)

---

## Entornos

### Dos bases de datos separadas

| Entorno | Proyecto Supabase | Región | Config |
|---|---|---|---|
| **Desarrollo** | `uubdslmtfxwraszinpao` | `us-east-1` | `web/.env.local` |
| **Producción** | `mfhyemwypuzsqjqxtbjf` | `us-west-2` | `web/.env.production.local` |

Regla: el esquema debe estar alineado en ambos entornos via `supabase/migrations/`.

### Despliegue

- **URL producción:** `https://app.getbackplate.com`
- **Plataforma:** Vercel (proyecto `getbackplate`, `.vercel/project.json`)
- Vercel inyecta las variables de `web/.env.production.local` automáticamente

### Correr localmente contra producción (solo debugging)

```bash
# Scripts puntuales
node --env-file=web/.env.production.local scripts/mi-script.mjs

# Servidor Next.js completo contra prod (PowerShell)
$env:NEXT_PUBLIC_SUPABASE_URL="https://mfhyemwypuzsqjqxtbjf.supabase.co"
npm run dev
```

> ⚠️ Apuntar a producción local significa operar sobre datos reales de clientes activos. Solo para debugging. Nunca correr seeds, migraciones destructivas ni limpiezas masivas contra producción desde local.

---

## Servicios conectados

| Servicio | Propósito | Variables principales |
|---|---|---|
| **Supabase** | DB / Auth / Storage / Realtime | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Stripe** | Billing y suscripciones | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| **Brevo** | Email transaccional | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` |
| **Twilio** | SMS / WhatsApp | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER` |
| **DocuSeal** | Firma digital de documentos | `DOCUSEAL_API_KEY`, `DOCUSEAL_BASE_URL` |
| **Anthropic / OpenRouter** | Asistente IA | `OPENROUTER_API_KEY` (principal), `ANTHROPIC_API_KEY` (fallback) |
| **Upstash Redis** | Rate limiting / caché | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| **Sentry** | Error tracking | `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` |

---

## Migraciones Supabase

- Ubicación: `supabase/migrations/` (fuente de verdad)
- Índice completo: [`SUPABASE_MIGRATIONS.md`](SUPABASE_MIGRATIONS.md) — 126 migraciones al 2026-06-04
- Scripts de migración operativa: [`scripts/`](scripts/) — ver [`DOCS/4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md`](DOCS/4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md)

```bash
# Verificar sincronía DEV/PROD
cd web && npm run verify:migrations-sync
```

---

## Checklist antes de deployar

```
☐ npm run lint        → sin errores
☐ npm run build       → sin errores
☐ npm test            → 215/215 pasando
☐ npm run verify:migrations-sync → OK en DEV y PROD
☐ git status          → limpio
```

---

## Documentación operativa clave

| Guía | Tema |
|---|---|
| [`DOCS/4_Operaciones_y_Guias/GUIA_TESTING_Y_CI.md`](DOCS/4_Operaciones_y_Guias/GUIA_TESTING_Y_CI.md) | Tests, CI/CD, cómo correr la suite |
| [`DOCS/4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md`](DOCS/4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md) | Índice de todos los scripts y cómo usarlos |
| [`DOCS/4_Operaciones_y_Guias/GUIA_PIPELINE_QBO_WEBHOOK.md`](DOCS/4_Operaciones_y_Guias/GUIA_PIPELINE_QBO_WEBHOOK.md) | Pipeline QBO→R365 webhook completo |
| [`DOCS/4_Operaciones_y_Guias/TENANT_OPS_GUIDE.md`](DOCS/4_Operaciones_y_Guias/TENANT_OPS_GUIDE.md) | Alta y baja de tenants |
| [`DOCS/4_Operaciones_y_Guias/OPS_RUNBOOK.md`](DOCS/4_Operaciones_y_Guias/OPS_RUNBOOK.md) | Runbook L1/L2 para incidentes en producción |
| [`DOCS/4_Operaciones_y_Guias/GUIA_CUSTOM_DOMAINS.md`](DOCS/4_Operaciones_y_Guias/GUIA_CUSTOM_DOMAINS.md) | Custom domains — configuración y runbook |
| [`DOCS/4_Operaciones_y_Guias/GUIA_CONFIGURACION_STRIPE.md`](DOCS/4_Operaciones_y_Guias/GUIA_CONFIGURACION_STRIPE.md) | Configuración de Stripe paso a paso |
| [`DOCS/1_Arquitectura_y_Contexto/ESTADO_Y_AUDITORIA_ACTUAL.md`](DOCS/1_Arquitectura_y_Contexto/ESTADO_Y_AUDITORIA_ACTUAL.md) | Estado técnico actual del proyecto |
| [`DOCS/1_Arquitectura_y_Contexto/ADR_003_DUAL_PLAN_MODEL.md`](DOCS/1_Arquitectura_y_Contexto/ADR_003_DUAL_PLAN_MODEL.md) | Decisión arquitectónica: modelo dual-plan |

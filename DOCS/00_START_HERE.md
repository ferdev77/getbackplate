# Start Here — Guía de Navegación de la Documentación

**GetBackplate** — SaaS multi-tenant en producción. Este archivo es el índice canónico de toda la documentación del repo.

---

## Si acabás de entrar al proyecto

Leer en este orden:

1. **[README.md](../README.md)** — estructura del repo, cómo levantar el proyecto localmente, servicios, checklist de deploy.
2. **[AGENTS.md](../AGENTS.md)** — convenciones del código, modelo de datos, flujos de billing, cómo funciona el checkout, manual payment orders. **El doc técnico más importante.**
3. **[web/ARCHITECTURE.md](../web/ARCHITECTURE.md)** — estructura de módulos, patrones de API, estrategia de caché, tests.
4. **[CHANGELOG.md](../CHANGELOG.md)** — qué cambió y cuándo.

---

## Cómo agregar documentación nueva

Ver **[`01_DOC_GOVERNANCE_AND_NAMING.md`](./01_DOC_GOVERNANCE_AND_NAMING.md)** — define tipos de doc, dónde va cada uno, naming convention y checklist de incorporación.

---

## Por tema específico

### Código y arquitectura

| Pregunta | Documento |
|---|---|
| ¿Cómo está estructurado el codebase? | [`web/ARCHITECTURE.md`](../web/ARCHITECTURE.md) |
| ¿Cuáles son las convenciones del repo? | [`AGENTS.md`](../AGENTS.md) |
| ¿Cómo funciona el middleware/proxy? | [`web/ARCHITECTURE.md`](../web/ARCHITECTURE.md) — sección Middleware |
| ¿Cómo funciona el scope de empleados? | [`web/ARCHITECTURE.md`](../web/ARCHITECTURE.md) + archivos `shared/lib/employee-*` |
| ¿Qué son los ADRs? | [`1_Arquitectura_y_Contexto/ADR_001_*`](./1_Arquitectura_y_Contexto/) — decisiones arquitectónicas documentadas |

### Billing y Stripe

| Pregunta | Documento |
|---|---|
| ¿Cómo funciona el checkout? | [`AGENTS.md`](../AGENTS.md) — sección Stripe Billing Flows |
| ¿Qué es el modelo dual-plan? | [`1_Arquitectura_y_Contexto/ADR_003_DUAL_PLAN_MODEL.md`](./1_Arquitectura_y_Contexto/ADR_003_DUAL_PLAN_MODEL.md) |
| ¿Cómo configuro Stripe? | [`4_Operaciones_y_Guias/GUIA_CONFIGURACION_STRIPE.md`](./4_Operaciones_y_Guias/GUIA_CONFIGURACION_STRIPE.md) |
| ¿Qué son las manual payment orders? | [`AGENTS.md`](../AGENTS.md) — sección Manual Payment Orders |

### Integración QBO → R365

| Pregunta | Documento |
|---|---|
| ¿Cómo funciona el pipeline completo? | [`4_Operaciones_y_Guias/GUIA_PIPELINE_QBO_WEBHOOK.md`](./4_Operaciones_y_Guias/GUIA_PIPELINE_QBO_WEBHOOK.md) |
| ¿Cómo onboardear un cliente nuevo? | [`4_Operaciones_y_Guias/GUIA_ONBOARDING_QBO_R365_RAPIDA.md`](./4_Operaciones_y_Guias/GUIA_ONBOARDING_QBO_R365_RAPIDA.md) |
| ¿Cómo configurar el sandbox? | [`4_Operaciones_y_Guias/GUIA_CONFIGURACION_QBO_R365_SANDBOX.md`](./4_Operaciones_y_Guias/GUIA_CONFIGURACION_QBO_R365_SANDBOX.md) |
| ¿Cómo operar en producción? | [`4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md`](./4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md) |
| Especificación técnica completa | [`1_Arquitectura_y_Contexto/PRODUCT_PHASE_QBO_R365_ESPECIFICACION_TECNICA.md`](./1_Arquitectura_y_Contexto/PRODUCT_PHASE_QBO_R365_ESPECIFICACION_TECNICA.md) |

### Testing y CI

| Pregunta | Documento |
|---|---|
| ¿Cómo correr los tests? | [`4_Operaciones_y_Guias/GUIA_TESTING_Y_CI.md`](./4_Operaciones_y_Guias/GUIA_TESTING_Y_CI.md) |
| ¿Qué cubre cada test? | [`web/ARCHITECTURE.md`](../web/ARCHITECTURE.md) — sección Tests |

### Operaciones y producción

| Pregunta | Documento |
|---|---|
| Incidente en prod — qué hacer | [`4_Operaciones_y_Guias/OPS_RUNBOOK.md`](./4_Operaciones_y_Guias/OPS_RUNBOOK.md) |
| Alta/baja de tenants | [`4_Operaciones_y_Guias/TENANT_OPS_GUIDE.md`](./4_Operaciones_y_Guias/TENANT_OPS_GUIDE.md) |
| Custom domains | [`4_Operaciones_y_Guias/GUIA_CUSTOM_DOMAINS.md`](./4_Operaciones_y_Guias/GUIA_CUSTOM_DOMAINS.md) |
| Scripts operativos | [`4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md`](./4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md) |
| Cron jobs activos y schedules | [`web/CRONS_SIMPLE.md`](../web/CRONS_SIMPLE.md) |
| Validar flujos DB | [`4_Operaciones_y_Guias/GUIA_VALIDACION_FLUJOS_LOCAL_PROD.md`](./4_Operaciones_y_Guias/GUIA_VALIDACION_FLUJOS_LOCAL_PROD.md) |

### Base de datos y migraciones

| Pregunta | Documento |
|---|---|
| Índice de todas las migraciones | [`SUPABASE_MIGRATIONS.md`](../SUPABASE_MIGRATIONS.md) |
| Convención para nuevas migraciones | [`AGENTS.md`](../AGENTS.md) — sección Migration Conventions |
| Cómo aplicar una migración a DEV/PROD | [`4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md`](./4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md) |
| Verificar sincronía de esquema | `cd web && npm run verify:migrations-sync` |

### Documentos de empleados

| Pregunta | Documento |
|---|---|
| Separación laborales vs operativos | [`4_Operaciones_y_Guias/GUIA_SEPARACION_DOCUMENTOS_LABORALES_OPERATIVOS.md`](./4_Operaciones_y_Guias/GUIA_SEPARACION_DOCUMENTOS_LABORALES_OPERATIVOS.md) |
| Flujo de documentos custom | [`4_Operaciones_y_Guias/GUIA_FLUJO_DOCUMENTOS_CUSTOM_EMPLEADOS.md`](./4_Operaciones_y_Guias/GUIA_FLUJO_DOCUMENTOS_CUSTOM_EMPLEADOS.md) |

### IA / Asistente

| Pregunta | Documento |
|---|---|
| Política de uso del asistente | [`4_Operaciones_y_Guias/POLITICA_INTERNA_ASISTENTE_IA.md`](./4_Operaciones_y_Guias/POLITICA_INTERNA_ASISTENTE_IA.md) |

---

## Sobre los documentos históricos en `DOCS/`

Muchos documentos de `DOCS/2_Planes_y_Checklists/`, `DOCS/3_Actualizaciones_Sprints/` y `DOCS/complemento_etapa_1/` son **registros históricos** de fases ya ejecutadas. Son útiles para entender decisiones pasadas, pero no representan el estado actual del sistema.

**Regla:** si un documento histórico contradice el código o un documento marcado como vigente, el código manda.

Documentos vigentes de referencia técnica:
- `AGENTS.md`
- `web/ARCHITECTURE.md`
- `DOCS/1_Arquitectura_y_Contexto/ESTADO_Y_AUDITORIA_ACTUAL.md`
- `DOCS/1_Arquitectura_y_Contexto/ADR_003_DUAL_PLAN_MODEL.md`
- `CHANGELOG.md`

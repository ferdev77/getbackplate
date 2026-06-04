# Gobernanza de Documentación — GetBackplate

Última actualización: 2026-06-04

Este archivo define el sistema completo de documentación: qué tipos de docs existen, dónde va cada uno, cómo se nombran y cómo se mantienen.

---

## La regla más importante

**El código es la fuente de verdad técnica. La documentación describe, guía y contextualiza — nunca inventa.**

Si un doc dice algo diferente a lo que hace el código, el código gana. El doc se actualiza.

---

## Tipos de documento

| Tipo | Descripción | Se actualiza | Ejemplo |
|---|---|---|---|
| **Referencia técnica (viva)** | Describe cómo funciona el sistema hoy. Se actualiza cuando el código cambia. | Siempre | `AGENTS.md`, `ARCHITECTURE.md` |
| **Guía operativa (viva)** | Instrucciones paso a paso para operar, configurar o diagnosticar. | Cuando cambia el proceso | `GUIA_*.md`, `OPS_RUNBOOK.md` |
| **ADR (decisión)** | Registro de una decisión arquitectónica: qué se decidió, por qué, alternativas descartadas. Inmutable una vez aceptado. | Nunca (solo estado: Propuesto → Aceptado → Supersedido) | `ADR_001_*.md` |
| **Changelog** | Registro cronológico de cambios al sistema con fecha. | Con cada cambio significativo | `CHANGELOG.md` |
| **Histórico / Congelado** | Foto del estado del sistema en un momento pasado. Útil como contexto, no como guía actual. | Nunca | `ACTUALIZACION_2.0_SAAS.md`, `ANALISIS_*_2026-03-31.md` |
| **Reporte de ejecución** | Resultado de una auditoría, validación o sprint específico. Punto en el tiempo. | Nunca | `REPORTE_EJECUCION_*.md` |
| **Plan / Checklist** | Plan de implementación de una feature o fase. Una vez ejecutado, se archiva como histórico. | Solo mientras está en ejecución | `PLAN_*.md`, `CHECKLIST_*.md` |

---

## Dónde va cada tipo de doc

### Archivos en la raíz del repo

Solo documentos que necesita cualquier persona que abre el repo por primera vez:

| Archivo | Propósito |
|---|---|
| `README.md` | Entrada al repo: cómo levantar, servicios, links a docs técnicos |
| `AGENTS.md` | Referencia técnica para devs y agentes IA — convenciones, modelo de datos, billing |
| `CHANGELOG.md` | Historial de cambios con fecha |
| `SUPABASE_MIGRATIONS.md` | Índice completo de migraciones SQL |
| `CLAUDE.md` | Reglas de comportamiento para agentes IA (no tocar) |

### `web/` — Documentación de la app Next.js

| Archivo | Propósito |
|---|---|
| `web/README.md` | Setup, variables de entorno, estructura de la app |
| `web/ARCHITECTURE.md` | Patrones de código, módulos, caché, tests |
| `web/CRONS_SIMPLE.md` | Cron jobs activos y sus schedules |
| `web/README_SCOPE_GOLDEN_RULE.md` | Regla de scope para toda la plataforma |
| `web/README_MODAL_FLUENCY_PLAN.md` | Patrón de modales con UI-first |

### `DOCS/00_START_HERE.md`

El índice de toda la documentación — qué hay y dónde encontrarlo. **Se actualiza cada vez que se agrega un doc nuevo importante.**

### `DOCS/01_DOC_GOVERNANCE_AND_NAMING.md`

Este archivo. Define el sistema de documentación.

### `DOCS/1_Arquitectura_y_Contexto/`

Documentos que describen la arquitectura y el estado del sistema.

| Naming | Tipo | Ejemplo |
|---|---|---|
| `ADR_NNN_<TEMA>.md` | Decisión arquitectónica | `ADR_003_DUAL_PLAN_MODEL.md` |
| `PRODUCT_PHASE_<TEMA>_<TIPO>.md` | Especificación técnica de una feature de producto | `PRODUCT_PHASE_QBO_R365_ESPECIFICACION_TECNICA.md` |
| `ESTADO_Y_AUDITORIA_*.md` | Estado técnico actual (doc vivo) | `ESTADO_Y_AUDITORIA_ACTUAL.md` |
| `ANALISIS_*_<FECHA>.md` | Análisis histórico en un momento dado (congelado) | `ANALISIS_INTEGRAL_APP_DB_2026-03-31.md` |
| `AUDITORIA_*_<FECHA>.md` | Auditoría técnica en un momento dado (congelado) | `AUDITORIA_ARQUITECTURA_MODULARIZACION_2026-04-19.md` |

### `DOCS/2_Planes_y_Checklists/`

Planes de implementación y checklists de ejecución. Una vez ejecutado un plan, el archivo queda como registro histórico.

| Naming | Tipo | Ejemplo |
|---|---|---|
| `PROD_<TEMA>_<TIPO>.md` | Plan / roadmap de producto | `PROD_ROADMAP_MACRO.md` |
| `COMP_F1_<TEMA>_<TIPO>.md` | Plan de Complemento Fase 1 (histórico) | `COMP_F1_PLAN_EJECUCION_REPRIORIZADO.md` |
| `TECH_REMEDIATION_<TEMA>_<TIPO>.md` | Plan de remediación técnica | `TECH_REMEDIATION_TRACK_MODULO_CORE_PERMISOS_PLAN_CHECKLIST.md` |
| `PLAN_<TEMA>.md` | Plan de implementación de feature | `PLAN_IMPLEMENTACION_RECURRENCIA.md` |
| `CHECKLIST_<TEMA>.md` | Checklist operativo | `CHECKLIST_MAESTRO_PRODUCTO.md` |

### `DOCS/3_Actualizaciones_Sprints/`

Registros históricos de sprints y actualizaciones de versiones. **Congelados — no se modifican.**

| Naming | Tipo |
|---|---|
| `ACTUALIZACION_<VERSION>_SAAS.md` | Registro de sprint / versión |
| `NORTE_<TEMA>_ROADMAP.md` | Dirección estratégica de un área |

### `DOCS/4_Operaciones_y_Guias/`

Guías operativas, runbooks y reportes. Esta es la carpeta más usada en el día a día.

| Naming | Tipo | Ejemplo |
|---|---|---|
| `GUIA_<TEMA>.md` | Guía operativa (paso a paso) | `GUIA_PIPELINE_QBO_WEBHOOK.md` |
| `OPS_RUNBOOK.md` | Runbook de incidentes en producción | |
| `TENANT_OPS_GUIDE.md` | SOP de tenants | |
| `REPORTE_<TEMA>_<FECHA>.md` | Reporte de ejecución / validación (congelado) | `REPORTE_VALIDACION_FLUJOS_LOCAL_PROD_2026-04-16.md` |
| `REPORTE_CLIENTE_<TEMA>.md` | Reporte para cliente | `REPORTE_CLIENTE_ESTADO_INTEGRACION_QBO_R365.md` |
| `LOCAL_ONLY_<TEMA>.md` | Archivos locales — no versionar (sensibles) | `LOCAL_ONLY_PUNTOS_CARDINALES_SETUP_2026-04-24.md` |

### `DOCS/complemento_etapa_1/`

Documentación específica del período "Complemento Etapa 1" (ejecutado). Histórico — no se modifica.

### `web/src/modules/<modulo>/`

Documentación técnica embebida en el código — solo para temas muy específicos del módulo que no pertenecen a DOCS/:

| Naming | Tipo | Ejemplo |
|---|---|---|
| `DEVELOPER_MODE.md` | Guía de modo developer / debugging | `integrations/qbo-r365/DEVELOPER_MODE.md` |
| `<TEMA>_FIELDS.md` | Referencia de campos de API | `QBO_DISCARDED_FIELDS.md` |
| `<TEMA>_TYPES.md` | Tipos de datos del módulo | `QBO_TRANSACTION_TYPES.md` |

---

## Cómo nombrar un doc nuevo

Formato: `<SCOPE>_<TEMA>_<TIPO>.md` o simplemente `GUIA_<TEMA>.md` si es una guía.

Reglas:
- Todo en MAYÚSCULAS con guiones bajos
- Sin fechas en el nombre salvo que sea un reporte puntual (histórico)
- Si el doc va a vivir indefinidamente (guía, ADR), sin fecha en el nombre
- Si el doc es una foto del momento (reporte, análisis), agregar `_<FECHA>` al final

Ejemplos correctos:
```
GUIA_MODULO_MANTENIMIENTO.md         ← guía operativa del módulo mantenimiento
ADR_004_WEBHOOK_CLAIM_PATTERN.md     ← decisión arquitectónica nueva
REPORTE_AUDITORIA_DOCS_2026-06-04.md ← reporte puntual con fecha
PLAN_IMPLEMENTACION_VENDORS_V2.md    ← plan de feature
```

---

## Cómo marcar un doc como histórico

Agregar al inicio del archivo:

```markdown
> **HISTÓRICO — CONGELADO** — Este documento refleja el estado al <FECHA>. 
> No se actualiza. Para el estado actual ver [`<DOC_VIGENTE>`](<ruta>).
```

---

## Checklist al agregar documentación nueva

1. ¿Es una guía operativa? → `DOCS/4_Operaciones_y_Guias/GUIA_<TEMA>.md`
2. ¿Es una decisión de arquitectura? → `DOCS/1_Arquitectura_y_Contexto/ADR_NNN_<TEMA>.md`
3. ¿Es un plan de feature? → `DOCS/2_Planes_y_Checklists/PLAN_<TEMA>.md`
4. ¿Es referencia técnica del codebase? → `AGENTS.md` o `web/ARCHITECTURE.md` (actualizar el existente)
5. ¿Es un cambio al sistema? → entrada en `CHANGELOG.md`
6. ¿Es documentación de un módulo específico embebida en código? → `web/src/modules/<modulo>/`
7. ¿Después de agregar, actualizar `DOCS/00_START_HERE.md` con el link?

---

## Documentos vivos vs históricos — estado actual

### Vivos (se mantienen actualizados)

| Documento | Responsable de mantener |
|---|---|
| `README.md` | Al cambiar setup, servicios o estructura |
| `AGENTS.md` | Al cambiar modelo de datos, billing flows, convenciones |
| `web/ARCHITECTURE.md` | Al cambiar patrones de código o tests |
| `web/CRONS_SIMPLE.md` | Al cambiar `vercel.json` |
| `CHANGELOG.md` | Con cada deploy significativo |
| `SUPABASE_MIGRATIONS.md` | Al agregar migraciones |
| `DOCS/00_START_HERE.md` | Al agregar docs nuevos importantes |
| `DOCS/01_DOC_GOVERNANCE_AND_NAMING.md` | Al cambiar el sistema de docs |
| `DOCS/1_Arquitectura_y_Contexto/ESTADO_Y_AUDITORIA_ACTUAL.md` | Al cambiar estado del proyecto |
| `DOCS/4_Operaciones_y_Guias/GUIA_*.md` | Al cambiar los procesos que describen |
| `DOCS/4_Operaciones_y_Guias/GUIA_SCRIPTS_PLATAFORMA.md` | Al agregar/cambiar scripts |
| `DOCS/4_Operaciones_y_Guias/GUIA_TESTING_Y_CI.md` | Al cambiar la suite de tests |

### Históricos (congelados — no tocar)

Todo lo que está en:
- `DOCS/3_Actualizaciones_Sprints/ACTUALIZACION_*.md`
- `DOCS/2_Planes_y_Checklists/` (planes ya ejecutados)
- `DOCS/complemento_etapa_1/`
- `DOCS/1_Arquitectura_y_Contexto/ANALISIS_*` y `AUDITORIA_*`
- `DOCS/4_Operaciones_y_Guias/REPORTE_*`
- `DOCS/4_Operaciones_y_Guias/HANDOVER.md` ← histórico (ver nota abajo)

---

## Nota sobre HANDOVER.md

`DOCS/4_Operaciones_y_Guias/HANDOVER.md` fue escrito para entregar el proyecto en Marzo 2026. Está desactualizado. Se mantiene como registro histórico. Para el estado actual del proyecto, leer:
- [`README.md`](../README.md)
- [`AGENTS.md`](../AGENTS.md)
- [`DOCS/1_Arquitectura_y_Contexto/ESTADO_Y_AUDITORIA_ACTUAL.md`](./1_Arquitectura_y_Contexto/ESTADO_Y_AUDITORIA_ACTUAL.md)

# Guía Operativa: Pipeline QBO Webhook

**Fecha:** 2026-06-02

---

## Flujo completo de un webhook QBO

Cuando QBO envía un evento (ej: factura creada), el sistema pasa por estas etapas:

```
QBO → POST /api/webhooks/qbo
       ↓
  qbo_webhook_events (status=captured)
  qbo_unified_invoices (pipeline_status=en_cola)
       ↓
  after() → fetchAndCaptureWebhookInvoice  [background, mismo proceso]
       ↓ (si falla o timeout)
  Cron /api/webhooks/cron/qbo-r365-sync   [recovery, se autotriggerrea]
       ↓
  qbo_unified_invoices (pipeline_status=capturada → mapeada → enviada)
  integration_runs + integration_run_items
  CSV subido por FTP a R365
```

---

## Dos zonas de fallo

### Zona 1 — Antes del historial
La factura llegó y se guardó pero el proceso de identificación (¿a qué cliente pertenece? ¿qué sync config?) no completó.

**Síntomas:**
- Webhook en `status=captured` (no `imported_manual`)
- Fila en `qbo_unified_invoices` con `pipeline_status=capturada` y `sync_config_id=null`
- La factura NO aparece en el historial de la sync config

**Causa:** `fetchAndCaptureWebhookInvoice` es llamada con `after()` (Next.js). Si Vercel mata el proceso antes de completar, la factura queda incompleta. El cron de recovery la detecta pero antes no podía resolverla sin `sync_config_id`.

**Fix implementado (2026-06-02):** El cron `processQboUnifiedQueue` ahora extrae el `CustomerRef.value` del `raw_entity` y busca la sync config correspondiente cuando `sync_config_id` es null. También escribe `doc_number`, `txn_date`, `customer_name`, `total_amount` que antes quedaban vacíos.

### Zona 2 — Durante el pipeline
La factura ya está en el historial (tiene `sync_config_id`) pero falla en algún paso posterior: FTP caído, token QBO vencido, error de mapeo.

**Síntomas:**
- Fila en `qbo_unified_invoices` con `pipeline_status=capturada` o `mapeada`
- Visible en el historial con estado intermedio

**Recovery:** El cron diario (`0 10 * * *`) + los horarios frecuentes reintenta automáticamente.

---

## Entidades relevantes

| Tabla | Propósito |
|---|---|
| `qbo_webhook_events` | Log de cada evento recibido de QBO. `status=captured` = recibido, `imported_manual` = procesado |
| `qbo_unified_invoices` | Pipeline unificado. Una fila por factura, sigue su estado de `en_cola` → `enviada` |
| `qbo_r365_sync_configs` | Configuraciones de sync por cliente QBO. Cada una tiene su `qbo_customer_id` |
| `integration_runs` | Cada ejecución de sync (manual, scheduled, retry) |
| `integration_run_items` | Líneas individuales de cada run |

---

## Cron schedule (vercel.json)

| Ruta | Schedule | Propósito |
|---|---|---|
| `/api/webhooks/cron/qbo-r365-sync` | `0 0,4,10,12,14,16,18,20,21,22 * * *` | Recovery pipeline + sync scheduled |
| `/api/internal/cron/daily` | `0 8 * * *` | Tareas diarias generales |

---

## Operación `Emailed` en webhooks

QBO envía `operation=Emailed` cuando una factura es enviada por email al cliente. El sistema **sí procesa** este tipo de evento (el código solo filtra por `entity`, no por `operation`). Esto es intencional: la factura puede necesitar sincronizarse cuando se envía.

El mecanismo de deduplicación en `integration_run_items` evita que se suba dos veces si ya fue procesada antes.

---

## Diagnóstico rápido en producción

```javascript
// Webhooks de hoy para una org
supabase.from("qbo_webhook_events")
  .select("id, received_at, entity, entity_id, operation, status, sync_config_id")
  .eq("organization_id", ORG_ID)
  .gte("received_at", TODAY)
  .order("received_at")

// Facturas atascadas en pipeline
supabase.from("qbo_unified_invoices")
  .select("id, entity_id, pipeline_status, sync_config_id, doc_number, customer_name")
  .eq("organization_id", ORG_ID)
  .in("pipeline_status", ["en_cola", "capturada", "mapeada"])

// Runs de hoy
supabase.from("integration_runs")
  .select("id, status, trigger_source, started_at, total_detected, total_uploaded")
  .eq("organization_id", ORG_ID)
  .gte("started_at", TODAY)
  .order("started_at")
```

---

## Prodel Distribution — Estado actual (2026-06-02)

- Organización ID: `55fa3893-666f-4562-a39e-fae5fe06d6f1`
- Sync config activa: "Kumori Central Kitchen" (qbo_customer_id=279)
- Plan de integración: Connect
- Realm ID QBO: `1206114220`
- Módulos activos: `qbo_r365`, `settings`, `custom_branding`

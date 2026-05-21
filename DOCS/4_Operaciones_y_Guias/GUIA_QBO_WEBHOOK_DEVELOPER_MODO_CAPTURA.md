# Guia QBO Webhook - Captura y Procesamiento Automatico

## Objetivo

Documentar el flujo actual de procesamiento de webhooks de QBO: captura automatica, pipeline diario y recuperacion manual como fallback.

---

## Flujo actual (automatico)

1. QBO envia webhook a `POST /api/webhooks/qbo`.
2. El backend valida firma (`intuit-signature`) con `QBO_WEBHOOK_VERIFIER_TOKEN`.
3. Se persiste el evento en `qbo_webhook_events` con el payload crudo.
4. El pipeline diario (`/api/webhooks/cron/qbo-r365-sync`) procesa la cola:
   - consulta la entidad completa a QBO por `entity_id`;
   - guarda `raw_entity` en `qbo_unified_invoices` con `import_source='webhook'`;
   - ejecuta mapping (normalizeQboRows) → buildR365Csv → uploadCsvToFtp;
   - actualiza `pipeline_status='enviada'`.
5. El historial unificado en el dashboard refleja el estado en tiempo real.

## Flujo de recuperacion manual (fallback)

Si una factura no llego por webhook (fallo de red, evento no recibido, etc.):

1. Ir al dashboard QBO → seccion de busqueda.
2. Ingresar el DocNumber de la factura en QBO.
3. El sistema usa `POST /api/company/integrations/qbo-r365/fetch-by-docnumber` para traerla.
4. La factura queda en historial con `import_source='manual'`.
5. Hacer click en la factura → panel lateral → `Enviar a R365`.
6. El sistema ejecuta el mapping en tiempo real y sube el CSV al FTP.

---

## Configuracion Intuit (Developer App)

- Endpoint URL (Production): `https://app.getbackplate.com/api/webhooks/qbo`
- Endpoint URL (Development): `https://getbackplate-dev-3959-getbackplates-projects.vercel.app/api/webhooks/qbo`
- `Enable cloud event payload format`: OFF
- Eventos recomendados:
  - Invoice: Create, Update, Emailed
  - CreditMemo: Create, Update

---

## Variables de entorno

- `QBO_WEBHOOK_VERIFIER_TOKEN` — verifier token exacto de Intuit para cada entorno.
- `CRON_SECRET` — requerido para autorizar el cron diario.

---

## Endpoints activos

- `POST /api/webhooks/qbo`
  - Recibe el webhook de Intuit. Valida firma y persiste en `qbo_webhook_events`.
- `GET|POST /api/webhooks/cron/qbo-r365-sync`
  - Pipeline diario que procesa la cola de webhooks y envia a R365 FTP.
  - Requiere `Authorization: Bearer <CRON_SECRET>`.
- `POST /api/company/integrations/qbo-r365/fetch-by-docnumber`
  - Recuperacion manual de factura por DocNumber.
- `POST /api/company/integrations/qbo-r365/send-unified-invoice`
  - Envio individual de cualquier factura del historial unificado.

---

## Tablas de base de datos

### `qbo_webhook_events`

Almacena el evento crudo recibido de Intuit.

| columna | descripcion |
|---|---|
| id | PK (uuid) |
| organization_id | FK |
| payload | jsonb — payload crudo de Intuit |
| processed | bool — si ya fue procesado por el pipeline |
| created_at | timestamp de recepcion |

### `qbo_unified_invoices`

Historial unificado de todas las facturas (webhook, manual, sync).

| columna | descripcion |
|---|---|
| id | PK (uuid) |
| entity_id | ID de la entidad en QBO |
| entity_type | `Invoice` o `CreditMemo` |
| import_source | `webhook` / `manual` / `sync` |
| pipeline_status | `en_cola` / `capturada` / `mapeada` / `enviada` |
| raw_entity | jsonb — entidad QBO completa |
| sent_at | timestamp de envio a R365 |

---

## Pipeline de estados

```
en_cola → capturada → mapeada → enviada
```

- `en_cola` — webhook recibido, pendiente de procesarse por el cron.
- `capturada` — `raw_entity` almacenado desde QBO.
- `mapeada` — transformacion R365 completada.
- `enviada` — CSV subido al FTP de R365.

---

## Operacion diaria recomendada

1. El cron diario corre automaticamente y no requiere intervencion.
2. Revisar el dashboard para ver si todas las facturas del dia llegaron como `enviada`.
3. Si alguna factura esta atascada en `capturada` o `mapeada`, revisar logs del cron.
4. Si una factura no aparece en el historial, usar la busqueda por DocNumber para recuperarla manualmente.

---

## Nota sobre el modo developer manual anterior

La arquitectura anterior usaba un flujo de captura-replay manual (`/webhook-events/{id}/replay`) donde el usuario debia importar cada factura una por una. Este flujo fue reemplazado por el pipeline automatico diario descrito en esta guia. El fallback para facturas perdidas ahora es `fetch-by-docnumber`, que es mas directo y no depende del historial de eventos capturados.

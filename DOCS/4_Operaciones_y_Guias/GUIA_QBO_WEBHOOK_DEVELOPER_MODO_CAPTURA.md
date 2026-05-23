# Guia QBO Webhook - Captura y Procesamiento Automatico

## Objetivo

Documentar el flujo actual de procesamiento de webhooks de QBO: captura automatica, procesamiento inmediato por doble ruta y cron de recovery como red de seguridad.

---

## Flujo actual (automatico - doble ruta)

Cuando QBO envia un webhook, el sistema ejecuta tres acciones secuenciales antes de responder HTTP 200:

1. Validar firma `intuit-signature` con `QBO_WEBHOOK_VERIFIER_TOKEN`.
2. Persistir el evento en `qbo_webhook_events`.
3. `await upsert` en `qbo_unified_invoices` con `pipeline_status='en_cola'` e `import_source='webhook'`. El `await` garantiza que la fila exista antes de iniciar el procesamiento (fix de race condition: si era `void`, la ruta rapida podia arrancar antes que la fila estuviera creada).

Luego, sin bloquear la respuesta HTTP, se disparan dos rutas en paralelo:

### Ruta rapida (background, best-effort)

`void fetchAndCaptureWebhookInvoice(...)`:
- consulta la entidad completa (Invoice o CreditMemo) a la API de QBO por `entityId`;
- busca la sync config activa para esa organizacion y ese customer;
- si la encuentra: guarda `raw_entity`, ejecuta `mapAndSendUnifiedRow` → mapping → CSV → FTP → `pipeline_status='enviada'`;
- si no hay sync config para ese customer: la fila queda en `en_cola` (comportamiento esperado, no es un error);
- errores se ignoran silenciosamente (`.catch(() => {})`); la ruta confiable actua como respaldo.

### Ruta confiable (self-trigger independiente)

`void fetch(.../api/webhooks/cron/qbo-r365-sync, { method: 'POST', headers: { authorization: 'Bearer <CRON_SECRET>' } })`:
- crea una invocacion serverless completamente nueva e independiente del webhook handler;
- no esta sujeta al timeout del handler original;
- actua como red de seguridad si la ruta rapida falla (timeout de Vercel, FTP temporalmente caido, token vencido, etc.);
- solo requiere que `CRON_SECRET` y `NEXT_PUBLIC_APP_URL` / `APP_BASE_URL` esten configurados.

El cron de recovery (`processQboUnifiedQueue`) ademas corre una vez al dia por schedule como ultima red de seguridad.

### Por que se usan las dos rutas

- La ruta rapida intenta procesar en segundos, cuando el contexto esta fresco y la entidad acaba de cambiar en QBO.
- La ruta confiable crea una ejecucion independiente que no muere si Vercel termina el proceso del webhook handler.
- Las dos se complementan: ninguna cancela ni interfiere con la otra. `ignoreDuplicates: true` en el upsert garantiza idempotencia si ambas intentan escribir la misma fila.

---

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
- Eventos configurados (solo los necesarios):
  - Invoice: **Emailed**
  - CreditMemo: **Emailed**

> Los eventos Create y Update estan desactivados intencionalmente. Solo se procesan facturas e notas de credito que fueron efectivamente enviadas al cliente final en QBO. Esto evita procesar borradores o facturas internas que no corresponde importar a R365.

---

## Variables de entorno

- `QBO_WEBHOOK_VERIFIER_TOKEN` — verifier token exacto de Intuit para cada entorno.
- `CRON_SECRET` — requerido para autorizar el cron de recovery (GET y POST).
- `NEXT_PUBLIC_APP_URL` o `APP_BASE_URL` — URL base de la app; usada por el self-trigger para construir la URL del cron.

---

## Endpoints activos

- `POST /api/webhooks/qbo`
  - Recibe el webhook de Intuit. Valida firma y ejecuta el flujo de doble ruta.
- `GET|POST /api/webhooks/cron/qbo-r365-sync`
  - Cron de recovery del pipeline. Procesa facturas atascadas en `en_cola`, `capturada` o `mapeada`.
  - Requiere `Authorization: Bearer <CRON_SECRET>`.
  - Se dispara automaticamente en cada webhook recibido (self-trigger) y una vez al dia por schedule.
- `POST /api/company/integrations/qbo-r365/fetch-by-docnumber`
  - Recuperacion manual de factura por DocNumber.
- `POST /api/company/integrations/qbo-r365/send-unified-invoice`
  - Envio individual de cualquier factura del historial unificado.
- `POST /api/company/integrations/qbo-r365/map-unified-invoice`
  - Mapeo en tiempo real de una factura del historial (preview del CSV sin enviarlo).
- `GET /api/company/integrations/qbo-r365/preview-unified-invoice-csv`
  - Preview del CSV generado para una factura del historial unificado.

---

## Tablas de base de datos

### `qbo_webhook_events`

Almacena el evento crudo recibido de Intuit.

| columna | tipo | descripcion |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK |
| payload | jsonb | payload crudo de Intuit |
| status | text | `captured` = recibido sin procesar; `imported_manual` = procesado por fetchAndCaptureWebhookInvoice |
| created_at | timestamptz | timestamp de recepcion |

### `qbo_unified_invoices`

Historial unificado de todas las facturas (webhook, manual, sync).

| columna | tipo | descripcion |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK |
| entity_id | text | ID de la entidad en QBO |
| entity_type | text | `Invoice` o `CreditMemo` |
| import_source | text | `webhook` / `manual` / `sync` — CHECK constraint |
| pipeline_status | text | `en_cola` / `capturada` / `mapeada` / `enviada` |
| webhook_event_id | uuid | FK a qbo_webhook_events (si el origen fue webhook) |
| raw_entity | jsonb | entidad QBO completa; base del mapping en tiempo real |
| sent_at | timestamptz | timestamp de envio a R365 |

UNIQUE: `(organization_id, entity_id, entity_type)` — garantiza idempotencia entre ruta rapida y ruta confiable.

---

## Pipeline de estados

```
en_cola → capturada → mapeada → enviada
```

- `en_cola` — upsert inicial al llegar el webhook; pendiente de procesar.
- `capturada` — `raw_entity` almacenado desde QBO; listo para mapear.
- `mapeada` — transformacion R365 completada; listo para enviar al FTP.
- `enviada` — CSV subido al FTP de R365 exitosamente.

Si no se encuentra sync config activa para el customer de esa factura, la fila queda en `en_cola` hasta que se configure una sync config o se envie manualmente.

Nota operativa actual: la creacion de sync config esta restringida a una por organizacion (segunda alta devuelve `409`).

---

## Operacion diaria

1. El cron de recovery corre automaticamente (por schedule y por self-trigger en cada webhook) y no requiere intervencion.
2. Revisar el dashboard: las facturas del dia deben estar como `enviada` en minutos de haber llegado el webhook.
3. Si alguna factura esta atascada en `en_cola`, `capturada` o `mapeada`, revisar si hay sync config activa para ese customer o si el FTP esta disponible.
4. Si una factura no aparece en el historial, usar la busqueda por DocNumber para recuperarla manualmente.
5. Si hay facturas en `en_cola` para customers sin sync config aun, configurar la sync config del customer o enviar manualmente.

---

## Nota sobre funciones desactivadas

`processPendingQboWebhookEvents` — esta funcion esta desactivada en produccion. Retorna `{ disabled: true, message: "Procesamiento automatico deshabilitado: modo captura manual activo" }`. No forma parte del flujo activo; el procesamiento automatico lo hace la doble ruta descrita arriba.

---

## Nota sobre el flujo anterior

La arquitectura anterior usaba un flujo de captura-replay manual (`/webhook-events/{id}/replay`) donde el usuario debia importar cada factura una por una. Este flujo fue reemplazado por el pipeline automatico de doble ruta descrito en esta guia. El fallback para facturas perdidas es `fetch-by-docnumber`, que es mas directo y no depende del historial de eventos capturados.

---

## Control de cambios

- v1: flujo de captura manual (replay por evento).
- v2: pipeline automatico diario como mecanismo primario.
- v3: doble ruta inmediata (ruta rapida + self-trigger cron); `await upsert` para fix de race condition; solo evento `Emailed` configurado en Intuit; `processPendingQboWebhookEvents` desactivada; nuevos endpoints documentados.

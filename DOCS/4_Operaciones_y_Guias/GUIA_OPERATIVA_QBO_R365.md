# DOC_ID: OPERATIONS_RUNBOOK_QBO_R365_V5
# DOC_LEVEL: GUIA_OPERATIVA
# PHASE_NAMESPACE: OPERATIONS_RUNBOOK
# SOURCE_OF_TRUTH_FOR: operacion diaria, flujo de datos, endpoints y troubleshooting de integracion QBO -> R365

# Guia Operativa

## Integracion QuickBooks Online -> Restaurant365

## 1) Objetivo

Definir la operacion diaria del modulo QBO -> R365: configuracion de sync, flujo de datos por webhooks, historial unificado, envio individual de facturas, backfill historico y troubleshooting.

---

## 2) Arquitectura actual (flujo de datos)

```
QBO Webhook (solo evento Emailed)
        │
        ▼
qbo_webhook_events
        │
        ├─► await upsert en qbo_unified_invoices (en_cola)
        │
        ├─► Ruta rapida (background): fetchAndCaptureWebhookInvoice
        │       └─► fetch QBO → raw_entity → mapping → FTP → enviada
        │
        └─► Ruta confiable (self-trigger): POST /cron/qbo-r365-sync
                └─► nueva invocacion serverless independiente (recovery)

Cron diario ──► processQboUnifiedQueue (red de seguridad)
                └─► procesa en_cola / capturada / mapeada sin resolver

DocNumber manual ──► qbo_unified_invoices (import_source='manual')
                         └─► Enviar a R365 (individual, desde dashboard)

Backfill historico ──► qbo_unified_invoices (import_source='sync')
```

### 2.1 Fuentes de datos (import_source)

- `webhook` — factura capturada automaticamente via webhook de QBO (evento `Emailed`);
- `manual` — factura traida individualmente por DocNumber desde el dashboard;
- `sync` — factura ingresada por el pipeline de sync (backfill o corrida diaria).

### 2.2 Pipeline de estados por factura

```
en_cola → capturada → mapeada → enviada
```

- `en_cola` — upsert inicial al recibir el webhook; pendiente de procesar;
- `capturada` — datos traidos desde QBO y almacenados en `raw_entity`;
- `mapeada` — transformacion R365 completada;
- `enviada` — archivo CSV subido al FTP de R365.

### 2.3 Sync configs

Cada organizacion puede tener **multiples sync configs**, una por cada QBO customer a sincronizar. Cada sync config concentra:
- credenciales FTP de R365 (cifradas);
- QBO customer ID (filtro de facturas de ese cliente especifico);
- vendor y location para R365;
- template CSV (`by_item`, `by_item_service_dates`, `by_account`, `by_account_service_dates`);
- tax mode (`none`, `line`, `summary`).

El boton "Crear sincronizacion" en el dashboard siempre esta visible; el formulario filtra automaticamente los customers de QBO que ya tienen una sync config configurada, permitiendo agregar nuevos sin afectar los existentes.

---

## 3) Endpoints operativos

### 3.1 Configuracion

- `GET /api/company/integrations/qbo-r365/sync-configs`
  - lista sync configs de la organizacion.
- `POST /api/company/integrations/qbo-r365/sync-configs`
  - crea sync config (409 si ya existe).
  - body opcional: `backfillFromDate` (YYYY-MM-DD) → importa facturas historicas por TxnDate en segundo plano.
  - body opcional: `developerMode=true` → relaja validaciones FTP para desarrollo.

### 3.2 OAuth QBO

- `GET /api/company/integrations/qbo-r365/oauth/start`
  - inicia OAuth con Intuit. Devuelve `authorizeUrl`.
- `GET /api/company/integrations/qbo-r365/oauth/callback`
  - callback OAuth. Persiste access + refresh token.

### 3.3 Facturas

- `POST /api/company/integrations/qbo-r365/fetch-by-docnumber`
  - body: `{ docNumber: string }`
  - trae una factura o nota de credito de QBO por su numero de documento;
  - la persiste en `qbo_unified_invoices` con `import_source='manual'`;
  - si ya existia, actualiza `raw_entity`;
  - response: `{ entityId, entityType, docNumber, alreadyExisted: boolean }`.
- `POST /api/company/integrations/qbo-r365/send-unified-invoice`
  - body: `{ unifiedInvoiceId: string (UUID) }`
  - envia al FTP de R365 cualquier factura del historial unificado (webhook, manual o sync);
  - lee `raw_entity` y ejecuta el mapping en tiempo real;
  - response: `{ uploaded, fileName, runId }`.

### 3.4 Dashboard

- `GET /api/company/integrations/qbo-r365/dashboard`
  - retorna cards de estado, corridas e historial unificado de facturas.

### 3.5 Webhooks y cron

- `POST /api/webhooks/qbo` (o equivalente configurado en Intuit)
  - recibe notificaciones push de QBO; ejecuta doble ruta de procesamiento inmediato.
- `GET|POST /api/webhooks/cron/qbo-r365-sync`
  - cron de recovery del pipeline; procesa facturas en `en_cola`, `capturada` o `mapeada`;
  - requiere `Authorization: Bearer <CRON_SECRET>`;
  - se dispara automaticamente en cada webhook recibido (self-trigger) y una vez al dia por schedule.

### 3.6 Nuevos endpoints

- `POST /api/company/integrations/qbo-r365/map-unified-invoice`
  - mapea en tiempo real una factura del historial sin enviarla al FTP.
- `GET /api/company/integrations/qbo-r365/preview-unified-invoice-csv`
  - devuelve el CSV generado para una factura del historial unificado (preview).

---

## 4) Templates soportados

`template` en sync config soporta:

- `by_item`
- `by_item_service_dates`
- `by_account`
- `by_account_service_dates`

### 4.1 Headers oficiales implementados

#### by_item

`Vendor,Location,Document Number,Date,Gl Date,Vendor Item Number,Vendor Item Name,UofM,Qty,Unit Price,Total,Break Flag`

#### by_item_service_dates

`Vendor,Location,Document Number,Date,Gl Date,Vendor Item Number,Vendor Item Name,UofM,Qty,Unit Price,Total,Break Flag,Start Date of Service,End Date of Service`

#### by_account

`Type,Location,Vendor,Number,Date,Gl Date,Amount,Payment Terms,Due Date,Comment,Detail Account,Detail Amount,Detail Location,Detail Comment`

#### by_account_service_dates

`Type,Location,Vendor,Number,Date,Gl Date,Amount,Payment Terms,Due Date,Comment,Detail Account,Detail Amount,Detail Location,Detail Comment,Start Date of Service,End Date of Service`

---

## 5) Operaciones desde el dashboard

### 5.1 Buscar factura por DocNumber (flujo manual)

1. Ir a la seccion de busqueda del dashboard.
2. Ingresar el DocNumber de la factura en QBO.
3. El sistema la trae, la almacena como `import_source='manual'` y la muestra en el historial unificado.
4. Hacer click en la factura → panel lateral → `Enviar a R365`.

### 5.2 Enviar factura individual

- Disponible para cualquier factura en el historial unificado (webhook, manual o sync).
- Si `pipeline_status` ya es `enviada`, el boton aparece como "Ya enviada" y queda deshabilitado.
- El sistema ejecuta el mapping completo en tiempo real desde `raw_entity` y sube el CSV al FTP.

### 5.3 Backfill historico

- Al crear la sync config, enviar `backfillFromDate: "YYYY-MM-DD"` en el body.
- El sistema importa facturas cuyo `TxnDate` sea mayor o igual a esa fecha.
- El backfill corre en segundo plano; las facturas aparecen en el historial con `import_source='sync'`.

---

## 6) Deduplica e idempotencia

- `qbo_unified_invoices` tiene UNIQUE por `(organization_id, entity_id, entity_type)`.
- Si una factura ya existe, `fetch-by-docnumber` actualiza el `raw_entity` y retorna `alreadyExisted=true`.
- El pipeline de sync no crea filas duplicadas gracias al UPSERT con la misma constraint.

---

## 7) Convencion de nombre de archivo CSV (R365)

| Tipo de envio | Formato del archivo |
|---|---|
| Sync batch (multiples invoices) | `{file_prefix}_{YYYYMMDD}_{HHMMSS}.csv` |
| Invoice individual | `{vendor}_{INV}{numero}_{YYYYMMDD}_{HHMMSS}.csv` |

Ejemplos:
- `PRODEL_20260518_143022.csv`
- `PRODEL_DISTRIBUTION_INV50589_20260518_143022.csv`

---

## 8) Checklist de credenciales requeridas

Variables de entorno:

- `INTEGRATIONS_ENCRYPTION_KEY`
- `QBO_OAUTH_STATE_SECRET`
- `CRON_SECRET` (para el scheduler)

En sync config (por organizacion):

- QBO: `clientId`, `clientSecret`, `redirectUri`, OAuth completado, `realmId`
- R365 FTP: `host`, `port`, `username`, `password`, `remotePath`, `secure`
- R365 config: `r365VendorName`, `r365Location`, `qboCustomerId`, `template`, `taxMode`

---

## 9) Estados y accion recomendada

### 9.1 Estado de pipeline por factura

- `en_cola` — upsert inicial recibido; se procesa en segundos via doble ruta (ruta rapida + self-trigger cron); si persiste en este estado, verificar que haya una sync config activa para ese customer.
- `capturada` — datos en DB; lista para mapear y enviar; el cron la procesa en el siguiente ciclo.
- `mapeada` — lista para enviar al FTP; el cron la envia en el siguiente ciclo.
- `enviada` — ya en R365; no reenviar. Nota: R365 consume y elimina el archivo del FTP despues de importarlo; no buscarlo en FTP una vez enviado.

### 9.2 Estado de corrida (integration_runs)

- `completed` — sin accion.
- `completed_with_errors` — revisar detalles, mapping o duplicados.
- `failed` — revisar error y ejecutar reintento controlado.

### 9.3 Estado de item (integration_run_items)

- `uploaded` / `validated` — enviado correctamente.
- `exported` — preparado sin envio.
- `skipped_duplicate` — saltado por dedupe.
- `failed_validation` — corregir mapping/dato origen.
- `failed_delivery` — revisar FTP/red.

---

## 10) Troubleshooting rapido

### Caso A - Factura no aparece en historial unificado

1. Si viene de webhook: verificar que el webhook este configurado en Intuit con la URL correcta y que el evento `Emailed` este habilitado (son los unicos eventos activos).
2. Si es manual: usar `fetch-by-docnumber` con el DocNumber exacto de QBO.
3. Si es backfill: verificar que `backfillFromDate` sea anterior a la fecha de la factura.
4. Si el webhook llego pero la factura no se proceso (quedo en `en_cola`): verificar que el customer de esa factura tenga una sync config activa.

### Caso G - Factura en `en_cola` sin sync config

Si una factura de un determinado customer queda en `en_cola` y no avanza, es probable que ese customer no tenga sync config configurada. La solucion es crear la sync config para ese customer en el dashboard → "Crear sincronizacion". Una vez configurada, el cron de recovery la procesa en el siguiente ciclo.

### Caso B - `UNMAPPED_ITEM` o `UNMAPPED_ACCOUNT`

1. Revisar template activo en sync config.
2. En `by_item`, validar `ItemRef` en la linea de QBO.
3. En `by_account`, validar `AccountRef` en la linea de QBO.
4. Completar mapping por tenant si aplica.

### Caso C - Archivo sube pero R365 no importa

1. Revisar `APImports/R365/ErrorLog` (si hay errores de importacion).
2. Nota: R365 elimina los archivos del FTP despues de importarlos; `APImports/R365/Processed` puede estar vacio si R365 ya los consumio. Eso es comportamiento normal.
3. Descargar CSV desde ErrorLog si aparece.
4. Validar orden exacto de columnas segun template.
5. Corregir y reenviar usando `send-unified-invoice`.

### Caso H - CreditMemo con montos incorrectos en R365

Los Credit Memos se mapean con montos negativos en el CSV (convension de R365 para notas de credito de proveedor). Si R365 reporta un monto incorrecto, verificar que el `transactionTypeCode` sea `"2"` en el CSV generado y que los `Amount` sean negativos.

### Caso D - OAuth redirige mal

- Validar `proxy.ts` y callback del modulo.
- Confirmar `redirectUri` exacta y en entorno correcto (Development/Production).

### Caso E - FTP rechaza upload

- Validar `host`, `port`, `username`, `password`, `remotePath`, `secure`.
- Confirmar que el remote path exista en el servidor FTP.
- Intentar conexion manual desde herramienta FTP externa.

### Caso F - Backfill no importa las facturas esperadas

- Verificar que la fecha en `backfillFromDate` sea en formato `YYYY-MM-DD`.
- El backfill filtra por `TxnDate` (fecha de la factura), no por fecha de modificacion.
- Confirmar que las facturas en QBO tengan un `TxnDate` >= la fecha indicada.

---

## 11) Comandos de soporte recomendados

Desde `web/`:

```bash
npm run verify:qbo-r365-readiness
npm run lint
npm run build
```

---

## 12) Evidencia minima por incidente

- `run_id` o `unified_invoice_id`
- tenant / organization_id
- import_source de la factura afectada
- pipeline_status al momento del error
- template y tax_mode usados
- archivo generado (si aplica)
- error detalle
- accion aplicada
- resultado final

---

## Control de cambios

- v1: runbook operativo inicial.
- v2: incluye modo developer por etapas, exportes, 4 templates oficiales y dedupe por factura.
- v3: agrega convencion de nombre de archivo segun estandar R365.
- v4: arquitectura reescrita para flujo webhook-first con historial unificado (`qbo_unified_invoices`); elimina referencias a Sync Now / Dry Run; agrega sync configs por organizacion, flujo manual por DocNumber, envio individual desde historial, backfill por TxnDate y nuevos endpoints.
- v5: procesamiento por doble ruta (ruta rapida + self-trigger cron); `await upsert` como fix de race condition; multiples sync configs por organizacion (una por customer); solo evento `Emailed` activo en Intuit; nuevos endpoints `map-unified-invoice` y `preview-unified-invoice-csv`; comportamiento FTP de R365 (consume y elimina archivos); convencion CreditMemo con montos negativos; caso G (factura en cola sin sync config); caso H (CreditMemo montos).

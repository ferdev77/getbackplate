# DOC_ID: PRODUCT_PHASE_QBO_R365_TECH_SPEC_V4
# DOC_LEVEL: ARQUITECTURA_TECNICA
# PHASE_NAMESPACE: PRODUCT_PHASE
# SOURCE_OF_TRUTH_FOR: arquitectura, modelo de datos y contratos tecnicos de integracion QBO -> R365

# Especificacion Tecnica

## Integracion QuickBooks Online -> Restaurant365 (AP Imports)

## 1) Objetivo tecnico

Definir una arquitectura multi-tenant, auditable y resiliente para capturar facturas de proveedores desde QuickBooks Online (QBO), transformarlas al formato `Restaurant365 Multi-Invoice` y entregarlas por FTP al entorno de importacion de Restaurant365 (R365).

---

## 2) Principios de diseno

- aislamiento estricto por tenant;
- idempotencia por factura (UNIQUE en historial unificado);
- observabilidad completa por corrida y por item;
- seguridad por defecto (credenciales cifradas y minimo privilegio);
- recuperacion operativa (reintentos y cola de revisiones manuales);
- configuracion por cliente sin hardcode funcional;
- historial unificado independiente del canal de ingreso (webhook, manual, sync).

---

## 3) Arquitectura logica

### 3.1 Flujo de datos general

```
QBO Webhook (evento Emailed)
        │
        ├─► qbo_webhook_events
        │
        ├─► await upsert: qbo_unified_invoices (en_cola)
        │
        ├─► Ruta rapida (background): fetch QBO → raw_entity → mapping → FTP → enviada
        │
        └─► Ruta confiable (self-trigger): POST /cron/qbo-r365-sync (nueva invocacion serverless)

Cron diario ──► processQboUnifiedQueue (red de seguridad para facturas atascadas)

Busqueda DocNumber ──► qbo_unified_invoices (import_source='manual') ──► Envio individual ──► R365 FTP

Backfill historico ──► qbo_unified_invoices (import_source='sync') ──► Envio individual ──► R365 FTP
```

### 3.2 Componentes

1. `connector_qbo`
   - maneja OAuth 2.0 y refresh token;
   - consulta facturas en modo incremental (`MetaData.LastUpdatedTime`) o historico (`TxnDate`).
2. `transformer_r365`
   - normaliza datos de QBO desde `raw_entity`;
   - aplica mapping por tenant y sync config;
   - genera filas `Multi-Invoice`.
3. `delivery_ftp`
   - sube archivo al FTP de R365;
   - retorna confirmacion de entrega tecnica.
4. `webhook_processor`
   - recibe notificaciones push de QBO;
   - captura entidades en `qbo_unified_invoices`.
5. `sync_orchestrator`
   - ejecuta corridas diarias automaticas;
   - gestiona estados, reintentos y dedupe.
6. `monitoring_audit`
   - persiste logs de corrida e item;
   - expone metricas para panel operativo.

### 3.3 Flujo tecnico end-to-end (webhook-based)

Solo el evento `Emailed` de QBO esta configurado (Invoice y CreditMemo). Los eventos Create y Update estan desactivados intencionalmente.

1. QBO notifica evento `Emailed` via webhook a `POST /api/webhooks/qbo`;
2. sistema valida firma `intuit-signature` y persiste en `qbo_webhook_events`;
3. `await upsert` en `qbo_unified_invoices` con `pipeline_status='en_cola'` e `import_source='webhook'`; el `await` garantiza que la fila exista antes de iniciar cualquier procesamiento (fix de race condition);
4. sin bloquear la respuesta HTTP, se disparan dos rutas en paralelo:
   - **Ruta rapida**: `void fetchAndCaptureWebhookInvoice(...)` — consulta entidad completa a QBO, guarda `raw_entity` (`capturada`), busca sync config activa para ese customer, ejecuta `mapAndSendUnifiedRow` → `normalizeQboRows` → `buildR365Csv` → `uploadCsvToFtp` → `pipeline_status='enviada'`;
   - **Ruta confiable**: `void fetch(.../cron/qbo-r365-sync, { method: 'POST' })` — invocacion serverless nueva e independiente; procesa cualquier factura que la ruta rapida no haya podido completar;
5. si no hay sync config activa para el customer de esa factura, la fila queda en `en_cola` hasta que se configure;
6. el cron diario (`processQboUnifiedQueue`) actua como ultima red de seguridad para facturas que no avanzaron.

### 3.4 Flujo manual (DocNumber)

1. usuario ingresa DocNumber en el dashboard;
2. sistema consulta QBO y encuentra Invoice o CreditMemo;
3. persiste en `qbo_unified_invoices` con `import_source='manual'` y `raw_entity` completo;
4. usuario hace click en "Enviar a R365";
5. sistema lee `raw_entity`, ejecuta mapping completo en tiempo real y sube CSV al FTP.

### 3.5 Flujo backfill historico

1. al crear sync config, se proporciona `backfillFromDate` (YYYY-MM-DD);
2. sistema consulta QBO filtrando por `TxnDate >= backfillFromDate` (no por `LastUpdatedTime`);
3. upsert masivo en `qbo_unified_invoices` con `import_source='sync'`;
4. el backfill corre en segundo plano, sin bloquear la creacion de la config.

---

## 4) Modelo de datos

### 4.1 Tablas principales

#### `qbo_r365_sync_configs`

En el comportamiento actual del endpoint de alta, se permite una sola sync config por organizacion (si ya existe, responde `409`).

| columna | tipo | descripcion |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK a organizaciones |
| qbo_customer_id | text | ID del customer en QBO para filtrar facturas |
| r365_vendor_name | text | nombre del vendor tal como aparece en R365 |
| r365_location | text | location de R365 para el template |
| template | text | `by_item` / `by_account` / variantes service_dates |
| tax_mode | text | `none` / `line` / `header` |
| r365_ftp_host | text | host FTP de R365 (cifrado) |
| r365_ftp_port | int | puerto FTP |
| r365_ftp_username | text | usuario FTP (cifrado) |
| r365_ftp_password | text | password FTP (cifrado) |
| r365_ftp_remote_path | text | path remoto FTP |
| r365_ftp_secure | bool | TLS habilitado |
| schedule_interval | text | `daily` (unico valor actual) |
| is_active | bool | config activa |
| created_by | uuid | usuario creador |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `qbo_unified_invoices`

Historial unificado de todas las facturas procesadas, independientemente del canal de ingreso.

| columna | tipo | descripcion |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK |
| sync_config_id | uuid | FK a qbo_r365_sync_configs |
| entity_id | text | ID de la entidad en QBO |
| entity_type | text | `Invoice` o `CreditMemo` |
| doc_number | text | numero de factura en QBO |
| txn_date | date | fecha de la factura (TxnDate de QBO) |
| import_source | text | `sync` / `webhook` / `manual` — CHECK constraint |
| pipeline_status | text | `en_cola` / `capturada` / `mapeada` / `enviada` |
| raw_entity | jsonb | entidad QBO completa (base del mapping en tiempo real) |
| sent_at | timestamptz | timestamp de envio a R365 |
| run_id | uuid | FK a integration_runs (ultima corrida que la proceso) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

UNIQUE: `(organization_id, entity_id, entity_type)` — garantiza idempotencia entre ruta rapida y ruta confiable (ambas hacen upsert con `ignoreDuplicates: true`).

#### `qbo_webhook_events`

Almacena los payloads crudos de notificaciones push de QBO.

| columna | tipo | descripcion |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK |
| payload | jsonb | payload crudo del webhook de Intuit |
| status | text | `captured` = recibido sin procesar; `imported_manual` = procesado por fetchAndCaptureWebhookInvoice |
| created_at | timestamptz | |

#### `integration_runs`

Una fila por corrida de sincronizacion (manual, automatica o individual).

| columna | tipo | descripcion |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK |
| sync_config_id | uuid | FK |
| status | text | `queued` / `running` / `completed` / `completed_with_errors` / `failed` |
| run_type | text | `scheduled` / `manual` / `single_invoice` |
| file_name | text | nombre del CSV generado |
| uploaded_count | int | facturas subidas exitosamente |
| skipped_count | int | saltadas (duplicadas u otras) |
| failed_count | int | fallidas |
| started_at | timestamptz | |
| completed_at | timestamptz | |

#### `integration_run_items`

Una fila por linea/factura procesada en una corrida.

| columna | tipo | descripcion |
|---|---|---|
| id | uuid | PK |
| run_id | uuid | FK a integration_runs |
| source_invoice_id | text | entity_id en QBO |
| status | text | `uploaded` / `skipped_duplicate` / `failed_validation` / `failed_delivery` |
| dedupe_key | text | clave de deduplicacion por linea |
| mapped_code | text | codigo mapeado R365 |
| error_detail | text | mensaje de error (si aplica) |

#### `integration_mappings`

Reglas de mapping QBO → R365 por organizacion.

| columna | tipo | descripcion |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK |
| qbo_ref_id | text | ItemRef o AccountRef de QBO |
| r365_code | text | codigo destino en R365 |
| is_active | bool | |

### 4.2 Estados canonicos

`qbo_unified_invoices.pipeline_status`:
- `en_cola` — webhook recibido, pendiente de procesar
- `capturada` — datos completos almacenados en raw_entity
- `mapeada` — transformacion R365 completada
- `enviada` — CSV subido al FTP de R365

`qbo_unified_invoices.import_source` (CHECK constraint):
- `sync` — pipeline diario o backfill historico
- `webhook` — captura automatica por notificacion push
- `manual` — busqueda individual por DocNumber

`integration_runs.status`:
- `queued`
- `running`
- `completed`
- `completed_with_errors`
- `failed`
- `cancelled`

`integration_run_items.status`:
- `detected`
- `mapped`
- `validated`
- `exported`
- `uploaded`
- `skipped_duplicate`
- `failed_validation`
- `failed_delivery`
- `needs_review`

---

## 5) Idempotencia y control de duplicados

### 5.1 Nivel factura (qbo_unified_invoices)

- UNIQUE `(organization_id, entity_id, entity_type)`.
- Upserts con `ignoreDuplicates: true` no crean filas duplicadas ni sobrescriben filas existentes.
- El `await upsert` inicial garantiza que la fila exista antes de que la ruta rapida intente actualizarla (fix de race condition).
- Una factura con `pipeline_status='enviada'` muestra el boton de envio deshabilitado en UI.

### 5.2 Nivel linea (integration_run_items)

- `dedupe_key = organization_id + entity_id + line_signature`.
- Lineas ya enviadas se marcan `skipped_duplicate` en corridas posteriores.

---

## 6) Filtros de fecha en QBO Query API

Dos modos mutuamente excluyentes:

| Modo | Parametro | Clausula SQL QBO | Uso |
|---|---|---|---|
| Incremental | `sinceIso` | `WHERE MetaData.LastUpdatedTime >= '...'` | webhook/sync incremental |
| Historico | `txnDateFrom` | `WHERE TxnDate >= 'YYYY-MM-DD'` | backfill por fecha de factura |

El backfill usa exclusivamente `txnDateFrom` para garantizar que "importar desde el 1 de enero" traiga facturas con fecha 1-ene en adelante, no facturas modificadas ese dia.

---

## 7) Seguridad

- OAuth 2.0 para QBO (access token corto + refresh token persistido cifrado).
- Credenciales FTP cifradas con `INTEGRATIONS_ENCRYPTION_KEY` (AES-256).
- Redaccion de secretos en logs.
- Trazabilidad de acciones sensibles (connect/disconnect/sync/send).
- Controles de acceso: solo `company_admin` puede acceder al modulo de settings.

---

## 8) Observabilidad y soporte

Metricas minimas:

- corridas por dia;
- tasa de exito/fallo;
- facturas en cada estado del pipeline;
- top errores por codigo.

Trazas minimas por corrida:

- tenant / organization_id;
- import_source de las facturas procesadas;
- archivo CSV generado y nombre;
- resultado de upload FTP;
- resumen de errores.

---

## 9) Compatibilidad con R365 Multi-Invoice

Lineamientos aplicados:

- archivo CSV compatible con `EDI 810`;
- upload en FTP dedicado de R365;
- soporte de `AP Invoice` y `AP Credit Memo` (los Credit Memos se mapean con montos negativos; `transactionTypeCode: "2"`);
- consistencia de columnas de cabecera por linea;
- detalle por item/cuenta segun template acordado;
- soporte de variantes con service dates;
- R365 consume y elimina los archivos del FTP despues de importarlos — no buscarlos en el directorio FTP post-envio;
- procedimientos de troubleshooting en `APImports/R365/ErrorLog` (Processed puede estar vacio si R365 ya proceso todo).

---

## 10) Riesgos tecnicos y mitigaciones

1. cambios de template R365 — mitigacion: versionado de mapping por tenant.
2. drift entre sandbox y prod — mitigacion: bateria de pruebas en ambos entornos.
3. datos incompletos en QBO — mitigacion: `raw_entity` almacenado; se puede re-mapear en cualquier momento.
4. credenciales expiradas — mitigacion: health checks y alertas tempranas.
5. fallo en procesamiento de webhook — mitigacion: doble ruta (ruta rapida + self-trigger cron independiente) + cron diario como ultima red de seguridad; si todo falla, flujo manual por DocNumber como fallback final.
6. no hay sync config para un customer — mitigacion: factura queda en `en_cola`; se procesa automaticamente cuando se cree la sync config del customer.

---

## 11) Estado actual implementado

### 11.1 Flujos activos

- Captura automatica: QBO Webhooks (solo evento `Emailed`) → `qbo_webhook_events` → doble ruta inmediata (ruta rapida + self-trigger cron) → R365 FTP. El cron diario actua como ultima red de seguridad.
- Captura manual: busqueda por DocNumber → `qbo_unified_invoices` → envio individual.
- Backfill historico: al crear sync config con `backfillFromDate` → filtra por `TxnDate` → `import_source='sync'`.
- Envio individual: cualquier factura en historial unificado → `send-unified-invoice`.
- Sync config unica: cada organizacion hoy opera con una sola sync config (restriccion efectiva del endpoint de alta).

### 11.2 Idempotencia activa

- UNIQUE `(organization_id, entity_id, entity_type)` en `qbo_unified_invoices`.
- Dedupe por linea via `dedupe_key` en `integration_run_items`.

### 11.3 Trazabilidad activa

- Historial unificado en `qbo_unified_invoices` con `pipeline_status` y `import_source`.
- Historial de corridas en `integration_runs`.
- Historial de items en `integration_run_items`.
- Audit logs en `integration_audit_logs`.

---

## Control de cambios

- v1: especificacion tecnica inicial para construccion del modulo.
- v2: incorpora templates con service dates, estado implementado y dedupe por factura.
- v3: reescritura para arquitectura webhook-first con historial unificado; agrega `qbo_unified_invoices`, `qbo_r365_sync_configs`, `qbo_webhook_events`; documenta pipeline de estados, import_source, filtros de fecha TxnDate vs MetaData, flujo manual por DocNumber y backfill historico.
- v4: procesamiento por doble ruta (ruta rapida background + self-trigger cron independiente); `await upsert` como fix de race condition; solo evento `Emailed` configurado; esquema actualizado de `qbo_webhook_events` (campo `status`); comportamiento FTP de R365 (consume y elimina archivos); CreditMemo con montos negativos; riesgos actualizados.
- v5: alineacion a comportamiento actual en codigo: sync config unica por organizacion y tax mode `line|header|none`.

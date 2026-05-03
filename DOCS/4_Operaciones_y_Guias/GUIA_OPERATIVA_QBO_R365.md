# DOC_ID: OPERATIONS_RUNBOOK_QBO_R365_V2
# DOC_LEVEL: GUIA_OPERATIVA
# PHASE_NAMESPACE: OPERATIONS_RUNBOOK
# SOURCE_OF_TRUTH_FOR: operacion diaria, troubleshooting y soporte de integracion QBO -> R365

# Guia Operativa

## Integracion QuickBooks Online -> Restaurant365

## 1) Objetivo

Definir operacion diaria, flujo operativo y flujo developer del modulo QBO -> R365 con trazabilidad por corrida y por factura.

## 2) Modos de uso en UI

### 2.1 Modo Operacion

- pensado para uso diario de negocio;
- acciones principales:
  - `Sync Now` (corrida real con envio FTP);
  - `Dry Run` (simulacion sin envio FTP);
- incluye historial de corridas e historial de facturas.

### 2.2 Modo Developer

- pensado para validar etapas separadas;
- acciones principales:
  - `1) Traer datos QBO` (prepare, sin envio);
  - `2) Ver preview` (raw + mapped);
  - `3) Enviar a R365` (envio explicito de corrida preparada);
- exportes por corrida: `RAW`, `JSON`, `CSV`, `TXT`.

## 3) Endpoints operativos del modulo

- `GET /api/company/integrations/qbo-r365/config`
  - snapshot de configuracion.
- `PUT /api/company/integrations/qbo-r365/config`
  - guarda credenciales y settings.
- `GET /api/company/integrations/qbo-r365/oauth/start`
  - inicia OAuth con Intuit.
- `GET /api/company/integrations/qbo-r365/oauth/callback`
  - callback OAuth.
- `POST /api/company/integrations/qbo-r365/sync`
  - corrida manual (`dryRun=true|false`).
- `POST /api/company/integrations/qbo-r365/prepare`
  - etapa 1 developer (trae y prepara).
- `GET /api/company/integrations/qbo-r365/preview?runId=...`
  - etapa 2 developer (vista previa).
- `POST /api/company/integrations/qbo-r365/send`
  - etapa 3 developer (envio FTP).
- `GET /api/company/integrations/qbo-r365/export?runId=...&format=raw|json|csv|txt`
  - export de corrida.
- `GET /api/company/integrations/qbo-r365/dashboard`
  - cards, corridas e historial de facturas.
- `GET /api/company/integrations/qbo-r365/runs`
  - historial de corridas (API).
- `GET /api/webhooks/cron/qbo-r365-sync`
  - scheduler/reintentos (requiere `Authorization: Bearer <CRON_SECRET>`).

## 4) Templates soportados

`integration_settings.qbo_r365_template` soporta:

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

## 5) Duplicados e idempotencia

### 5.1 Dedupe por linea

- se usa `dedupe_key` por linea normalizada;
- lineas ya enviadas/validadas se marcan `skipped_duplicate`.

### 5.2 Dedupe por factura (regla activa)

- si `source_invoice_id` ya fue enviada (`uploaded` o `validated`), no se reenvia en corridas nuevas;
- se registra como `skipped_duplicate` con razon de factura ya enviada;
- objetivo: evitar doble envio de una misma factura a R365.

## 6) Historial de Facturas

El panel muestra una tabla consolidada por `source_invoice_id` con:

- factura (`invoiceNumber` o `sourceInvoiceId`);
- vendor;
- estado mas reciente;
- enviada a R365 (`Si/No`);
- template usado;
- mapped code;
- veces vista;
- ultima vez.

## 7) Checklist de credenciales requeridas

Aplicacion:

- `INTEGRATIONS_ENCRYPTION_KEY`
- `QBO_OAUTH_STATE_SECRET`
- `CRON_SECRET` (si se usa scheduler)

QuickBooks Online:

- `clientId`
- `clientSecret`
- `redirectUri` registrada exactamente en Intuit
- OAuth completado con refresh token persistido
- `realmId`

Restaurant365 FTP:

- `host`
- `port`
- `username`
- `password`
- `remotePath`
- `secure`

## 8) Estados y accion recomendada

### 8.1 Estado de corrida

- `completed`: sin accion.
- `completed_with_errors`: revisar detalles, mapping o duplicados.
- `failed`: revisar error y ejecutar reintento controlado.

### 8.2 Estado de item

- `uploaded` / `validated`: enviado.
- `exported`: preparado sin envio (dry run o etapa developer).
- `skipped_duplicate`: saltado por dedupe (linea o factura).
- `failed_validation`: corregir mapping/dato origen.
- `failed_delivery`: revisar FTP/red.

## 9) Troubleshooting rapido

### Caso A - QBO conectado pero detectadas = 0

1. validar lookback (`incrementalLookbackHours`);
2. confirmar que existan Bills/Credits dentro de ventana por `LastUpdatedTime`;
3. ejecutar `Traer datos QBO` y revisar preview.

### Caso B - `UNMAPPED_ITEM` o `UNMAPPED_ACCOUNT`

1. revisar template activo;
2. en `by_item`, validar `ItemRef` en linea de QBO;
3. en `by_account`, validar `AccountRef` en linea de QBO;
4. completar mapping por tenant si aplica.

### Caso C - archivo sube pero R365 no importa

1. revisar `APImports/R365/Processed` y `APImports/R365/ErrorLog`;
2. descargar CSV desde ErrorLog;
3. validar orden exacto de columnas segun template;
4. corregir y reenviar.

### Caso D - OAuth redirige mal a auth/recovery

- validar middleware/proxy y callback del modulo;
- confirmar `redirectUri` exacta y en entorno correcto (Development/Production).

## 10) Comandos de soporte recomendados

Desde `web/`:

```bash
npm run verify:qbo-r365-readiness
npm run lint
npm run build
```

## 11) Evidencia minima por incidente

- `run_id`
- tenant
- template usado
- archivo generado
- error detalle
- accion aplicada
- resultado final

## Control de cambios

- v1: runbook operativo inicial.
- v2: incluye modo developer por etapas, exportes, 4 templates oficiales y dedupe por factura.

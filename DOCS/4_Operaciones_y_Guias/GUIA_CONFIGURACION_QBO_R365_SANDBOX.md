# DOC_ID: OPERATIONS_RUNBOOK_QBO_R365_SANDBOX_SETUP_V3
# DOC_LEVEL: GUIA_OPERATIVA
# PHASE_NAMESPACE: OPERATIONS_RUNBOOK
# SOURCE_OF_TRUTH_FOR: configuracion inicial y prueba sandbox de integracion QBO -> R365

# Guia de Configuracion Sandbox

## Integracion QuickBooks Online -> Restaurant365

## 1) Prerrequisitos

- migraciones de integracion aplicadas;
- usuario `company_admin` del tenant de prueba;
- variables de entorno cargadas:
  - `INTEGRATIONS_ENCRYPTION_KEY`
  - `QBO_OAUTH_STATE_SECRET`
  - `CRON_SECRET`

Migraciones relevantes:

- `20260426150000_qbo_r365_integration_foundation.sql`
- `20260427010000_qbo_r365_template_variants.sql`
- `20260505000001_qbo_r365_sync_configs.sql`
- `20260517000001_qbo_r365_sync_configs_vendor_name.sql`
- `20260517000002_qbo_r365_sync_configs_location.sql`
- `20260519000001_qbo_webhook_events.sql`
- `20260520000002_qbo_unified_invoices.sql`
- `20260520000003_qbo_unified_invoices_import_source_manual.sql`

Generacion rapida de secrets (dev):

```bash
node -e "const c=require('crypto'); console.log('INTEGRATIONS_ENCRYPTION_KEY='+c.randomBytes(32).toString('hex')); console.log('QBO_OAUTH_STATE_SECRET='+c.randomBytes(32).toString('hex')); console.log('CRON_SECRET='+c.randomBytes(32).toString('hex'));"
```

Reiniciar servidor local (`npm run dev`) luego de editar `.env.local`.

---

## 2) Credenciales necesarias

QuickBooks Online sandbox (credenciales globales de plataforma):

- `QBO_CLIENT_ID`
- `QBO_CLIENT_SECRET`
- `QBO_REDIRECT_URI`

Restaurant365 FTP:

- `host`
- `port`
- `username`
- `password`
- `remotePath`
- `secure`

R365 configuracion por org:

- `r365VendorName` — nombre del vendor tal como aparece en R365
- `r365Location` — location de R365
- `qboCustomerId` — ID del customer en QBO (para filtrar facturas)
- `template` — `by_item` / `by_account` / variantes
- `taxMode` — `none` / `line` / `header`

---

## 3) Redirect URI exacta

Local:

- `http://localhost:3000/api/company/integrations/qbo-r365/oauth/callback`

Debe coincidir exactamente entre Intuit y la configuracion de la app.

---

## 4) Flujo UI recomendado

1. Ir a `/app/integrations/quickbooks`.
2. Crear sync config desde "Configurar" (o via API — ver seccion 5.1).
3. Click `Conectar QBO` y completar OAuth sandbox.
4. Confirmar estado `Conectado` y `realmId` visible.
5. Hacer backfill inicial: crear sync config con `backfillFromDate` o dispararlo manualmente.
6. Verificar facturas en historial unificado.
7. Probar envio individual: seleccionar factura → "Enviar a R365".

---

## 5) Flujo API equivalente

### 5.1 Crear sync config

`POST /api/company/integrations/qbo-r365/sync-configs`

```json
{
  "qboCustomerId": "<QBO_CUSTOMER_ID>",
  "r365VendorName": "Prodel Distribution",
  "r365Location": "Main",
  "template": "by_item",
  "taxMode": "none",
  "r365FtpHost": "ftp.r365.com",
  "r365FtpPort": 21,
  "r365FtpUsername": "<FTP_USER>",
  "r365FtpPassword": "<FTP_PASSWORD>",
  "r365FtpRemotePath": "/APImports/R365",
  "r365FtpSecure": true,
  "backfillFromDate": "2026-01-01"
}
```

Para entorno dev (sin FTP real), agregar `"developerMode": true` — relaja validaciones FTP.

Devuelve: `{ id: "<UUID>", backfilling: true }`.

Solo se permite una sync config por organizacion (409 si ya existe).

### 5.2 OAuth

```
GET /api/company/integrations/qbo-r365/oauth/start
```

Abrir la `authorizeUrl` que devuelve. Completar OAuth en Intuit. El callback persiste tokens.

### 5.3 Fetch manual de factura por DocNumber

`POST /api/company/integrations/qbo-r365/fetch-by-docnumber`

```json
{ "docNumber": "10589" }
```

Devuelve: `{ entityId, entityType, docNumber, alreadyExisted: boolean }`.

### 5.4 Envio individual de factura

`POST /api/company/integrations/qbo-r365/send-unified-invoice`

```json
{ "unifiedInvoiceId": "<UUID de qbo_unified_invoices>" }
```

Devuelve: `{ uploaded, fileName, runId }`.

### 5.5 Listar sync configs

```
GET /api/company/integrations/qbo-r365/sync-configs
```

Devuelve: `{ configs: [...] }`.

---

## 6) Templates oficiales soportados

- `by_item`
- `by_item_service_dates`
- `by_account`
- `by_account_service_dates`

---

## 7) Validacion en R365

Revisar carpetas FTP:

- `APImports/R365/Processed`
- `APImports/R365/ErrorLog`

Si hay error en import:

1. Descargar el CSV rechazado.
2. Comparar encabezados y orden con template oficial.
3. Validar `Mapped Code` y campos obligatorios.
4. Corregir mapping/template y reenviar con `send-unified-invoice`.

---

## 8) Criterio de exito sandbox

- OAuth conectado con refresh token persistido.
- Sync config creada (una por org).
- Backfill ejecutado: facturas visibles en historial con `import_source='sync'`.
- Fetch manual de DocNumber: factura visible con `import_source='manual'`.
- Envio individual exitoso: `pipeline_status='enviada'` y archivo en FTP Processed.
- Historial unificado visible con estados de pipeline correctos.

---

## 9) Troubleshooting rapido

- `redirect_uri invalido`: mismatch de URL exacta entre Intuit y app.
- `QBO_3100`: reconectar QBO o validar entorno sandbox/prod.
- `UNMAPPED_*`: cambiar template o completar mapping en `integration_mappings`.
- `Restaurant365 FTP no conectado`: completar host/user/password en sync config.
- `Esta empresa ya tiene una sincronizacion configurada` (409): eliminar la config existente antes de recrear.
- Factura no encontrada por DocNumber: verificar que el DocNumber exista en QBO y que el QBO customer ID en sync config coincida con la factura.

---

## Control de cambios

- v1: setup inicial.
- v2: incorpora flujo developer por etapas, exportes y 4 templates.
- v3: reescritura completa para arquitectura con sync configs; elimina endpoints obsoletos (`/sync`, `/prepare`, `/preview`, `/send`); agrega `fetch-by-docnumber`, `send-unified-invoice`, flujo backfill y nuevas migraciones.
- v4: alineacion a codigo actual: credenciales QBO globales (`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`), tax mode `line|header|none` y listado de migraciones actualizado.

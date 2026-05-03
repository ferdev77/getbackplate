# DOC_ID: OPERATIONS_RUNBOOK_QBO_R365_SANDBOX_SETUP_V2
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

Migraciones relevantes:

- `20260426150000_qbo_r365_integration_foundation.sql`
- `20260427010000_qbo_r365_template_variants.sql`

Generacion rapida (dev):

```bash
node -e "const c=require('crypto'); console.log('INTEGRATIONS_ENCRYPTION_KEY='+c.randomBytes(32).toString('hex')); console.log('QBO_OAUTH_STATE_SECRET='+c.randomBytes(32).toString('hex'));"
```

Reiniciar servidor local (`npm run dev`) luego de editar `.env.local`.

## 2) Credenciales necesarias

QuickBooks Online sandbox:

- `clientId`
- `clientSecret`
- `redirectUri`

Restaurant365 FTP:

- `host`
- `port`
- `username`
- `password`
- `remotePath`
- `secure`

## 3) Redirect URI exacta

Local:

- `http://localhost:3000/api/company/integrations/qbo-r365/oauth/callback`

Debe coincidir exactamente entre Intuit y la configuracion de la app.

## 4) Flujo UI recomendado (sin API manual)

1. ir a `/app/integrations/quickbooks`;
2. abrir `Configurar` y guardar credenciales QBO;
3. click `Conectar QBO` y completar OAuth sandbox;
4. confirmar estado `Conectado`;
5. en `Developer`:
   - `1) Traer datos QBO`
   - `2) Ver preview`
   - `3) Enviar a R365` (si FTP listo)

## 5) Flujo API equivalente

### 5.1 Guardar configuracion

`PUT /api/company/integrations/qbo-r365/config`

```json
{
  "qbo": {
    "clientId": "<QBO_CLIENT_ID>",
    "clientSecret": "<QBO_CLIENT_SECRET>",
    "redirectUri": "http://localhost:3000/api/company/integrations/qbo-r365/oauth/callback"
  },
  "settings": {
    "template": "by_account",
    "taxMode": "line",
    "timezone": "UTC",
    "filePrefix": "r365_multi_invoice",
    "incrementalLookbackHours": 720,
    "maxRetryAttempts": 3,
    "isEnabled": false
  }
}
```

### 5.2 OAuth

- `GET /api/company/integrations/qbo-r365/oauth/start`
- abrir `authorizeUrl`

### 5.3 Corridas

- `POST /api/company/integrations/qbo-r365/sync` (`{"dryRun":true}` o `false`)
- o modo developer por etapas:
  - `POST /api/company/integrations/qbo-r365/prepare`
  - `GET /api/company/integrations/qbo-r365/preview?runId=<RUN_ID>`
  - `POST /api/company/integrations/qbo-r365/send`

### 5.4 Export developer

- `GET /api/company/integrations/qbo-r365/export?runId=<RUN_ID>&format=raw`
- `GET /api/company/integrations/qbo-r365/export?runId=<RUN_ID>&format=json`
- `GET /api/company/integrations/qbo-r365/export?runId=<RUN_ID>&format=csv`
- `GET /api/company/integrations/qbo-r365/export?runId=<RUN_ID>&format=txt`

## 6) Templates oficiales soportados

- `by_item`
- `by_item_service_dates`
- `by_account`
- `by_account_service_dates`

## 7) Validacion en R365

Revisar carpetas FTP:

- `APImports/R365/Processed`
- `APImports/R365/ErrorLog`

Si hay error en import:

1. descargar el CSV rechazado;
2. comparar encabezados y orden con template oficial;
3. validar `Mapped Code` y campos obligatorios;
4. corregir mapping/template y reenviar.

## 8) Criterio de exito sandbox

- OAuth conectado con refresh token persistido;
- dry run exitoso con datos detectados;
- preview con `Mapped Code` coherente;
- corrida real con upload FTP exitoso;
- historial de corridas + historial de facturas visibles.

## 9) Troubleshooting rapido

- `redirect_uri invalido`: mismatch de URL exacta.
- `QBO_3100`: reconectar QBO o validar entorno sandbox/prod.
- `UNMAPPED_*`: cambiar template o completar mapping.
- `Restaurant365 FTP no conectado`: completar host/user/password.

## Control de cambios

- v1: setup inicial.
- v2: incorpora flujo developer por etapas, exportes y 4 templates.

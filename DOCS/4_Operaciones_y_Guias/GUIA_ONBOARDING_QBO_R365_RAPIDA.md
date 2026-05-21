# DOC_ID: OPERATIONS_RUNBOOK_QBO_R365_ONBOARDING_FAST_V2
# DOC_LEVEL: GUIA_OPERATIVA
# PHASE_NAMESPACE: OPERATIONS_RUNBOOK
# SOURCE_OF_TRUTH_FOR: onboarding rapido por rol para modulo QBO -> R365

# Onboarding Rapido QBO -> R365

## Objetivo

Dar una ruta de lectura corta, por rol, para entrar rapido al modulo QuickBooks -> Restaurant365.

---

## Lectura por rol

### 1) Si sos Developer

Leer en este orden:

1. `DOCS/1_Arquitectura_y_Contexto/PRODUCT_PHASE_QBO_R365_ESPECIFICACION_TECNICA.md`
2. `DOCS/2_Planes_y_Checklists/PRODUCT_PHASE_QBO_R365_MATRIZ_MAPEO_BASE.md`
3. `DOCS/4_Operaciones_y_Guias/GUIA_CONFIGURACION_QBO_R365_SANDBOX.md`
4. `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md`

Checklist rapido:

- entender el historial unificado (`qbo_unified_invoices`) y los tres `import_source` (webhook, manual, sync);
- entender los estados del pipeline: `en_cola → capturada → mapeada → enviada`;
- crear sync config con `POST /api/company/integrations/qbo-r365/sync-configs`;
- probar backfill con `backfillFromDate` y verificar facturas en historial;
- probar fetch manual con `POST /api/company/integrations/qbo-r365/fetch-by-docnumber`;
- probar envio individual con `POST /api/company/integrations/qbo-r365/send-unified-invoice`;
- entender los 4 templates y cuando usar cada uno;
- entender diferencia entre `txnDateFrom` (backfill) y `sinceIso` (incremental).

### 2) Si sos Operaciones

Leer en este orden:

1. `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md`
2. `DOCS/4_Operaciones_y_Guias/GUIA_CONFIGURACION_QBO_R365_SANDBOX.md`

Checklist rapido:

- revisar estado de conexion QBO (OAuth conectado);
- revisar estado de sync config (FTP configurado, vendor, location, template);
- revisar historial unificado: estados del pipeline por factura;
- buscar facturas por DocNumber cuando no aparecen automaticamente;
- usar "Enviar a R365" para envio individual de facturas capturadas;
- revisar `APImports/R365/Processed` y `APImports/R365/ErrorLog` en FTP.

### 3) Si sos Soporte

Leer en este orden:

1. `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md`
2. `DOCS/2_Planes_y_Checklists/PRODUCT_PHASE_QBO_R365_MATRIZ_MAPEO_BASE.md`

Checklist rapido:

- identificar si el problema es OAuth, sync config, mapping, FTP o webhook;
- identificar el `import_source` de la factura afectada (webhook / manual / sync);
- revisar `pipeline_status` actual de la factura;
- pedir `run_id` o `unified_invoice_id` para investigar;
- confirmar si ya fue enviada (`enviada`) o si quedó bloqueada (`capturada` o `mapeada`).

---

## Primeras 5 pruebas recomendadas (nuevo dev)

1. Crear sync config con `developerMode=true` y verificar que retorna `{ id }`.
2. OAuth QBO conectado y `realmId` visible en dashboard.
3. Backfill con fecha historica → verificar facturas en historial unificado con `import_source='sync'`.
4. Fetch manual de un DocNumber conocido → verificar `import_source='manual'` en historial.
5. Envio individual desde historial → verificar `pipeline_status='enviada'` y archivo en FTP.

---

## Errores comunes y accion inmediata

- `redirect_uri invalid`: corregir URI exacta en Intuit y app (debe coincidir exactamente).
- `QBO_3100`: reconectar QBO (sandbox/prod correcto).
- `UNMAPPED_ITEM` / `UNMAPPED_ACCOUNT`: cambiar template o completar mapping en la tabla `integration_mappings`.
- `FTP no conectado`: cargar host/user/password/secure/path en sync config.
- `Esta empresa ya tiene una sincronizacion configurada` (409): una organizacion solo puede tener una sync config.
- Factura no aparece en historial: verificar que webhook este activo o hacer fetch manual por DocNumber.
- Boton "Enviar a R365" aparece como "Ya enviada": `pipeline_status` ya es `enviada`; se puede verificar en la tabla.

---

## Control de cambios

- v1: guia de onboarding rapido por rol.
- v2: actualizada para arquitectura webhook-first con historial unificado; elimina referencias a Sync Now / Dry Run; agrega checklist para sync config, fetch manual, backfill y envio individual.

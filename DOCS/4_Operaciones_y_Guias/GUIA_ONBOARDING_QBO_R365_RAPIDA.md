# DOC_ID: OPERATIONS_RUNBOOK_QBO_R365_ONBOARDING_FAST_V1
# DOC_LEVEL: GUIA_OPERATIVA
# PHASE_NAMESPACE: OPERATIONS_RUNBOOK
# SOURCE_OF_TRUTH_FOR: onboarding rapido por rol para modulo QBO -> R365

# Onboarding Rapido QBO -> R365

## Objetivo

Dar una ruta de lectura corta, por rol, para entrar rapido al modulo QuickBooks -> Restaurant365.

## Lectura por rol

### 1) Si sos Developer

Leer en este orden:

1. `DOCS/1_Arquitectura_y_Contexto/PRODUCT_PHASE_QBO_R365_ESPECIFICACION_TECNICA.md`
2. `DOCS/2_Planes_y_Checklists/PRODUCT_PHASE_QBO_R365_MATRIZ_MAPEO_BASE.md`
3. `DOCS/4_Operaciones_y_Guias/GUIA_CONFIGURACION_QBO_R365_SANDBOX.md`
4. `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md`

Checklist rapido:

- entender 4 templates (`by_item`, `by_item_service_dates`, `by_account`, `by_account_service_dates`);
- validar dedupe por linea y por factura;
- correr flujo developer (`prepare -> preview -> send`);
- validar exportes (`raw/json/csv/txt`).

### 2) Si sos Operaciones

Leer en este orden:

1. `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md`
2. `DOCS/4_Operaciones_y_Guias/GUIA_CONFIGURACION_QBO_R365_SANDBOX.md`

Checklist rapido:

- revisar estado de conexiones QBO/FTP;
- usar `Dry Run` para validar sin impacto;
- usar `Sync Now` para corrida real;
- revisar historial de corridas e historial de facturas;
- revisar `APImports/R365/Processed` y `APImports/R365/ErrorLog`.

### 3) Si sos Soporte

Leer en este orden:

1. `DOCS/4_Operaciones_y_Guias/GUIA_OPERATIVA_QBO_R365.md`
2. `DOCS/2_Planes_y_Checklists/PRODUCT_PHASE_QBO_R365_MATRIZ_MAPEO_BASE.md`

Checklist rapido:

- identificar si el problema es OAuth, mapping, FTP o template;
- revisar `run_id`, estado de corrida y estado de item/factura;
- confirmar si aplica dedupe (factura ya enviada);
- pedir evidencia minima (archivo, error, accion, resultado).

## Primeras 5 pruebas recomendadas

1. OAuth QBO conectado y `realmId` visible.
2. `Dry Run` con detectadas > 0.
3. `Preview` sin errores de formato.
4. Export `CSV` y validacion de encabezados del template seleccionado.
5. Corrida real con archivo en `Processed` o diagnostico en `ErrorLog`.

## Errores comunes y accion inmediata

- `redirect_uri invalid`: corregir URI exacta en Intuit y app.
- `QBO_3100`: reconectar QBO (sandbox/prod correcto).
- `UNMAPPED_ITEM` / `UNMAPPED_ACCOUNT`: cambiar template o mapping.
- `FTP no conectado`: cargar host/user/password/secure/path.

## Control de cambios

- v1: guia de onboarding rapido por rol.

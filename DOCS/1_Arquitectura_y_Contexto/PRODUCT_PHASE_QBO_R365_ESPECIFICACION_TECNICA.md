# DOC_ID: PRODUCT_PHASE_QBO_R365_TECH_SPEC_V1
# DOC_LEVEL: ARQUITECTURA_TECNICA
# PHASE_NAMESPACE: PRODUCT_PHASE
# SOURCE_OF_TRUTH_FOR: arquitectura, modelo de datos y contratos tecnicos de integracion QBO -> R365

# Especificacion Tecnica

## Integracion QuickBooks Online -> Restaurant365 (AP Imports)

## 1) Objetivo tecnico

Definir una arquitectura multi-tenant, auditable y resiliente para extraer facturas de proveedores desde QuickBooks Online (QBO), transformarlas al formato `Restaurant365 Multi-Invoice` y entregarlas por FTP al entorno de importacion de Restaurant365 (R365).

## 2) Principios de diseno

- aislamiento estricto por tenant;
- idempotencia por factura y linea;
- observabilidad completa por corrida y por item;
- seguridad por defecto (credenciales cifradas y minimo privilegio);
- recuperacion operativa (reintentos y cola de revisiones manuales);
- configuracion por cliente sin hardcode funcional.

## 3) Arquitectura logica

### 3.1 Componentes

1. `connector_qbo`
   - maneja OAuth 2.0 y refresh token;
   - consulta facturas segun ventana incremental.
2. `transformer_r365`
   - normaliza datos de QBO;
   - aplica mapping por tenant;
   - genera filas `Multi-Invoice`.
3. `validator_r365`
   - valida estructura CSV, columnas obligatorias y reglas de negocio.
4. `delivery_ftp`
   - sube archivo al FTP de R365;
   - retorna confirmacion de entrega tecnica.
5. `sync_orchestrator`
   - ejecuta corridas manuales y automaticas;
   - gestiona estados, reintentos y dedupe.
6. `monitoring_audit`
   - persiste logs de corrida e item;
   - expone metricas para panel operativo.

### 3.2 Flujo tecnico end-to-end

1. se inicia corrida (`manual` o `scheduled`);
2. se obtiene contexto tenant + configuracion activa;
3. se leen facturas candidatas en QBO;
4. se filtra ya-procesado via `dedupe_key`;
5. se transforma a estructura `R365 Multi-Invoice`;
6. se valida archivo;
7. se publica CSV al FTP;
8. se registran resultados agregados y por item;
9. se cierra corrida con estado final.

## 4) Contratos de datos

### 4.1 Entidades propuestas

1. `integration_connections`
   - conexion por proveedor (`qbo`, `r365_ftp`), estado, secretos cifrados.
2. `integration_settings`
   - parametros operativos por tenant (template, timezone, ventana, tax_mode).
3. `integration_mappings`
   - mapping QBO -> R365 por campo y regla de transformacion.
4. `integration_runs`
   - una fila por corrida, con contadores y estado agregado.
5. `integration_run_items`
   - una fila por factura procesada, con detalle de resultado.
6. `integration_outbox_files`
   - metadatos de archivos generados/subidos (nombre, hash, ruta, tamano).
7. `integration_audit_logs`
   - eventos de operacion, seguridad y soporte.

### 4.2 Estados canonicos

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

## 5) Idempotencia y control de duplicados

### 5.1 Dedupe key recomendada

`dedupe_key = tenant_id + qbo_realm_id + qbo_invoice_id + qbo_invoice_line_signature`

### 5.2 Reglas

- no reenviar items con `uploaded` salvo forzado explicito;
- si cambia la factura origen, se versiona con nueva firma de linea;
- los reintentos no deben crear nuevas filas de negocio duplicadas.

## 6) Politica de reintentos

- errores transitorios (red/timeout/ftp temporal): reintentos automaticos;
- errores de validacion de datos: no reintentar automaticamente;
- techo de reintentos configurable por tenant;
- agotado el techo: mover a `needs_review` con diagnostico.

## 7) Seguridad

- OAuth 2.0 para QBO (access token corto + refresh token);
- credenciales FTP cifradas en repositorio seguro;
- redaccion de secretos en logs;
- trazabilidad de acciones sensibles (connect/disconnect/test/send/retry);
- controles RBAC para ejecutar sync manual y editar configuracion.

## 8) Observabilidad y soporte

Metricas minimas:

- corridas por dia;
- tasa de exito/fallo;
- tiempo promedio por corrida;
- items procesados/exportados/subidos;
- top errores por codigo.

Trazas minimas por corrida:

- tenant;
- origen y rango consultado;
- archivo generado;
- hash y tamano;
- resultado de upload;
- resumen de errores.

## 9) Compatibilidad con R365 Multi-Invoice

Lineamientos aplicados:

- archivo CSV compatible con `EDI 810`;
- upload en FTP dedicado de R365;
- soporte de `AP Invoice` y `AP Credit Memo`;
- consistencia de columnas de cabecera por linea;
- detalle por item/cuenta segun template acordado (`By Item` o `By Account`);
- soporte de variantes con service dates (`By Item with Service Dates`, `By Account with Service Dates`);
- procedimientos de troubleshooting en `APImports/R365/Processed` y `APImports/R365/ErrorLog`.

## 10) Riesgos tecnicos y mitigaciones

1. cambios de template R365
   - mitigacion: versionado de mapping por tenant.
2. drift entre sandbox y prod
   - mitigacion: bateria de pruebas en ambos entornos.
3. datos incompletos en QBO
   - mitigacion: validacion previa y cola de excepciones.
4. credenciales expiradas
   - mitigacion: health checks y alertas tempranas.

## 11) Definicion de listo para desarrollo

Se considera listo iniciar implementacion cuando exista:

- mapping inicial validado con cliente;
- definicion de template (`By Item`, `By Item with Service Dates`, `By Account`, `By Account with Service Dates`);
- accesos habilitados (QBO sandbox + R365 FTP de prueba);
- acuerdos de reintento, dedupe y politicas operativas.

## 12) Estado actual implementado

### 12.1 Flujos activos

- Operacion: `Dry Run` y `Sync Now`.
- Developer: `prepare` -> `preview` -> `send`.
- Export por corrida: `raw`, `json`, `csv`, `txt`.

### 12.2 Idempotencia activa

- dedupe por linea (`dedupe_key`);
- dedupe por factura (`source_invoice_id`) para bloquear reenvio de facturas ya enviadas a R365.

### 12.3 Trazabilidad activa

- historial de corridas;
- historial de facturas (estado, template, enviada/no enviada, ultima vez).

## Control de cambios

- v1: especificacion tecnica inicial para construccion del modulo.
- v2: incorpora templates con service dates, estado implementado y dedupe por factura.

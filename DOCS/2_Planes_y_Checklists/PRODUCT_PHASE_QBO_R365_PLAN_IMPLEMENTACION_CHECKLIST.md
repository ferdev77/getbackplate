# DOC_ID: PRODUCT_PHASE_QBO_R365_IMPLEMENTATION_CHECKLIST_V1
# DOC_LEVEL: PLAN_CHECKLIST
# PHASE_NAMESPACE: PRODUCT_PHASE
# SOURCE_OF_TRUTH_FOR: plan de ejecucion y checklist de implementacion QBO -> R365

# Plan de Implementacion + Checklist

## Integracion QuickBooks Online -> Restaurant365

## Objetivo

Ejecutar la implementacion de forma controlada, con evidencia por etapa y criterio de cierre claro por cada bloque.

## Estado global

- Estado: `[ ] En ejecucion`
- Fecha inicio: `[ ] pendiente`
- Owner tecnico: `[ ] pendiente`
- Owner funcional cliente: `[ ] pendiente`

## Estado actual implementado (snapshot tecnico)

- [x] OAuth QBO conectado y estable.
- [x] Flujo Operacion (`Dry Run` / `Sync Now`).
- [x] Flujo Developer por etapas (`prepare` / `preview` / `send`).
- [x] Export por corrida (`raw`, `json`, `csv`, `txt`).
- [x] Historial de corridas.
- [x] Historial de facturas.
- [x] Dedupe por linea.
- [x] Dedupe por factura enviada (bloqueo de reenvio).
- [x] Template `by_item`.
- [x] Template `by_item_service_dates`.
- [x] Template `by_account`.
- [x] Template `by_account_service_dates`.

## Regla de avance

Cada item solo se marca completo cuando cumple:

1. implementacion realizada;
2. prueba ejecutada y validada;
3. evidencia registrada (log/captura/reporte).

## Fase 0 - Descubrimiento y decisiones bloqueantes

- [ ] Confirmar alcance funcional exacto (que facturas entran y cuales no).
- [ ] Definir template de R365: `By Item` o `By Account`.
- [ ] Confirmar politica de impuestos para importacion.
- [ ] Confirmar naming convention de archivos a enviar.
- [ ] Confirmar criterio incremental de lectura en QBO.
- [ ] Confirmar politica de reintentos y dedupe.
- [ ] Aprobar matriz de mapping inicial QBO -> R365.

Salida esperada Fase 0:

- [ ] Documento de alcance firmado.
- [ ] Matriz de mapping v1 aprobada.
- [ ] Lista de supuestos y fuera de alcance cerrada.

## Fase 1 - Accesos y conectividad

- [ ] Crear app/integration en QBO developer.
- [ ] Configurar OAuth 2.0 (client id, secret, redirect URI).
- [ ] Conectar tenant en sandbox y validar refresh token.
- [ ] Solicitar y validar FTP R365 (host/user/path/permisos).
- [ ] Probar conectividad FTP con upload de archivo dummy.
- [ ] Definir almacenamiento seguro de secretos.

Salida esperada Fase 1:

- [ ] Conexion QBO sandbox operativa.
- [ ] Conexion FTP R365 prueba operativa.
- [ ] Checklist de seguridad de credenciales completado.

## Fase 2 - Backend base (MVP tecnico)

- [ ] Crear tablas base de integracion (connections/settings/mappings/runs/items/files/audit).
- [ ] Implementar `connector_qbo` para leer facturas por ventana incremental.
- [ ] Implementar `transformer_r365` (CSV Multi-Invoice v1).
- [ ] Implementar `validator_r365` para columnas y reglas minimas.
- [ ] Implementar `delivery_ftp` con respuesta de entrega tecnica.
- [ ] Implementar `sync_orchestrator` (manual + programado).
- [ ] Implementar dedupe por `dedupe_key`.
- [ ] Implementar politicas de reintento.

Salida esperada Fase 2:

- [ ] Corrida end-to-end tecnica en sandbox.
- [ ] CSV valido generado y subido por flujo automatizado.

## Fase 3 - Panel de configuracion y monitoreo

- [ ] UI para conectar/desconectar QBO.
- [ ] UI para configurar FTP R365 y hacer test de conexion.
- [ ] UI para seleccionar template y parametros operativos.
- [ ] UI para ejecutar `sync now`.
- [ ] UI de historial de corridas con filtros.
- [ ] UI de detalle por item fallido y accion recomendada.

Salida esperada Fase 3:

- [ ] Operacion funcional sin consola tecnica.
- [ ] Visibilidad de estado por corrida y por factura.

## Fase 4 - QA integral

- [ ] Pruebas funcionales happy path.
- [ ] Pruebas de validacion de campos obligatorios.
- [ ] Pruebas de duplicados (no doble envio).
- [ ] Pruebas de reintento por fallos transitorios.
- [ ] Pruebas de error permanente (`needs_review`).
- [ ] Pruebas de seguridad (roles/permisos/secretos).
- [ ] Pruebas de rendimiento basico (volumen acordado).

Salida esperada Fase 4:

- [ ] Reporte de QA firmado.
- [ ] Lista de issues cerrada o aceptada para post-go-live.

## Fase 5 - Go-live y estabilizacion

- [ ] Configurar credenciales productivas.
- [ ] Ejecutar corrida controlada de lanzamiento.
- [ ] Validar procesamiento en R365 con equipo cliente.
- [ ] Activar scheduler productivo.
- [ ] Definir monitoreo diario semana 1.
- [ ] Ejecutar handoff operativo.

Salida esperada Fase 5:

- [ ] Integracion productiva activa.
- [ ] Runbook operativo entregado.
- [ ] Cierre formal de lanzamiento.

## Checklist transversal de seguridad y compliance

- [ ] Secretos cifrados en repositorio seguro.
- [ ] Redaccion de credenciales en logs.
- [ ] Auditoria de acciones criticas habilitada.
- [ ] RBAC aplicado para configuracion y ejecucion manual.
- [ ] Evidencia de rotacion de credenciales documentada.

## Checklist transversal de documentacion

- [ ] Propuesta funcional actualizada a version vigente.
- [ ] Especificacion tecnica actualizada.
- [ ] Matriz de mapping vigente.
- [ ] Guia operativa y troubleshooting publicada.
- [ ] Registro de decisiones tecnicas (ADR o equivalente).

## Evidencia final de cierre

- [ ] Resultado de pruebas end-to-end.
- [ ] Ejecucion real validada por cliente.
- [ ] Historial de corridas con trazabilidad completa.
- [ ] Aprobacion formal de paso a operacion.

## Control de cambios

- v1: checklist inicial completo para ejecucion por fases.

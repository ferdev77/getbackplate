# ADR-002: Plan de transicion de credenciales QBO por tenant a credenciales globales

## Estado
Propuesto

## Fecha
2026-05-02

## Contexto
ADR-001 define como norte operativo usar credenciales Intuit globales (Super Admin) y mantener OAuth/tokens por empresa.

El estado actual del codigo y de algunas guias opera con `clientId`/`clientSecret` por tenant, por lo que se necesita una transicion controlada para evitar caidas de onboarding o regresiones en sync.

## Objetivo de la transicion
- eliminar friccion de onboarding tecnico por empresa;
- preservar el flujo funcional existente;
- migrar sin interrupcion de sincronizaciones activas;
- dejar una ruta de rollback segura durante la ventana de cambio.

## Decision
Se ejecutara una migracion por fases con compatibilidad temporal (dual-read), seguida por retiro del esquema anterior (sunset).

## Fases

### Fase 0 - Preparacion (documental y operativa)
- confirmar requerimiento funcional oficial con producto/operacion;
- definir owner de secretos globales y runbook de rotacion;
- publicar comunicacion interna de cambio de modelo.

Salida esperada:
- aprobacion formal para iniciar implementacion.

### Fase 1 - Infraestructura de configuracion global
- crear fuente de verdad de credenciales globales (Super Admin/secret manager);
- agregar validaciones de presencia y formato en entorno;
- instrumentar auditoria de lecturas/errores de credenciales globales.

Salida esperada:
- sistema puede resolver `client_id`/`client_secret` globales sin impactar tenants.

### Fase 2 - Compatibilidad temporal (dual-read)
- en OAuth start/callback y refresh, priorizar global;
- fallback temporal a tenant solo si global no esta disponible;
- marcar en logs/audit cuando se use fallback tenant.

Salida esperada:
- nuevas conexiones usan global;
- integraciones existentes siguen operando sin corte.

### Fase 3 - Migracion de UX y contrato API tenant
- ocultar/remover campos developer en UI tenant;
- mantener solo configuracion operativa por empresa;
- actualizar respuesta de snapshot/config para no exponer campos developer tenant.

Salida esperada:
- experiencia tenant simplificada y alineada con ADR-001.

### Fase 4 - Backfill y limpieza de datos
- identificar tenants con developer credentials historicas;
- verificar que tokens por tenant sigan vigentes con app global;
- dejar marca de migrado por tenant;
- limpiar campos legacy de forma segura (post-ventana de observacion).

Salida esperada:
- sin dependencia operativa de credenciales developer por tenant.

### Fase 5 - Sunset y hard enforcement
- retirar fallback tenant;
- bloquear escritura de `clientId`/`clientSecret` en endpoints tenant;
- convertir ADR-002 a estado `Aceptado` y cerrar ventana de rollback.

Salida esperada:
- enforcement completo del modelo global.

## Estrategia de rollout
- habilitar por feature flag por entorno;
- comenzar en sandbox/staging, luego produccion canary (subset de tenants), luego full rollout;
- monitorear por 7-14 dias antes de retirar fallback.

## Riesgos y mitigaciones
- Riesgo: fallo de secretos globales afecta todos los tenants.
  - Mitigacion: healthcheck de config global, alertas tempranas, runbook de rotacion.

- Riesgo: diferencias entre redirect URIs por entorno.
  - Mitigacion: inventario de URIs y validacion automatica previa a deploy.

- Riesgo: tenants legacy con setup inconsistente.
  - Mitigacion: reporte previo de calidad de datos + migracion asistida por lotes.

- Riesgo: regresion de reconexion OAuth.
  - Mitigacion: pruebas E2E sobre start/callback/refresh/sync cron.

## Rollback
- durante fases 2-4 se mantiene fallback tenant para continuidad;
- rollback consiste en reactivar lectura tenant-first via flag;
- no eliminar datos legacy hasta completar ventana de observacion.

## Checklist de validacion
- OAuth start usa credenciales globales en todos los entornos.
- OAuth callback persiste `realmId` y tokens por tenant correctamente.
- refresh token continua funcionando en sync manual y cron.
- no se solicita developer config en UI tenant.
- sync data parity: mismo conteo de documentos detectados/mapeados/subidos.
- errores y auditoria visibles en dashboard y logs operativos.

## Metricas de exito
- reduccion de tickets de onboarding relacionados a developer credentials.
- aumento de tasa de conexion exitosa en primer intento.
- cero incremento significativo de fallos en cron sync.
- tiempo promedio de activacion por tenant menor al baseline.

## Criterios de cierre
- 100% tenants en modelo global sin fallback activo;
- documentacion operativa y de producto actualizada;
- no incidentes criticos por 14 dias post-sunset.

## Relacion con otros ADR
- depende de `DOCS/1_Arquitectura_y_Contexto/ADR_001_CREDENCIALES_QBO_GLOBALES_SUPER_ADMIN.md`.

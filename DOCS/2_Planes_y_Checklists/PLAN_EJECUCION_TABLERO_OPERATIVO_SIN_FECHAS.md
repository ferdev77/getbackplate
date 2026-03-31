# Plan de Ejecucion en Tablero (sin tiempos calendario)

Referencia base: `DOCS/1_Arquitectura_y_Contexto/ANALISIS_INTEGRAL_APP_DB_2026-03-31.md`

## Objetivo

Convertir el analisis integral en un plan de ejecucion **accionable**, con:

- orden exacto de implementacion,
- responsables por rol,
- estimacion relativa (sin semanas ni dias),
- criterios de cierre verificables.

---

## Leyenda del tablero

- Prioridad: `P0` (critico), `P1` (alto), `P2` (medio).
- Estimacion relativa:
  - `XS` = muy bajo esfuerzo
  - `S` = bajo esfuerzo
  - `M` = esfuerzo medio
  - `L` = esfuerzo alto
  - `XL` = esfuerzo muy alto
- Roles sugeridos:
  - `Tech Lead`
  - `Backend`
  - `DBA`
  - `DevOps`
  - `QA`
  - `Product/Operaciones`

---

## Orden exacto de ejecucion (secuencial)

## Paso 01 - Blindaje de funciones SQL expuestas

- ID: `P0-SEC-001`
- Objetivo: cerrar riesgo de fuga de datos en funciones `SECURITY DEFINER`.
- Alcance: inventario + endurecimiento de `get_company_users`, `get_user_id_by_email`, `create_employee_transaction`, `submit_checklist_transaction`, `count_accessible_documents` y equivalentes.
- Responsable principal: `DBA`
- Responsables secundarios: `Backend`, `Tech Lead`
- Estimacion: `L`
- Dependencias: ninguna.
- Definicion de hecho:
  - todas las funciones criticas validan `auth.uid()` y pertenencia tenant;
  - se aplica `REVOKE EXECUTE FROM PUBLIC` donde corresponda;
  - grants quedan minimos y documentados.
- Evidencia de cierre:
  - script SQL de auditoria de permisos;
  - diff de migraciones de hardening;
  - pruebas de acceso cruzado en negativo.

## Paso 02 - Correccion de inconsistencias de migraciones

- ID: `P0-DB-002`
- Objetivo: eliminar fallos de despliegue por migraciones conflictivas.
- Alcance: resolver conflicto en `feedback_messages.status` y cualquier alter repetido no idempotente.
- Responsable principal: `DBA`
- Responsables secundarios: `Backend`, `QA`
- Estimacion: `M`
- Dependencias: Paso 01.
- Definicion de hecho:
  - pipeline de migracion corre limpio desde base vacia;
  - no hay `duplicate column`, `duplicate constraint` ni estados ambiguos.
- Evidencia de cierre:
  - ejecucion completa de migraciones en entorno limpio;
  - registro de verificacion en documento tecnico.

## Paso 03 - Resolucion de drift schema-app (`documents.deleted_at`)

- ID: `P0-DB-003`
- Objetivo: alinear codigo y schema para evitar errores runtime.
- Alcance: decidir y ejecutar una sola linea:
  1) agregar migracion formal de soft-delete, o
  2) remover referencias de app si no aplica.
- Responsable principal: `Tech Lead`
- Responsables secundarios: `DBA`, `Backend`
- Estimacion: `M`
- Dependencias: Paso 02.
- Definicion de hecho:
  - no existen referencias a columnas no versionadas;
  - contrato de borrado documental queda documentado.
- Evidencia de cierre:
  - migracion o refactor aplicado;
  - build + smoke documental sin errores.

## Paso 04 - Correccion de contrato de RPC atomica de empleados/checklists

- ID: `P1-DB-004`
- Objetivo: evitar fallas en RPC por nombres de columnas incompatibles.
- Alcance: alinear `create_employee_transaction` y `submit_checklist_transaction` con schema vigente.
- Responsable principal: `DBA`
- Responsables secundarios: `Backend`, `QA`
- Estimacion: `L`
- Dependencias: Paso 03.
- Definicion de hecho:
  - RPCs compilan y ejecutan en entorno limpio;
  - no hay columnas legacy no existentes en inserts.
- Evidencia de cierre:
  - test de alta de empleado completo (incluyendo contrato y documentos);
  - test de submit checklist con adjuntos y flags.

## Paso 05 - Alineacion del contrato comercial de planes

- ID: `P1-PROD-005`
- Objetivo: unificar planes activos en DB, docs y scripts.
- Alcance: normalizar seed y scripts a contrato vigente (`basico/pro` o decision oficial actual).
- Responsable principal: `Product/Operaciones`
- Responsables secundarios: `Tech Lead`, `Backend`, `DBA`
- Estimacion: `M`
- Dependencias: Paso 04.
- Definicion de hecho:
  - seed, docs y validadores usan el mismo contrato;
  - no quedan referencias activas a contratos deprecados.
- Evidencia de cierre:
  - `verify:official-plan-packaging` en verde;
  - checklist de consistencia comercial actualizado.

## Paso 06 - Refactor de endpoints largos (parte 1)

- ID: `P1-APP-006`
- Objetivo: reducir riesgo de regresion en rutas de alta complejidad.
- Alcance: modularizar `web/src/app/api/company/employees/route.ts` en servicios/validadores/orquestador.
- Responsable principal: `Backend`
- Responsables secundarios: `Tech Lead`, `QA`
- Estimacion: `XL`
- Dependencias: Paso 05.
- Definicion de hecho:
  - route handler queda delgado;
  - logica de negocio se mueve a servicios testeables;
  - comportamiento funcional preservado.
- Evidencia de cierre:
  - suite de pruebas de empleados;
  - lint/build/smoke RRHH en verde.

## Paso 07 - Refactor de endpoints largos (parte 2)

- ID: `P1-APP-007`
- Objetivo: controlar complejidad del asistente IA y mejorar mantenibilidad.
- Alcance: separar `web/src/app/api/company/ai/chat/route.ts` en capas (intent, providers, guardrails, cache, auditoria).
- Responsable principal: `Backend`
- Responsables secundarios: `Tech Lead`, `QA`
- Estimacion: `XL`
- Dependencias: Paso 06.
- Definicion de hecho:
  - cada modulo tiene responsabilidad unica;
  - fallback y control de costos siguen funcionando;
  - no hay degradacion en respuesta funcional.
- Evidencia de cierre:
  - pruebas de regresion IA (basico/pro, fallback, cache, rate limit);
  - auditoria de eventos IA intacta.

## Paso 08 - Governance de migraciones + control de drift en CI

- ID: `P1-OPS-008`
- Objetivo: prevenir reaparicion de drift schema-app.
- Alcance: agregar gate de CI para:
  - levantar DB desde cero,
  - aplicar migraciones,
  - ejecutar smoke de schema y scripts criticos.
- Responsable principal: `DevOps`
- Responsables secundarios: `DBA`, `Backend`, `QA`
- Estimacion: `L`
- Dependencias: Paso 07.
- Definicion de hecho:
  - PR falla automaticamente ante incompatibilidades schema-app;
  - existe reporte claro de causa de fallo.
- Evidencia de cierre:
  - pipeline CI activo;
  - corrida de validacion completa en rama principal.

## Paso 09 - Observabilidad tecnica ampliada

- ID: `P2-OBS-009`
- Objetivo: mejorar deteccion temprana de incidentes.
- Alcance: tablero consolidado con error rate, p95/p99, colas cron, fallos webhook, denegaciones de acceso.
- Responsable principal: `DevOps`
- Responsables secundarios: `Tech Lead`, `Backend`
- Estimacion: `L`
- Dependencias: Paso 08.
- Definicion de hecho:
  - metricas visibles con umbrales de alerta;
  - runbook enlazado a señales reales.
- Evidencia de cierre:
  - dashboard operativo publicado;
  - simulacion de alerta con respuesta correcta.

## Paso 10 - Cierre de calidad y estandarizacion

- ID: `P2-QA-010`
- Objetivo: dejar baseline estable y repetible.
- Alcance: corrida integral de QA tecnico + actualizacion documental final de decisiones.
- Responsable principal: `QA`
- Responsables secundarios: `Tech Lead`, `Backend`, `DBA`, `Product/Operaciones`
- Estimacion: `M`
- Dependencias: Paso 09.
- Definicion de hecho:
  - bateria `verify:*` en verde;
  - runbooks y documentos alineados con implementacion real;
  - acta de cierre tecnico emitida.
- Evidencia de cierre:
  - reporte de ejecucion QA;
  - documento final de estado consolidado.

---

## Tablero resumido (para seguimiento rapido)

| Orden | ID | Prioridad | Iniciativa | Responsable principal | Estimacion | Estado inicial |
|---|---|---|---|---|---|---|
| 01 | P0-SEC-001 | P0 | Hardening SQL SECURITY DEFINER | DBA | L | Pendiente |
| 02 | P0-DB-002 | P0 | Correccion migraciones conflictivas | DBA | M | Pendiente |
| 03 | P0-DB-003 | P0 | Alineacion drift `documents.deleted_at` | Tech Lead | M | Pendiente |
| 04 | P1-DB-004 | P1 | Alinear RPCs atomicas con schema | DBA | L | Pendiente |
| 05 | P1-PROD-005 | P1 | Unificar contrato de planes | Product/Operaciones | M | Pendiente |
| 06 | P1-APP-006 | P1 | Refactor API employees | Backend | XL | Pendiente |
| 07 | P1-APP-007 | P1 | Refactor API IA | Backend | XL | Pendiente |
| 08 | P1-OPS-008 | P1 | Gate CI anti-drift | DevOps | L | Pendiente |
| 09 | P2-OBS-009 | P2 | Observabilidad ampliada | DevOps | L | Pendiente |
| 10 | P2-QA-010 | P2 | Cierre de calidad | QA | M | Pendiente |

---

## Criterios globales de exito

- Seguridad: cero accesos cross-tenant en pruebas negativas.
- Consistencia: schema reproducible sin drift entre ambientes.
- Mantenibilidad: rutas criticas divididas en componentes testeables.
- Operacion: checklist tecnico y runbook ejecutables sin ambiguedad.
- Negocio: contrato de planes unico y consistente en app + DB + docs.

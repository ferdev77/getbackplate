# Auditoria Avanzada - Especificacion (B1)

Este documento define el diseno funcional y tecnico de auditoria avanzada.
No aplica cambios de UI, flujos, funcionalidades ni reglas de base de datos.

## 1. Objetivo

- Tener trazabilidad confiable de acciones criticas por tenant y por superadmin.
- Facilitar soporte, seguridad y analisis forense sin romper aislamiento multi-tenant.

## 2. Alcance de eventos auditables

### 2.1 Eventos de autenticacion y acceso

- login exitoso
- login fallido
- logout
- intento de acceso sin permiso (ruta o accion)

### 2.2 Eventos administrativos SaaS (superadmin)

- creacion/edicion de organizacion
- cambio de estado de organizacion (`active/paused/suspended`)
- asignacion/cambio de plan
- activacion/desactivacion de modulo por tenant
- cambio de limites por tenant

### 2.3 Eventos operativos de tenant

- creacion/edicion/borrado de empleado
- creacion/edicion/publicacion/caducidad de anuncio
- creacion/edicion de documentos y cambios de acceso
- creacion/edicion de plantilla checklist
- envio de checklist

### 2.4 Eventos de seguridad

- intento de operacion bloqueada por modulo desactivado
- intento bloqueado por RLS/permisos de negocio
- acciones destructivas confirmadas

## 3. Esquema logico minimo por evento

Campos obligatorios esperados (a nivel diseno):

- `event_id`: identificador unico del evento
- `occurred_at`: timestamp UTC
- `actor_user_id`: usuario que ejecuta
- `actor_role_code`: rol efectivo
- `organization_id`: tenant objetivo (null solo para eventos globales)
- `branch_id`: sucursal objetivo cuando aplique
- `event_domain`: auth, superadmin, employees, documents, announcements, checklists, settings
- `event_action`: verbo normalizado (`create`, `update`, `delete`, `publish`, `assign_plan`, etc.)
- `resource_type`: tipo de recurso afectado
- `resource_id`: id del recurso afectado (si existe)
- `outcome`: `success` o `denied`
- `severity`: `low`, `medium`, `high`, `critical`
- `reason_code`: codigo de causa para fallos o bloqueos
- `metadata`: json acotado (sin datos sensibles)

## 4. Niveles de severidad

- `low`: acciones de lectura/consulta de bajo riesgo.
- `medium`: altas/ediciones no destructivas.
- `high`: cambios de permisos, modulos, limites o configuraciones sensibles.
- `critical`: suspensiones de tenant, acciones destructivas y eventos de seguridad.

## 5. Reglas de privacidad y contenido

- No guardar secretos, tokens, contrasenas ni payloads sensibles.
- No guardar contenido completo de documentos.
- Guardar solo metadatos necesarios para trazabilidad y soporte.
- Respetar aislamiento tenant en consultas de auditoria para panel empresa.

## 6. Visibilidad de logs por rol

- `superadmin`: ve eventos globales y de cualquier tenant.
- `company_admin`: ve eventos de su `organization_id`.
- `manager`: ve subset operativo de su `organization_id` (sin eventos administrativos globales).
- `employee`: sin acceso directo al explorador de auditoria.

## 7. Retencion y ciclo de vida

- Retencion minima recomendada: 180 dias.
- Retencion extendida recomendada para eventos `critical`: 365 dias.
- Politica de purga o archivado definida por tenant plan (a definir en bloque negocio).

## 8. Criterios de aceptacion para marcar B1 en implementacion futura

- Se registra al menos un evento por cada categoria de alcance (2.1 a 2.4).
- Cada evento incluye campos minimos obligatorios (seccion 3).
- Se valida que panel empresa no puede leer logs de otro tenant.
- Se valida que superadmin si puede ver trazabilidad global.
- Se valida que no se persisten datos sensibles.

## 9. Estrategia de implementacion sugerida (sin ejecutar aun)

1. Normalizar taxonomia de eventos y `reason_code` en constantes compartidas.
2. Envolver acciones criticas con helper de auditoria central.
3. Agregar pruebas de acceso y aislamiento de logs.
4. Exponer consulta de auditoria para superadmin y empresa con filtros.
5. Definir tareas de retencion/archivado.

## 10. Estado

- Estado actual: definido en documento (no implementado).
- Impacto actual en producto: ninguno.

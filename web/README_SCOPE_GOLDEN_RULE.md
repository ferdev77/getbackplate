# Regla de Oro de Alcance

Este documento define el comportamiento oficial de alcance para toda la plataforma.

## Objetivo

Garantizar un comportamiento unico, predecible y auditable en Avisos, Checklists y Documentos.

## Regla oficial

El alcance final siempre se resuelve asi:

`alcance_final = (base_por_ubicacion filtrada por deptos/puestos) + usuarios_agregados`

### 1) Base por ubicacion

- El alcance base se define por `locations`.
- Para `company_admin`, la base puede cubrir cualquier ubicacion valida de la organizacion.
- Para `employee`, la base se limita solo a sus ubicaciones permitidas.
- Si el empleado no envia ubicaciones, el backend aplica automaticamente sus ubicaciones permitidas.

### 2) Filtros (reducen alcance)

- `department_ids` y `position_ids` filtran dentro de la base.
- Nunca amplian alcance fuera de la base.
- Si no hay filtros, se mantiene toda la base.

### 3) Usuarios agregados (amplian alcance)

- `users` siempre suma alcance como excepcion explicita.
- Un usuario incluido en `users` recibe acceso aunque no cumpla filtros de depto/puesto.

## Comportamiento de lectura

Para un usuario que intenta ver un recurso:

1. Si esta en `users` => acceso permitido.
2. Si no hay filtros de ubicacion/depto/puesto => acceso permitido.
3. Si hay filtros:
   - Debe cumplir ubicacion (si fue definida), y
   - Debe cumplir departamento (si fue definido), y
   - Debe cumplir puesto (si fue definido).

## Contrato de datos

El alcance se guarda en JSON con este shape:

```json
{
  "locations": ["uuid"],
  "department_ids": ["uuid"],
  "position_ids": ["uuid"],
  "users": ["uuid"]
}
```

## UX oficial

Todos los formularios que configuran alcance deben mostrar:

1. Bloque de alcance base por ubicacion.
2. Bloque de filtros por departamento/puesto (aclarando que reducen alcance).
3. Bloque de usuarios agregados manualmente (aclarando que suman alcance).
4. Resumen visible: por filtros, agregados y total.

## Enforcements backend

- Validacion de referencias de alcance (ubicaciones/deptos/puestos/usuarios).
- Validacion de ubicaciones permitidas por actor.
- Rechazo explicito cuando se intenta seleccionar ubicaciones fuera de alcance.

## Cobertura

Esta regla aplica a:

- Avisos
- Checklists
- Documentos y carpetas

Y aplica tanto a:

- Company admin
- Empleado con permisos delegados

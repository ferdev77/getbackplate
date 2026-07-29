# Regla de Oro de Alcance

**Ultima validacion:** 2026-07-26 contra RLS real en Supabase dev.

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
- Regla para contexto empleado: solo se pueden agregar usuarios que pertenezcan a sus ubicaciones permitidas.
- **Excepcion — alcance de solo personas:** si `users` tiene contenido y no hay
  ningun filtro de ubicacion/depto/puesto, el alcance es **privado**: lo ven
  unicamente las personas listadas. Sin filtros no hay base que ampliar, asi
  que la lista pasa a ser el alcance completo y no una excepcion sobre una base.

## Comportamiento de lectura

Para un usuario que intenta ver un recurso:

1. Si esta en `users` => acceso permitido.
2. Si `users` tiene contenido y no hay filtros de ubicacion/depto/puesto
   => acceso denegado a todo el que no este listado (alcance de solo personas).
3. Si no hay filtros ni usuarios => acceso permitido (difusion).
4. Si hay filtros:
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
- En rutas de empleado, validacion extra de `users` para bloquear usuarios fuera de sus ubicaciones permitidas.
- En lectura, los valores dentro de una dimension usan OR y las dimensiones pobladas usan AND.
- El runner `npm run verify:rls-isolation:dev` protege esta regla contra regresiones SQL.

## Estado de cumplimiento (2026-07-29)

Verificado con sondas directas contra las funciones de Postgres en dev y con
`npm run verify:rls-isolation:dev`, que ahora cubre los tres modulos:

| Capa | Solo personas = privado | Dimensiones pobladas con AND |
| --- | --- | --- |
| `current_user_matches_document_scope` (documentos y carpetas) | Cumple | Cumple |
| `announcement_scope_match` / `checklist_scope_match` | Cumple | Cumple |
| `scope-policy.ts` (lectura en la app) | Cumple | Cumple |
| `audience-resolver.ts` (destinatarios de notificaciones) | Cumple | Cumple |

### Desvios corregidos

- `scope-policy.ts` trataba un alcance de solo personas como difusion
  (corregido 2026-07-29, commit `0aec2d8d`).
- `announcement_scope_match` / `checklist_scope_match` resolvian las dimensiones
  con OR: cumplir la ubicacion alcanzaba aunque el departamento o el puesto no
  coincidieran, con lo que agregar un filtro no reducia nada.
- `can_read_announcement/5` — la que usa realmente la politica
  `announcements_tenant_select` — habia quedado en la version de marzo:
  calculaba una unica sucursal efectiva y pasaba `text[]` de puestos, con lo que
  se ataba a un overload muerto. Un empleado multi-sucursal no veia avisos
  alcanzados por sus sucursales secundarias. Los runners verificaban
  `can_read_announcement/4`, que la politica no usa: por eso paso inadvertido.
  Ahora la de 4 delega en la de 5, asi que los runners prueban el camino real.
- Los overloads muertos `*_scope_match(jsonb, uuid, uuid, uuid, text[])` fueron
  eliminados para que no puedan volver a capturar una llamada por resolucion de
  tipos.

Los tres ultimos se corrigieron en la migracion
`20260729000002_scope_and_semantics_announcements_checklists.sql`.

### Como no volver a desviarse

`verify:rls-isolation:dev` afirma, para documentos, avisos y checklists, que
cumplir una sola dimension no saltea las otras y que un alcance de solo personas
sigue siendo privado. Cualquier funcion nueva de lectura por alcance deberia
sumarse a ese runner.

## Cobertura

Esta regla aplica a:

- Avisos
- Checklists
- Documentos y carpetas

Y aplica tanto a:

- Company admin
- Empleado con permisos delegados

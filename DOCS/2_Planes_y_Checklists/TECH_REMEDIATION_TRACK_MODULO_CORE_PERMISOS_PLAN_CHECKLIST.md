# DOC_ID: TECH_REMEDIATION_TRACK_CORE_PERMISSIONS_MODULE_PLAN
# DOC_LEVEL: PLAN_IMPLEMENTACION
# PHASE_NAMESPACE: TECH_REMEDIATION_TRACK
# SOURCE_OF_TRUTH_FOR: definicion, alcance, plan de implementacion y checklist de avance del modulo core `permissions`

# Plan de Implementacion - Modulo Core Permissions (delegacion a employees)

## 1) Objetivo del modulo

Implementar un modulo core llamado `permissions` para que `company_admin` pueda delegar permisos operativos a usuarios `employee` con acceso a dashboard, sin quitar ni limitar el full access del `company_admin`.

El objetivo operativo inicial es habilitar delegacion en:

- `announcements`
- `checklists`
- `documents` operativos (no documentos laborales/privados de empleado)

## 2) Reglas de negocio acordadas (canonicas)

1. `company_admin` mantiene full access siempre.
2. Los permisos delegados solo aplican a `employee`.
3. Capacidades de delegacion por modulo:
   - `create`
   - `edit`
   - `delete`
4. Regla de ownership obligatoria para `employee`:
   - `edit` y `delete` solo sobre recursos creados por el mismo usuario.
5. Los permisos se gestionan desde el modal de alta/edicion de empleados/usuarios.
6. La pestana `Permisos` solo se muestra si el empleado tiene acceso a dashboard.
7. En portal empleado, el contenido debe verse diferenciado entre:
   - elementos asignados al empleado
   - elementos creados por el empleado

## 3) Alcance MVP (v1)

Incluye:

- modelo de datos para permisos delegados por membership
- enforcement backend por modulo/capacidad
- UI de configuracion en modal de empleados (company panel)
- habilitacion de operaciones en portal empleado para los 3 modulos acordados
- ownership enforcement en `edit/delete`
- auditoria de concesion/revocacion y denegaciones
- documentacion y checklist de validacion

No incluye en v1:

- permisos por campo o por accion avanzada (approve/publish/export)
- delegacion entre employees (solo delega company_admin)
- permisos temporales con vencimiento automatico
- ampliacion a otros modulos fuera de anuncios/checklists/documentos operativos

## 4) Diseno tecnico base

### 4.1 Datos

Crear tabla de permisos delegados por membership, tenant y modulo (nombre final a definir en migracion, recomendado `employee_module_permissions`).

Columnas minimas esperadas:

- `id`
- `organization_id`
- `membership_id`
- `module_code`
- `can_create`
- `can_edit`
- `can_delete`
- `granted_by`
- `created_at`
- `updated_at`

Restricciones minimas:

- `unique (organization_id, membership_id, module_code)`
- permitir solo `module_code in ('announcements','checklists','documents')` en v1
- integridad de tenant en lectura/escritura
- solo memberships con rol `employee`

### 4.2 Autorizacion backend

Agregar helper central (en capa de acceso compartida) para evaluar permiso delegado por `module + capability`.

Reglas de evaluacion:

1. Si rol es `company_admin` -> allow.
2. Si rol es `employee` -> evaluar tabla de permisos delegados.
3. Si capability es `edit/delete` y rol es `employee` -> exigir ownership del registro.
4. Si no cumple -> `403` con mensaje claro.

### 4.3 Ownership por modulo

- `announcements`: usar `created_by`
- `checklists`: asegurar `created_by` en entidades editables por employee
- `documents` operativos: usar `owner_user_id`

## 5) UX/UI acordada

### 5.1 Company panel (modal empleados/usuarios)

En el modal de crear/editar empleado:

- nueva pestana `Permisos`
- visible solo si el empleado tiene acceso a dashboard
- matriz de toggles por modulo:
  - `Crear`
  - `Editar`
  - `Eliminar`

### 5.2 Employee portal

En los modulos habilitados, mostrar acciones segun permisos delegados.

Para checklist (obligatorio en v1):

- vista diferenciada `Asignados a mi` vs `Creados por mi`
- acciones de `edit/delete` solo en `Creados por mi` y con ownership validado en backend

## 6) Plan de implementacion por fases

### Fase 0 - Especificacion y alineacion

- [x] Definir alcance exacto con negocio (company_admin full access + delegacion a employee).
- [x] Definir modulos MVP (`announcements`, `checklists`, `documents` operativos).
- [x] Definir regla de ownership (`edit/delete` solo sobre lo creado por el employee).
- [x] Congelar contratos de API/payload para create/edit de permisos en modal empleados.

### Fase 1 - DB y seguridad base

- [x] Crear migracion de tabla de permisos delegados + indices + constraints.
- [x] Aplicar RLS/policies de tenant para lectura y escritura segura.
- [x] Registrar modulo core `permissions` en catalogo de modulos.
- [x] Agregar auditoria de cambios de permisos (`grant/update/revoke`).

### Fase 2 - Backend de autorizacion

- [x] Implementar helper central de autorizacion por capability.
- [x] Integrar helper en rutas de employee para `announcements`.
- [x] Integrar helper en rutas de employee para `checklists`.
- [x] Integrar helper en rutas de employee para `documents` operativos.
- [x] Aplicar ownership checks en `edit/delete` para employee.

### Fase 3 - UI de delegacion (company)

- [x] Agregar pestana `Permisos` en modal crear/editar empleado.
- [x] Mostrar pestana solo cuando `dashboard access` este activo.
- [x] Cargar estado de permisos al abrir edicion.
- [x] Persistir permisos al guardar alta/edicion.
- [x] Validar UX de errores y estado guardado.

### Fase 4 - UX operativa en portal empleado

- [x] `announcements`: habilitar create/edit/delete segun permisos.
- [x] `checklists`: habilitar create/edit/delete segun permisos.
- [x] `documents` operativos: habilitar create/edit/delete segun permisos.
- [x] Diferenciar visualmente `Asignados a mi` vs `Creados por mi` (minimo checklist).

### Fase 5 - QA, validacion y cierre documental

- [x] Tests de permisos por rol/capability con casos positivos y negativos.
- [x] Tests de ownership (employee no puede editar/borrar recursos de terceros).
- [x] Validar que `company_admin` no quede nunca restringido.
- [x] Actualizar `DOCUMENTACION_TECNICA.md` (modelo + seguridad + rutas).
- [x] Actualizar `GUIA_BASICA_SISTEMA.md` (explicacion funcional para operacion).
- [x] Dejar reporte de validacion final local/prod controlado.

## 7) Criterios de aceptacion

- Company admin puede delegar permisos desde modal de empleado con dashboard access.
- Employee delegado puede operar solo dentro de capabilities concedidas.
- Employee delegado solo puede editar/eliminar lo que el mismo creo.
- Employee no delegado mantiene comportamiento actual (sin permisos extra).
- Company admin conserva full access total en los modulos.
- Queda trazabilidad auditada de concesion/revocacion/denegacion.

## 8) Registro de avance

Fecha de inicio: 2026-04-18

- Estado actual: `IMPLEMENTADO`
- Responsable funcional: GetBackplate
- Responsable implementacion: equipo + asistente

Actualizaciones:

- 2026-04-18: alcance funcional definido y plan/checklist creado.
- 2026-04-18: implementacion integral completada (DB, backend, UI company, UI portal employee y ownership enforcement).

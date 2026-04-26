# ACTUALIZACION 2.0 SAAS

> ESTADO DOCUMENTAL: HISTORICO CONGELADO.
> Este archivo conserva contexto del sprint 2.0 y puede no reflejar el estado runtime mas reciente.
> Para estado vigente usar: `DOCS/00_START_HERE.md`, `DOCS/1_Arquitectura_y_Contexto/DOCUMENTACION_TECNICA.md` y checklists/actualizaciones mas nuevas.

Nombre oficial del producto: **GetBackplate**.

## Estado

Este documento define la version funcional vigente del modulo **Recursos Humanos**.

Desde este momento, este archivo es la **fuente de verdad** para:

- naming funcional de pantallas de RRHH
- reglas de negocio del flujo Usuarios / Empleados
- reglas del flujo Administradores
- comportamiento de modales, listados, filtros y acciones
- persistencia de datos y tablas involucradas

Si existe diferencia entre este documento y otros documentos historicos, prevalece este documento.

## 1) Mapa funcional de RRHH

### Pantalla A: `Usuarios / Empleados`

- Ruta: `/app/employees`
- Objetivo: gestionar personas operativas y personas base sin perfil laboral completo
- Permite:
  - crear usuario sin perfil empleado
  - crear empleado
  - editar ambos tipos
  - cambiar estado
  - eliminar registro

### Pantalla B: `Administradores`

- Ruta: `/app/users`
- Objetivo: gestionar accesos administrativos de empresa
- Permite:
  - crear administrador
  - editar rol/estado/sucursal administrativa
  - eliminar acceso administrativo

## 2) Reglas de naming

- En menu y dashboard:
  - `Usuarios / Empleados` para el flujo mixto operacional
  - `Administradores` para accesos administrativos
- Queda deprecado el uso ambiguo de "Usuarios" para ambos flujos en la misma pantalla.

## 3) Flujo de alta/edicion en `Usuarios / Empleados`

## 3.1 Modal principal

- Modal: `Nuevo Usuario / Empleado` (o `Editar Usuario / Empleado`)
- Estado inicial en alta:
  - `Es empleado?` = **No**
  - `Habilitar acceso al Dashboard` = **Off**

## 3.2 Campos minimos para guardar

Con solo:

- nombre
- apellido

el sistema debe permitir guardar el registro.

El resto de datos puede completarse despues desde edicion.

## 3.3 Toggle `Es empleado?`

- Si `No`:
  - se guarda como usuario base (sin perfil laboral en `employees`)
  - se guarda en `organization_user_profiles`
  - la pestana `Contrato` no aparece
- Si `Si`:
  - se guarda/edita en `employees`
  - si hay datos de contrato, persiste en `employee_contracts`
  - la pestana `Contrato` aparece

## 3.4 Pestanas del modal

- `Info Personal`: siempre visible
- `Documentos`: siempre visible
- `Contrato`: solo visible si `Es empleado? = Si`
- `Cuenta (App)`: siempre visible

## 3.5 Cuenta de acceso

- Siempre inicia desactivada
- Si se activa:
  - solicita email de acceso + password (min 8)
  - crea/recupera usuario auth y membership
- Si queda desactivada:
  - no crea auth ni membership
  - el perfil igual se guarda

## 4) Comportamiento de la grilla `Usuarios / Empleados`

## 4.1 Cards superiores (una linea)

- Total Empleados
- Total Usuarios
- Activos (Total)

No deben mostrarse en esta cabecera:

- Docs pendientes
- Contratos firmados

## 4.2 Filtros

- Busqueda
- Locacion
- Departamento
- Tipo (`Todos`, `Empleado`, `Usuario`)
- Estado

## 4.3 Columnas del listado

- Nombre
- Locacion
- Departamento
- Es empleado
- Estado
- Acciones

## 4.4 Acciones por fila

- Ver (ojito): habilitado en ambos tipos
- Editar: habilitado en ambos tipos
  - empleado -> edita por `employeeId`
  - usuario no-empleado -> edita por `organization_user_profile_id`
- Descargar perfil: habilitado en ambos tipos
- Eliminar: habilitado en ambos tipos

## 4.5 Cambio de estado desde perfil (ojito)

- Debe funcionar para ambos tipos:
  - empleado: actualiza `employees.status`
  - usuario no-empleado: actualiza `organization_user_profiles.status`
  - si el usuario tiene membership, tambien sincroniza `memberships.status`

## 5) Comportamiento de la pantalla `Administradores`

- Cards visibles: solo
  - Total Administradores
  - Activos
- Se elimina filtro de rol de la barra de filtros
- Se mantiene gestion administrativa centrada en memberships/roles.

## 6) Persistencia y tablas (fuente tecnica)

### Tablas principales RRHH

- `employees`
- `employee_contracts`
- `employee_documents`
- `documents`
- `memberships`
- `organization_user_profiles`

### Tabla nueva/reforzada para 2.0

`organization_user_profiles` se usa para usuarios sin perfil laboral completo y para edicion homogena en `Usuarios / Empleados`.

Campos clave:

- identificacion: `id`, `organization_id`, `user_id` (nullable), `employee_id` (nullable)
- perfil: `first_name`, `last_name`, `email`, `phone`
- ubicacion: `branch_id`, `department_id`, `position_id`
- tipo: `is_employee`
- estado: `status` (`active` o `inactive`)
- trazabilidad: `source`, `created_at`, `updated_at`

## 7) Migraciones asociadas a esta actualizacion

- `202603190002_organization_user_profiles.sql`
- `202603190003_user_profiles_nullable_user_id.sql`
- `202603190004_organization_user_profiles_status.sql`

## 8) Criterio de verdad para futuros cambios

Antes de tocar RRHH, validar contra este documento:

1. naming de pantallas
2. reglas de alta/edicion
3. reglas de estado y eliminacion
4. tablas y persistencia
5. permisos esperados por tipo de registro

Todo cambio de RRHH que contradiga este flujo debe documentarse primero en este archivo y luego implementarse.

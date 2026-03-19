# GUIA BASICA DEL SISTEMA

Nombre oficial del producto: **GetBackplate**.

## Fuente de verdad vigente para RRHH

La actualizacion funcional 2.0 de Recursos Humanos esta documentada en:

- `ACTUALIZACION_2.0_SAAS.md`

Ese archivo define el comportamiento oficial de `Usuarios / Empleados` y `Administradores`.

## Que es este sistema

Es una plataforma para que varias empresas usen el mismo sistema, pero cada una vea solo su informacion.

Sirve para operar sucursales, empleados, documentos, avisos y checklists diarios.

## Para que sirve

- ordenar la operacion interna
- centralizar documentos importantes
- comunicar avisos al personal
- ejecutar checklists por turno
- revisar reportes por sucursal

## Quien usa el sistema

### 1) Superadmin (global)

Administra la plataforma completa:

- crea empresas
- activa o desactiva modulos
- asigna planes y limites
- define precio y periodo de cada plan

### 2) Admin de empresa

Administra su empresa:

- sucursales
- empleados
- documentos
- avisos
- checklists y reportes

### 3) Manager / encargado

- completa checklists operativos
- deja comentarios y evidencias
- reporta incidencias

### 4) Empleado

- ve avisos internos
- consulta documentos asignados
- completa onboarding cuando ingresa

## Modulos principales

1. Empleados
2. Onboarding
3. Documentos
4. Avisos
5. Checklist operativo
6. Reportes
7. Dashboard

## Flujos simples

### Flujo A: ingreso de empleado nuevo

1. Admin crea el empleado.
2. Se cargan sus documentos.
3. El empleado entra y completa onboarding.
4. Queda listo para operar.

### Flujo B: checklist de apertura

1. Manager abre el checklist del turno.
2. Marca tareas completadas.
3. Si hay problema, marca incidencia y deja comentario.
4. Adjunta fotos si hace falta.
5. Envia reporte.
6. Admin revisa en el panel de reportes.

### Flujo C: aviso interno

1. Admin crea aviso.
2. Elige a quien se le muestra (empresa/sucursal/rol).
3. Publica.
4. El personal lo ve en su portal.

## Idea clave de seguridad (explicado simple)

Aunque dos empresas usen el mismo sistema, no pueden ver informacion entre ellas.

Eso se controla desde la base de datos y el backend, no solo escondiendo botones.

## Estado actual de la documentacion

Esta guia ya refleja:

- analisis inicial de pantallas (mockups)
- organizacion general del producto
- roles y flujos basicos

Se ira actualizando en cada fase de desarrollo para que cualquier persona la pueda entender.

## Estado actual del sistema (fase 1)

Ya esta disponible una base funcional con:

- login de acceso
- panel superadmin inicial
- creacion de empresas desde superadmin
- activacion/desactivacion de modulos por empresa
- panel empresa inicial
- alta y listado de empleados por tenant
- layout del panel empresa con barra lateral y navegacion principal

Hoy los modulos de documentos, anuncios, checklist y reportes ya funcionan con datos reales.
Lo que sigue es reforzar hardening, observabilidad, limites por plan y calidad operativa para madurez de producto.

### Observabilidad superadmin (en preparacion)

La card de observabilidad ya fue construida, pero esta oculta temporalmente para seguir iterando antes de publicarla.

Cuando se active en `Superadmin > Dashboard`, mostrara:

- cantidad de errores
- accesos bloqueados
- fallos de login
- estado por areas criticas

Si hay datos de tiempo de respuesta, tambien mostrara promedio y p95.

## Como leer los contadores de modulos (superadmin)

- `Modulos activos` (dashboard superadmin): suma modulos habilitados en empresas (usa `organization_modules` con `is_enabled = true`).
- `Asignaciones tenant-modulo` (catalogo de modulos): suma relaciones empresa-modulo, habilitadas o no (total de filas en `organization_modules`).

## Estado funcional actual (empresa)

- Checklists: ya funciona con datos reales (plantillas, ejecuciones e incidencias).
- Reportes: ya muestra metricas reales semanales de checklists e incidencias, mas volumen de documentos/anuncios.
- Settings y Feedback: operan por modal lateral y guardan en base de datos.

## Estado funcional actual (portal empleado)

- Checklist empleado: muestra tareas desde plantillas reales de la empresa (no datos fijos).
- Onboarding empleado: muestra progreso segun datos reales de perfil, documentos y contrato.
- Documentos empleado: muestra y descarga solo documentos visibles/asignados para ese usuario.

## Decisiones de negocio activas (2026-03-13)

- Una empresa puede registrar a una persona aunque esa persona ya exista en otra empresa del sistema.
- Ese registro se trata como empleado separado por empresa (cada empresa maneja su propio legajo, documentos, contrato y estado).
- Se mantiene la regla actual donde un manager puede crear/asignar usuarios con rol admin, por decision operativa.

## Seleccion de empresa cuando un usuario tiene varias

Si un usuario tiene acceso a mas de una empresa:

- puede elegir con cual empresa entrar desde una pantalla de seleccion
- el sistema recuerda su ultima empresa elegida para el proximo ingreso
- tambien puede forzar empresa por URL usando `?org=<id_empresa>`

Con esto se evita que el sistema tome una empresa "al azar".

## Auditoria (estado actual)

- Ya se guardan en base los eventos de acciones criticas con: quien lo hizo, que hizo y cuando.
- Eso queda en `audit_logs` y sirve para seguimiento operativo.
- La pantalla visual para navegar auditoria en superadmin queda postergada para mas adelante.

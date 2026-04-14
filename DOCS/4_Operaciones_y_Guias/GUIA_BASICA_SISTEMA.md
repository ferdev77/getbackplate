# GUIA BASICA DEL SISTEMA

Nombre oficial del producto: **GetBackplate**.

## Actualizacion visual (2026-03-30)

Se termino la integracion del nuevo estilo visual del sistema (Design System) en las pantallas principales.

Que mejora para el usuario:

- colores y tipografias mas consistentes en todo el sistema,
- mejor lectura en modo claro y modo oscuro,
- modales de Settings y Planes mas claros y faciles de usar,
- asistente IA flotante con mejor contraste y saludo personalizado,
- mejor adaptacion en celular/tablet/compu en secciones clave.

Importante:

- No se cambiaron reglas de negocio ni permisos.
- Solo se mejoro la capa visual y de experiencia de uso.

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

### Flujo D: tareas automatizadas (Avisos y Checklists recurrentes)

El sistema cuenta con un **Motor de Recurrencia Inteligente** que trabaja en piloto automático. 

#### Para Avisos Recurrentes (ej. "Cada Día"):
1. Admin crea un aviso y configura la periocidad ("Diario", "Semanal", etc).
2. El sistema programa un reloj interno automático.
3. Llegada la fecha/hora, el sistema **duplica y publica automáticamente** un nuevo aviso con esa información.
4. Vuelve a calcular el próximo día, esperando en silencio.

#### Para Checklists Recurrentes (ej. "Limpieza Diaria"):
1. Admin crea la plantilla y configura recurrencia.
2. Llegada la fecha/hora, el sistema **NO crea reportes vacíos infinitos** (para no saturar). Simplemente dispara una notificación/email recordando a los responsables.
3. Cuando el empleado entra a su portal, el sistema compara: *"¿Cuándo completó Juan este checklist por última vez?"*. 
4. Si Juan no lo ha completado desde que sonó la alarma hoy, le aparece en **Tareas Pendientes**.
5. Tan pronto como Juan lo completa, desaparece hasta que la alarma vuelva a sonar al siguiente ciclo.

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

## Separacion de dominios documentales (empresa vs legajo empleado)

- `Documentos` en panel empresa (`/app/documents`) administra solo documentos corporativos de empresa.
- El legajo documental de empleados (modal de empleado) se gestiona exclusivamente en flujo `Empleados`.
- No se permite mezclar operaciones:
  - documentos de legajo empleado no deben aparecer ni gestionarse desde `Documentos` empresa,
  - documentos corporativos no deben inyectarse en slots del legajo por canal legacy.

## Decisiones de negocio activas (2026-03-13)

- Una empresa puede registrar a una persona aunque esa persona ya exista en otra empresa del sistema.
- Ese registro se trata como empleado separado por empresa (cada empresa maneja su propio legajo, documentos, contrato y estado).
- Se mantiene la regla actual donde `manager` y `company_admin` pueden operar altas de usuarios via API (con modulo `employees` activo).
- En el modal de `Usuarios` del panel empresa, el rol de alta expuesto actualmente es `Administrador` (`company_admin`).
- El alta de empleados se realiza en el flujo de `Empleados`; no depende de datos mock/seed para operacion diaria.

## Seleccion de empresa cuando un usuario tiene varias

Si un usuario tiene acceso a mas de una empresa:

- puede elegir con cual empresa entrar desde una pantalla de seleccion
- el sistema recuerda su ultima empresa elegida para el proximo ingreso
- tambien puede forzar empresa por URL usando `?org=<slug_o_id_empresa>`

Tip de uso:

- En invitaciones y reenvios el sistema ya envia enlaces tenant-aware con `org`.
- Si `custom_branding` esta activo, login y recuperacion muestran logo/nombre de la empresa en la pantalla de auth.

Con esto se evita que el sistema tome una empresa "al azar".

## Billing y marca (Stripe) - estado actual

- El panel empresa ahora usa una pantalla intermedia antes de salir a Stripe:
  - `/app/billing/checkout-launch`
  - `/app/billing/portal-launch`
- Esa pantalla muestra marca por tenant:
  - si `custom_branding` esta activo, usa logo/nombre de la empresa,
  - si no, usa branding oficial `GetBackplate`.
- Los retornos de Stripe (`success`, `cancel`, `return`) ya se resuelven tenant-aware para volver al dominio correcto (custom activo o fallback plataforma).
- Importante: el look de la pagina hosted de Stripe sigue dependiendo de Stripe Dashboard; no se define por request desde la app.

## Auditoria (estado actual)

- Ya se guardan en base los eventos de acciones criticas con: quien lo hizo, que hizo y cuando.
- Eso queda en `audit_logs` y sirve para seguimiento operativo.
- La pantalla visual para navegar auditoria en superadmin queda postergada para mas adelante.

## Fase 4 (Agregados y Mejoras 2026-03-26)

Esta fase trajo mejoras y comodidades clave para todos los actores:
1. **Papelera de Reciclaje (Soft Delete)**: Los documentos y carpetas ahora no se eliminan permanentemente de inmediato. Se guardan en una "Papelera" durante 15 días (y 30 días para superadmins) por si fueron borrados por accidente y necesitan ser restaurados.
2. **Dashboard de Empleado**: Los empleados ven un tablero interactivo rápido donde tienen avisos importantes fijados, checklists pendientes que deben completar en el día y documentos agregados recientemente. 
3. **Estado de Documentación de Empleados**: Los managers pueden saber fácilmente en la vista de personal si un empleado tiene toda su documentación obligatoria ("Completo") o si le falta algo ("Incompleto").
4. **Mails Automáticos**: Se enviará un correo automáticamente para invitar al personal al sistema, al igual que al dueño de la empresa cuando le facturen o cambie de plan.
5. **Carpetas para el empleado**: Los empleados ahora también tienen su panel ordenado visualmente por carpetas y no con archivos sueltos.

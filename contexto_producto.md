# Contexto del Producto

## Fuente de verdad funcional vigente (RRHH)

Para Recursos Humanos (pantallas `Usuarios / Empleados` y `Administradores`), el comportamiento oficial vigente esta definido en:

- `ACTUALIZACION_2.0_SAAS.md`

En caso de conflicto con definiciones historicas de este archivo, prevalece `ACTUALIZACION_2.0_SAAS.md` para ese modulo.

## Ruta de futuras implementaciones (vigente)

Para nuevas funcionalidades fuera del alcance de RRHH 2.0, la ruta oficial de implementacion es:

- `ACTUALIZACION_2.1_SAAS.md`
- `CHECKLIST_IMPLEMENTACION_2.1_CHATBOT_IA.md`

Primer objetivo de esta ruta: chatbot flotante con IA en panel empresa.

## Objetivo del sistema

Desarrollar una plataforma web SaaS multiempresa, modular, segura, escalable y profesional, orientada a la operación interna de empresas con múltiples sucursales, especialmente restaurantes, cadenas gastronómicas o negocios con estructura operativa distribuida.

El sistema debe permitir administrar empresas, sucursales, empleados, onboarding, documentos, anuncios internos, checklists operativos, reportes y dashboards, dentro de una arquitectura preparada para crecer internacionalmente.

La plataforma no debe resolverse como una app aislada para un solo cliente, sino como un producto SaaS real, capaz de soportar múltiples empresas en una sola base tecnológica, con aislamiento seguro de datos y activación de módulos por tenant.

---

## Qué es este producto

Este producto es un **SaaS multiempresa / multi-tenant**.

Eso significa que:

- una sola plataforma servirá a múltiples empresas
- cada empresa tendrá sus propios datos aislados
- cada empresa podrá tener módulos activados o desactivados
- cada empresa podrá tener sus propias sucursales, usuarios y configuraciones
- existirá una capa global de administración de la plataforma

No debe pensarse como “una web para un restaurante”, sino como una plataforma que puede ser usada por muchas empresas diferentes.

---

## Superadmin obligatorio

Debe existir un **panel de superadmin global**, separado del panel de cada empresa.

El superadmin debe poder:

- crear empresas
- editar empresas
- activar o desactivar módulos por empresa
- asignar planes
- definir límites por empresa
- ver estado de empresas
- suspender o pausar cuentas si corresponde
- monitorear el uso general de la plataforma
- administrar configuraciones globales del sistema

Muy importante:

- el superadmin no es lo mismo que el admin de empresa
- ambos niveles deben estar separados en permisos, vistas y responsabilidades

---

## Base del frontend: carpeta `mockups`

La carpeta `mockups` será una fuente principal de verdad para el frontend, los flujos, la interfaz y gran parte del alcance funcional visible del sistema.

La IA debe:

- analizar todos los HTML dentro de `mockups`
- detectar pantallas
- detectar módulos
- detectar roles
- detectar flujos
- detectar datos visibles
- detectar acciones sugeridas
- detectar inconsistencias entre versiones

Y luego:

- reconstruir profesionalmente la plataforma basándose en esos mockups
- unificar versiones duplicadas o incompletas
- tomar la versión más completa cuando corresponda
- mantener el espíritu visual y funcional de esos HTML
- mejorar la calidad técnica, consistencia y escalabilidad de lo que los mockups muestran

Importante:

- no ignorar los mockups
- no tratarlos como inspiración decorativa
- no inventar una interfaz totalmente distinta
- no hacer un frontend desconectado del material base

La plataforma final, en interfaz, flujos, funcionalidades visibles y relaciones principales, debe salir de `mockups`.

---

## Módulos prioritarios

Estos son los módulos que se consideran prioritarios para el producto, tomando como base la idea general y los mockups actuales:

### 1. Base SaaS multiempresa
- empresas
- sucursales
- usuarios
- membresías usuario-empresa
- roles
- permisos
- módulos activables por empresa
- panel superadmin

### 2. Gestión de empleados
- alta y edición de empleados
- datos principales
- estado del empleado
- sucursal / ubicación
- vista admin
- vista de consulta según rol

### 3. Onboarding de empleado
- flujo de onboarding
- carga de datos
- carga de documentos
- estados del proceso
- preparación para aceptación o firma interna

### 4. Documentos
- documentos por empresa
- documentos por empleado si aplica
- storage seguro
- vistas para admin y usuario
- carga, lectura, descarga, control básico

### 5. Anuncios / comunicación interna
- anuncios generales
- anuncios destacados
- comunicación segmentada por empresa o sucursal
- visibilidad por rol si corresponde

### 6. Checklist operativo
- checklist por plantilla
- ítems
- prioridades
- comentarios
- flags / incidencias
- evidencias con fotos
- envío final
- histórico

### 7. Reportes
- reportes derivados de checklist
- reportes por sucursal
- filtros por estado, fecha y empresa
- vista de seguimiento para admins

### 8. Dashboard
- resumen de estado operativo
- métricas principales
- accesos rápidos
- visión por rol

### 9. Configuración
- configuración por empresa
- configuración de módulos
- configuración de sucursales
- ajustes internos del tenant

---

## Stack obligatorio / preferido

La base tecnológica debe ser moderna, mantenible, segura y escalable.

### Stack principal requerido
- Next.js moderno
- TypeScript estricto
- Supabase
- PostgreSQL
- Tailwind CSS

### Usar Supabase de forma profesional para:
- autenticación
- autorización
- base de datos relacional
- storage
- RLS
- policies
- seguridad multi-tenant
- migraciones
- manejo correcto de sesión

### Además:
- componentes reutilizables
- validaciones robustas
- estructura modular
- separación clara entre frontend, dominio y acceso a datos
- código limpio y mantenible
- documentación constante

---

## Requisitos de arquitectura

La arquitectura debe ser:

- modular
- segura
- escalable
- mantenible
- multi-tenant real
- preparada para activar módulos por empresa
- preparada para crecimiento internacional
- ordenada
- tipada
- desacoplada

Toda entidad que corresponda debe vincularse correctamente a:
- empresa / tenant
- sucursal si aplica
- usuario responsable si aplica

Debe evitarse desde el diseño cualquier fuga de datos entre empresas.

---

## Qué se espera de la IA

La IA debe actuar como arquitecto y desarrollador full stack de alto nivel.

Debe:

- pensar como producto real
- explicar siempre en español
- explicar en palabras básicas además de lo técnico
- documentar decisiones
- proponer estructuras sólidas
- evitar improvisación
- construir por fases
- priorizar seguridad y mantenibilidad
- dejar la base lista para seguir creciendo

Además, debe mantener dos documentos durante el desarrollo:

### Documento técnico
Ejemplo:
`DOCUMENTACION_TECNICA.md`

Con:
- arquitectura
- módulos
- estructura del proyecto
- tablas y relaciones
- roles y permisos
- seguridad
- flujo de auth
- multi-tenancy
- RLS
- decisiones técnicas
- variables de entorno
- despliegue
- roadmap técnico

### Documento simple
Ejemplo:
`GUIA_BASICA_SISTEMA.md`

Con:
- explicación simple del sistema
- qué hace cada rol
- cómo se usa
- flujos básicos
- lenguaje claro para usuarios no técnicos

---

## Qué no queremos que haga

La IA no debe:

- construir una app monolítica desordenada
- mezclar superadmin con admin de empresa
- ignorar multi-tenancy
- ignorar seguridad real en backend y base de datos
- depender solo del frontend para permisos
- ocultar funciones solo visualmente sin proteger acciones reales
- ignorar los mockups
- inventar una UI desconectada de `mockups`
- hardcodear lógica crítica
- duplicar código innecesariamente
- dejar reglas de negocio dispersas
- hacer código frágil o improvisado
- responder en otro idioma que no sea español
- documentar poco o nada
- construir algo “solo para que funcione” sin pensar en escala
- diseñar módulos imposibles de desacoplar o vender por separado

---

## Visión final del producto

La meta es construir una plataforma de clase mundial, con estándar internacional, preparada para:

- múltiples empresas
- múltiples sucursales
- crecimiento por módulos
- evolución por fases
- buen mantenimiento
- buena seguridad
- experiencia profesional de usuario
- posible comercialización global

Todo debe sentirse como un SaaS serio, no como un proyecto armado a mano para un solo cliente.

# DOC_ID: PROD_ROADMAP_MASTER
# DOC_LEVEL: PRODUCTO
# PHASE_NAMESPACE: PRODUCT_PHASE (global)
# SOURCE_OF_TRUTH_FOR: roadmap macro y orden de prioridad inter-fases

# Roadmap Inicial

## Enfoque general

El desarrollo debe hacerse por fases, priorizando una base sólida de producto SaaS antes de agregar complejidad operativa avanzada.

La regla general es:

1. primero construir bien la base multiempresa
2. después los módulos de gestión interna más importantes
3. luego los flujos operativos más valiosos
4. finalmente auditoría avanzada, analytics y mejoras

No conviene intentar desarrollar todo junto desde el primer momento.  
La prioridad es construir una base segura, escalable y bien organizada.

---

## Fase 1: Base SaaS + Auth + Empresas + Módulos + Empleados

### Objetivo
Construir la base estructural del sistema para que funcione como una plataforma SaaS multiempresa real.

### Alcance principal
- estructura multi-tenant
- autenticación
- autorización
- panel superadmin
- alta y edición de empresas
- activación de módulos por empresa
- planes o límites base si aplica
- sucursales
- usuarios
- relación usuario-empresa
- roles base
- permisos base
- gestión de empleados
- dashboard inicial
- layout general del sistema
- estructura inicial del frontend basada en `mockups`

### Entidades probables
- organizations / companies
- branches
- users
- memberships
- roles
- permissions
- modules
- company_modules
- employees

### Resultados esperados
- plataforma con login seguro
- superadmin funcional
- empresas creadas desde panel global
- módulos activables por empresa
- datos aislados por tenant
- empleados visibles y administrables dentro de cada empresa
- base lista para crecer sin rehacer arquitectura

### Meta de esta fase
Dejar listo el núcleo SaaS.

---

## Fase 2: Onboarding + Documentos + Anuncios

### Objetivo
Agregar flujos internos clave para comunicación y gestión documental del personal.

### Alcance principal
- onboarding de empleado
- carga de datos de onboarding
- carga segura de documentos
- vista de documentos por rol
- estados del proceso de onboarding
- preparación para aceptación o firma interna
- anuncios internos
- anuncios destacados
- comunicación por empresa
- comunicación por sucursal si aplica
- mejoras de experiencia para admin y usuario final

### Entidades probables
- onboarding_records
- employee_documents
- document_types
- announcements
- announcement_audiences
- acknowledgements si aplica

### Resultados esperados
- empleado con flujo de onboarding usable
- documentos cargados y visibles según permisos
- panel admin con control documental básico
- anuncios funcionales dentro del sistema
- base interna de comunicación operativa

### Meta de esta fase
Resolver el núcleo de RRHH liviano + comunicación interna.

---

## Fase 3: Checklist + Reportes

### Objetivo
Implementar el módulo operativo más valioso del producto: ejecución de checklist y supervisión mediante reportes.

### Alcance principal
- plantillas de checklist
- categorías
- ítems
- prioridades
- comentarios
- flags / incidencias
- evidencias con fotos
- envío final del checklist
- histórico de envíos
- reportes por sucursal
- filtros por fecha, estado, empresa y ubicación
- dashboard administrativo de seguimiento
- panel de revisión de incidencias

### Entidades probables
- checklist_templates
- checklist_template_items
- checklist_submissions
- checklist_submission_items
- checklist_comments
- checklist_attachments
- checklist_flags
- reports o vistas derivadas

### Resultados esperados
- usuarios operativos completando checklist reales
- administradores viendo reportes y estados
- evidencias asociadas
- flujo claro entre ejecución y supervisión

### Meta de esta fase
Convertir la plataforma en una herramienta operativa real, no solo administrativa.

---

## Fase 4: Mejoras, Auditoría, Analytics y Evolución

### Objetivo
Elevar la madurez del producto con trazabilidad, métricas, robustez y mejoras avanzadas.

### Alcance principal
- auditoría de acciones importantes
- logs relevantes
- analytics por empresa / sucursal / módulo
- métricas de uso
- métricas operativas
- mejoras de seguridad
- mejoras de performance
- mejoras de UX
- exportaciones si aplica
- configuraciones avanzadas
- feature flags más finos
- límites por plan
- mejoras de documentación
- hardening general del sistema
- preparación para integraciones futuras

### Posibles agregados
- impersonación segura para soporte
- dashboards ejecutivos
- scoring operativo
- alertas
- vencimientos documentales
- reglas avanzadas por sucursal
- plantillas configurables
- automatizaciones futuras

### Resultados esperados
- producto más robusto
- mayor trazabilidad
- mejor observabilidad
- visión más ejecutiva
- base lista para expansión comercial

### Meta de esta fase
Pasar de una buena v1 a una plataforma madura y escalable.

---

## Orden de prioridad recomendado

### Prioridad crítica
- auth
- multi-tenant
- superadmin
- empresas
- módulos por empresa
- roles y permisos
- empleados

### Prioridad alta
- onboarding
- documentos
- anuncios

### Prioridad muy valiosa de negocio
- checklist
- reportes

### Prioridad evolutiva
- auditoría
- analytics
- mejoras avanzadas

---

## Criterios de calidad para todas las fases

En cada fase se debe respetar:

- seguridad real
- validaciones backend
- RLS en Supabase
- tipado fuerte
- arquitectura modular
- documentación técnica
- documentación simple
- responsive
- separación de roles
- claridad de permisos
- fidelidad inteligente a `mockups`
- escalabilidad

---

## Regla de implementación

Antes de desarrollar cualquier módulo, se debe definir:

- objetivo del módulo
- entidades
- relaciones
- roles involucrados
- permisos
- flujos
- validaciones
- riesgos
- posibilidad de activarlo o desactivarlo por empresa

---

## Resultado esperado del roadmap

Este roadmap busca evitar:

- rehacer arquitectura más adelante
- desarrollar módulos sin base sólida
- mezclar niveles de administración
- perder tiempo en features secundarias demasiado pronto
- construir algo difícil de mantener

Y busca lograr:

- una plataforma SaaS real
- una base profesional
- evolución ordenada
- crecimiento por módulos
- mejor calidad técnica
- mejor proyección comercial

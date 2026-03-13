# Analisis de Mockups (Fase 0)

## 1) Archivos revisados

- `Mockups/index.html`
- `Mockups/juans-hub-Dashboard empleado (vista admin).html`
- `Mockups/juans-hub-Checklist Dashboard (vista admin).html`
- `Mockups/juans-hub-Dashboard empleado (vista empleado).html`
- `Mockups/juans-hub-Onboarding empleado (vista empleado).html`
- `Mockups/juans-hub-Checklist empleado (vista empleado).html`

## 2) Pantallas detectadas

### A. Contexto Admin (empresa/tenant)

1. Login admin
2. Dashboard de documentos (file manager con arbol de carpetas)
3. Carga de documentos (dropzone + metadatos)
4. Avisos internos (listado + crear aviso + audiencias)
5. Checklists (listado + builder de plantilla)
6. Usuarios (listado + alta)
7. Empleados (listado + alta/edicion)
8. Perfil de empleado (vista detallada)
9. Modales transversales: compartir, carpeta, usuario, aviso, feedback
10. Asistente IA lateral (componente de apoyo)

### B. Contexto Operativo Admin (reportes)

1. Dashboard de reportes de apertura por sucursal
2. Cards por ubicacion con estado diario
3. Tabla historica de reportes
4. Feed de incidencias para atencion
5. Panel lateral de detalle de reporte

### C. Contexto Empleado

1. Login empleado
2. Inicio (mensaje principal + avisos)
3. Instrucciones de uso y reglas
4. Mis documentos (preview + descarga)
5. Onboarding guiado por pasos con confirmacion final
6. Checklist operativo de apertura (ejecucion, comentarios, fotos, flags, envio)
7. Confirmacion de envio exitoso

## 3) Roles implicados

- Superadmin (no hay mockup visual explicito, pero es obligatorio por reglas de producto)
- Admin de empresa (si aparece claramente)
- Gerente/encargado de sucursal (ejecuta checklist y reporta)
- Empleado operativo (consulta avisos/documentos)

## 4) Modulos sugeridos por los mockups

- Auth y sesiones por rol
- Empresas/sucursales (fuerte presencia de ubicaciones)
- Usuarios y permisos
- Empleados
- Onboarding
- Documentos + storage
- Avisos internos
- Checklists operativos
- Reportes de checklist
- Dashboard operativo
- Configuracion (aparece en navegacion)
- Feedback interno

## 5) Flujos principales inferidos

1. Admin sube documentos, define metadatos y controla acceso por locacion/departamento/usuario.
2. Admin publica avisos segmentados y opcionalmente notifica por WhatsApp/SMS.
3. Gerente abre checklist de turno, marca tareas, registra evidencia y envia reporte.
4. Admin revisa reportes por sucursal, detecta incidencias y sigue pendientes.
5. Empleado entra al portal, completa onboarding inicial y consulta documentos asignados.

## 6) Inconsistencias detectadas

1. **Duplicidad de pantallas de Empleados/Admin**:
   - `index.html` incluye modulo de empleados.
   - `juans-hub-Dashboard empleado (vista admin).html` repite el mismo modulo con variaciones.
2. **Duplicidad de checklist admin**:
   - `index.html` incluye seccion de checklists.
   - `juans-hub-Checklist Dashboard (vista admin).html` trae una version mas enfocada y madura para reportes.
3. **Inconsistencia de roles en titulo**:
   - `juans-hub-Checklist empleado (vista empleado).html` muestra titulo "Gerente", pero el nombre de archivo dice "empleado".
4. **Onboarding mezclado con portal de empleado**:
   - `juans-hub-Onboarding empleado (vista empleado).html` es casi igual al dashboard de empleado y agrega overlay de onboarding.
5. **Superadmin ausente en UI mockup**:
   - requisito obligatorio del producto, no reflejado visualmente.

## 7) Propuesta de unificacion (version final objetivo)

### 7.1 Base visual y componentes

- Tomar `Mockups/index.html` como base principal del sistema de componentes admin (es la version mas completa y transversal).
- Tomar `Mockups/juans-hub-Checklist Dashboard (vista admin).html` para el modulo de reportes operativos (mas claro para seguimiento por sucursal).
- Tomar `Mockups/juans-hub-Checklist empleado (vista empleado).html` para la experiencia de ejecucion de checklist en campo.
- Tomar `Mockups/juans-hub-Onboarding empleado (vista empleado).html` solo para el flujo de onboarding por pasos.
- Tomar `Mockups/juans-hub-Dashboard empleado (vista empleado).html` para inicio/instrucciones/documentos del empleado.

### 7.2 Estructura funcional final

- **Portal Superadmin (nuevo)**: gestion global SaaS (empresas, modulos, planes, limites, estado).
- **Portal Empresa/Admin**: documentos, avisos, empleados, usuarios, checklists, reportes, configuracion tenant.
- **Portal Operativo (Gerente/Encargado)**: ejecucion de checklist y envio de incidencias.
- **Portal Empleado**: onboarding, avisos y documentos asignados.

## 8) Traduccion a arquitectura real

### Dominio central

- Multi-tenant por `organization_id`.
- Segmentacion opcional por `branch_id`.
- RBAC por membresia usuario-empresa.
- Catalogo de modulos y activacion por tenant.

### Entidades base (MVP fase 1-3)

- `organizations`, `branches`, `users`, `memberships`, `roles`, `permissions`
- `module_catalog`, `organization_modules`, `plans`, `organization_limits`
- `employees`, `employee_documents`, `document_folders`, `documents`
- `announcements`, `announcement_audiences`, `announcement_deliveries`
- `checklist_templates`, `checklist_template_sections`, `checklist_template_items`
- `checklist_submissions`, `checklist_submission_items`, `checklist_item_comments`, `checklist_item_attachments`, `checklist_flags`
- `audit_logs`

### Seguridad minima obligatoria

- RLS por `organization_id` en todas las tablas de tenant.
- Validaciones server-side para todos los writes.
- Bloqueo de acciones por modulo desactivado.
- Politicas de storage para documentos y evidencias por tenant.

## 9) Decisiones de version adoptadas

1. **Admin base**: usar `index.html` por cobertura funcional completa.
2. **Checklist admin/reportes**: priorizar `juans-hub-Checklist Dashboard (vista admin).html` por foco operativo.
3. **Checklist de campo**: priorizar `juans-hub-Checklist empleado (vista empleado).html` por flujo y estados de ejecucion.
4. **Onboarding**: extraer overlay de `juans-hub-Onboarding empleado (vista empleado).html` y aislarlo como modulo independiente.
5. **Empleado portal**: mantener estructura de `juans-hub-Dashboard empleado (vista empleado).html` para inicio/docs.

## 10) Resultado de esta fase

Se deja identificado el mapa funcional completo de mockups, las inconsistencias, y la version unificada recomendada para construir el producto SaaS multi-tenant sin perder fidelidad visual ni funcional.

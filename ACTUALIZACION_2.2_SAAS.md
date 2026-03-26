# ACTUALIZACION 2.2 SAAS - Plan Maestro de Estabilizacion y Performance

> **🛑 REGLA DE ORO DE ESTA REVISION 🛑**
> Queda **ESTRICTAMENTE PROHIBIDO** alterar flujos de negocio existentes, modificar drásticamente la interfaz (UI) o agregar nuevas pantallas. La versión 2.2 es una etapa de "Refactorización y Pulido Senior". Todas las mejoras aquí descritas son "under the hood" (bajo el capó) o ajustes de consistencia visual fina para mejorar lo que ya existe.

Este documento es el **Norte Oficial de Mejoras y Correcciones** (Version 2.2).

---

## 📋 Checklist Oficial de Implementación 2.2

### 1. Performance y Base de Datos (Fase Core)

- [x] **1.1 Optimización de JS en Landing (Fase 0-2)**
  - **Qué anda mal:** La landing envía demasiado código JavaScript bloqueante al cliente y la imagen principal no está optimizada.
  - **Cómo lo voy a mejorar:** Separando componentes estrictamente entre Server y Client. Migrando de `<img>` a `next/image` con sizes.
  - **Cómo debería funcionar después:** La página de aterrizaje renderizará muchísimo más rápido (TTFB/LCP mejorados) sin bloquear navegadores móviles.

- [x] **1.2 Caché Inteligente y Reducción de Consultas (Fase 3-4)** ✅
  - **Qué andaba mal:** Uso excesivo de `force-dynamic` que anula el caché de Next.js. El sistema consulta repetidas veces los "módulos habilitados" en una misma carga.
  - **Cómo se mejoró:** Se retiró `force-dynamic` de páginas secundarias (`(company)/app/...`) ya que su Layout raíz lo hereda. Se consolidaron ~4 llamadas independientes `is_module_enabled` en una sola (`getEnabledModules()`) en el Root Layout, interceptadas globalmente con `React.cache()`.
  - **Cómo funciona ahora:** La navegación interna es mucho más rápida gracias a Next.js App Router caching, y los viajes repetitivos a la DB de Supabase para consultar permisos de módulos se han convertido en O(1) viaje por Render.

- [x] **1.3 Cuello de Botella en Documentos de Empleado (Fase 5)** ✅
  - **Qué andaba mal:** El filtrado y conteo de documentos leídos/pendientes extraía *todos* los documentos en Node.js mediante un bucle `while(true)` paginado y luego filtraba en memoria.
  - **Cómo se mejoró:** Se migró toda la lógica de filtrado de acceso (`access_scope: users, locations, departments, positions`) al Stored Procedure nativo de PostgreSQL `count_accessible_documents` (via migración `20260326010000_count_accessible_documents_rpc.sql`).
  - **Cómo funciona ahora:** El portal del empleado dispara una rápida y única consulta RPG a la base de datos que transfiere solo el conteo final (O(1) payload). Adiós a iterar documentos en Node.js, agilizando todo a nivel enterprise.

- [x] **1.4 Hidratación Modular del Shell de Empresa (Fase 6-7)**
  - **Qué anda mal:** El componente que envuelve a toda la app de empresas es gigantesco, forzando al cliente a parsear código de modales que el usuario quizás ni abra.
  - **Cómo lo voy a mejorar:** Implementando *Dynamic Imports* (`next/dynamic` con lazy load) para el `NewEmployeeModal` y modales pesados.
  - **Cómo debería funcionar después:** Interacción inicial (First Input Delay) mucho más veloz al iniciar sesión.

- [x] **1.5 Optimizaciones Adicionales de Servidor y Reducción de Payload**
  - [x] Implementar `React.cache()` en `getEmployeeDirectoryView` (y otras utils pesadas similares).
  - [x] Minimizar payload de red enviado al cliente reduciendo props innecesarias en listas largas.

- [x] **1.6 Índices Estratégicos en Tablas Críticas**
  - **Qué anda mal:** Faltan índices compuestos en la DB para consultas que siempre filtran por `organization_id` + `branch_id` + `fecha`.
  - **Cómo lo voy a mejorar:** Creando índices B-tree concurrentemente en las tablas transaccionales (documentos, auditoría, checklists).
  - **Cómo debería funcionar después:** Consultas pesadas devolverán registros en milisegundos a medida que la base de datos crezca.

---

### 2. Consistencia Transaccional y Micro-UX (Fase Operativa)

- [x] **2.1 Estandarización de Feedback Visual (Toasts)**
  - **Qué anda mal:** Las notificaciones de éxito/error varían según el módulo; algunas son intrusivas, otras inexistentes u opacas.
  - **Cómo lo voy a mejorar:** Consolidando una única función de *Toaster* central global, asegurando textos cortos y semánticos.
  - **Cómo debería funcionar después:** Independientemente de si se aprueba un checklist o se edita un empleado, el mensaje visual será idéntico en estilo, duración y posición.

- [x] **2.2 Confirmaciones Destructivas Armonizadas**
  - **Qué anda mal:** Eliminar, suspender o revertir cuenta con diálogos de alerta inconsistentes (algunos nativos, otros modales custom).
  - **Cómo lo voy a mejorar:** Implementando un patrón único de *Alert Dialog* reutilizable en todo componente con acciones destructivas.
  - **Cómo debería funcionar después:** El usuario siempre enfrentará el mismo red-button con advertencia clara antes de borrar datos.

- [x] **2.3 Estados Vacíos (Empty States)**
  - **Qué anda mal:** Cuando una tabla no tiene datos (ej. cero empleados), a veces solo se ve una pantalla blanca o un texto plano sin guiatura.
  - **Cómo lo voy a mejorar:** Usando un componente estandarizado de Empty State (Icono + Mensaje + Botón Call to Action primario).
  - **Cómo debería funcionar después:** Si no hay empleados, el sistema invitará visualmente amigablemente al usuario diciendo "Aún no hay empleados" junto al botón "Crear el primero".

- [x] **2.4 Actualizaciones UI Optimistas**
  - **Qué anda mal:** Tras realizar una acción exitosa, a veces la pantalla requiere un refresh manual o presenta un lag hasta que los datos bajan de nuevo.
  - **Cómo lo voy a mejorar:** Inyectando mutaciones optimistas en hooks de frontend o llamando eficientemente a `revalidatePath`.
  - **Cómo debería funcionar después:** La UI reaccionará instantáneamente al clic, dando la sensación de usar una aplicación instalada nativamente.

- [x] **2.5 Refinamiento Responsive Móvil estricto**
  - **Qué anda mal:** Algunas tablas u opciones en el dashboard se rompen u obligan a deslizar erráticamente en resoluciones móviles.
  - **Cómo lo voy a mejorar:** Aplicando clases ocultas de Tailwind para columnas no vitales en móvil, ajustando paddings y grids.
  - **Cómo debería funcionar después:** Una experiencia fluida y nativa incluso en pantallas de celulares chicos, sin necesidad de rediseñar las pantallas actuales.

- [x] **2.6 Consistencia Transaccional Backend (Hardening RPC)** ✅
  - **Qué andaba mal:** Flujos compuestos vulnerables a estados inconsistentes si falla a la mitad de múltiples `await supabase.from...`.
  - **Cómo se mejoró:** Se crearon dos Stored Procedures (RPC) atómicos: `create_employee_transaction` y `submit_checklist_transaction`. Se refactorizaron las rutas API correspondientes eliminando ~100 líneas de rollback manual frágil.
  - **Cómo funciona ahora:** Si falla la creación compleja, ningún dato basura queda escrito. Todo entero o nada ("Transaccionalidad ACID"). Migración desplegada: `20260326000000_employee_and_checklist_atomic_rpcs.sql`.

---

### 3. Operación Continua (Fase Ops - Zero Interfaz)

- [x] **3.1 Runbook Técnico L1/L2 Documentado** ✅
  - **Qué andaba mal:** El conocimiento de resolución de crisis técnicas fluía solo en la memoria del equipo.
  - **Cómo se mejoró:** Escribimos el manual `OPS_RUNBOOK.md` que incluye SOPs sobre cómo leer logs de Vercel (Front), cómo reaccionar a la caída de Base de Datos y cómo hacer Rollback de migraciones.
  - **Cómo funciona ahora:** Cualquier operador en el futuro sabrá qué revisar exactamente (CPU, Logs PGRST) ante un desastre en producción y cómo evitar la corrupción de datos.

- [x] **3.2 Guía de Onboarding/Offboarding Tenant** ✅
  - **Qué andaba mal:** Faltaban políticas trazables escritas y checklists sobre los pasos internos de dar de baja o alta una organización a gran escala.
  - **Cómo se mejoró:** Escribimos el playbook `TENANT_OPS_GUIDE.md` que traza exactamente cómo usar el dashboard de Superadmin, cómo inyectar módulos y cómo realizar offboarding blando (suspensión segura) o offboarding duro (eliminación de storage y DB).
  - **Cómo funciona ahora:** La operación diaria de SaaS Resto es 100% predecible y delega segura en administradores sin riesgo de equivocarse o requerir manipulación directa de SQL por parte de un ingeniero.

---
*Nota: Cualquier requerimiento de pantalla nueva, funcionalidad no preexistente o cambio de modelo de negocio ha sido aislado en `IMPLEMENTACIONES_FUTURAS.md`.*

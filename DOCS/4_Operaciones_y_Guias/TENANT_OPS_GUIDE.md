# 🏢 Tenant Operations Guide (SaaS Resto)

Esta guía (Playbook) detalla los Procedimientos Operativos Estándar (SOP) para el ciclo de vida de los clientes (Tenants) en nuestro sistema multi-inquilino. Debe seguirse de forma estricta para garantizar aislamiento de datos, trazabilidad y seguridad.

## FASE 1: ONBOARDING (Alta de Organización)

### 1.1 Creación desde el Superadmin Dashboard (Vía Recomendada)
El portal de Superadmin (`/superadmin`) gestiona automáticamente la integridad referencial y las asignaciones de planes.

1. Navegar a `/superadmin/organizations`.
2. Crear nueva Organización.
   - Definir `name` y un `slug` amigable (ej. `mi-restaurante`).
   - Asignar el **Plan de Facturación** (ej. Starter, Pro, Enterprise). Esto es crucial porque define límites de módulos y usuarios.
3. El sistema creará automáticamente el registro en la tabla `organizations` y asociará los límites básicos en `organization_settings`.

### 1.2 Provisión del Primer Usuario (Owner / Superadmin Local)
Todo Tenant necesita al menos un usuario clave con rol `company_admin`.

1. En la ficha de la Organización, ir a la sección **Usuarios**.
2. Crear al usuario principal indicando su e-mail corporativo.
3. Asignarle el rol `company_admin`.
   - *Nota de Arquitectura:* Un usuario es agregado a la tabla `user_roles` con el `organization_id` correspondiente. Supabase Auth y el RLS usan este vínculo para autorizar el acceso.
4. Comunicar credenciales / Reseteo de Password al cliente mediante el sistema de correos transaccionales (Supabase Auth).

### 1.3 Activación de Módulos Opcionales
Si el cliente contrató un plan modularizado (ej. solo Checklists sin Recursos Humanos):
1. En la tabla `organization_modules`, verificar encendido/apagado por código de módulo (`checklists`, `documents`, `employees`, etc.).
2. El Root Layout inyecta estos permisos mediante la función cacheadas `getEnabledModules()`.

---

## FASE 2: OFFBOARDING (Baja, Suspensión o Churn)

### 2.1 Offboarding Blando (Suspensión por Inpago)
*Objetivo:* Bloquear el acceso sin destruir los datos ("Soft Delete" lógico).

1. Navegar al perfil de la Organización en el Superadmin.
2. Cambiar la propiedad `status` de la organización de `'active'` a `'suspended'`.
3. **Efecto Técnico:**
   - La API interceptará el estado en el middleware o layout raíz.
   - El RLS de base de datos bloqueará escrituras a organizaciones no activas (comportamiento de solo lectura o bloqueo absoluto).

### 2.2 Offboarding Duro (Borrado Definitivo / Derecho al Olvido)
*Advertencia: Proceso irreversible (Hard Delete).*

1. **Retención de Datos:** Confirmar que ha pasado el periodo de gracia (ej. 30 días post-cancelación) según términos legales.
2. **Purgado de Almacenamiento S3 (Storage):**
   - Borrar manualmente el bucket o carpetas asociadas a la empresa (`<organization_id>/...`).
   - *Nota:* Eliminar registros en base de datos NO borra automáticamente los archivos de Amazon S3/Supabase Storage. Esto debe hacerse primero.
3. **Eliminación en Cascada (Database):**
   - Borrar la fila principal en `organizations`.
   - Si la Foreign Key (`FK`) está configurada con `ON DELETE CASCADE` (comportamiento actual preferido), todas las sucursales, empleados y reportes vinculados serán purgados atómicamente.
   - Si quedan usuarios huérfanos sin otras empresas (`auth.users`), evaluarlos para purga total de membresía.

---

## 🔒 Auditoría y Buenas Prácticas de Soporte (L3)

- **Impersonación (Acceso en nombre del cliente):** NUNCA usar la contraseña del cliente ni alterar datos manuales sin su consentimiento. Para depurar fallas L3, buscar registros en `audit_logs` filtrando por `org_id`.
- **Límites de Facturación (Stripe):** Si un Tenant solicita downgrade, antes de reducir su cuota, se debe auditar (`count_accessible_documents` RPC) que no superen la cuota futura; de lo contrario el downgrade puede romper referencias lógicas.

---

## Referencias operativas relacionadas

- Custom Domains (estado implementado, alcance, checklist y runbook): `DOCS/4_Operaciones_y_Guias/GUIA_CUSTOM_DOMAINS.md`

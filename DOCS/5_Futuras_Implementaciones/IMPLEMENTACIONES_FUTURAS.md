# Implementaciones Futuras (Desarrollo Evolutivo)

Este documento es el repositorio oficial de las **nuevas funcionalidades**, cambios importantes de *flujos de negocio* y la inserción de **nuevas pantallas/UI** que sobrepasaban el alcance de estabilización de la v2.2.

---

## 📅 Producto y Funciones Core

### 1. Recurrencia Avanzada de Checklists
- **Descripción:** Extender el motor de repeticiones actual.
- **Detalle de Implementación Futura:**
  - Agregar soporte a través de un cron/job scheduler incremental.
  - Modelar configuración para repetir de forma: Trimestral, Anual y en "días de semana específicos" (ej: solo Lunes y Viernes).
- **Razón de aplazamiento:** Implicaba cambiar formularios en UI, lógica de guardado y nueva arquitectura de base de datos (Motor de programación / Job Scheduler).

---

## 🛡️ Gobernanza e Infraestructura Operacional

### 2. Pantalla Dedicada Superadmin > Auditoría
- **Descripción:** Visualización de logs de sistema para súper administradores en UI.
- **Detalle de Implementación Futura:**
  - Crear una nueva ruta y pantalla dedicada (`/superadmin/audit`).
  - Tabla UI con filtros avanzados (por acción, inquilino, severidad) y botón de exportación CSV.
- **Razón de aplazamiento:** Creación de nuevas pantallas de interfaz reservadas para ciclo de features interactivos.

### 3. Score de Salud Integral (Health Metrics)
- **Descripción:** Calificación automática en UI del "Riesgo / Salud" por cada cuenta cliente.
- **Detalle de Implementación Futura:**
  - Completar algoritmos de métricas de adopción/uso.
  - Modificar las tarjetas del tenant superadmin agregando recomendaciones predictivas ("Faltan admins", "Inactividad prolongada").
- **Razón de aplazamiento:** Requiere cambios de UI y de lógica de negocio profunda en la evaluación del cliente.

---

## 💳 Seguridad y Autenticación Extensa

### 4. Seguridad / 2FA (MFA)
- **Descripción:** Integración Multi-Factor para loguear usuarios del Dashboard.
- **Detalle de Implementación Futura:**
  - Integrar proveedor MFA real (TOTP de Supabase Auth / SMS / Email) con enrolamiento seguro y *challenge UI*.
  - Mostrar estado real de 2FA por usuario.
  - Rehabilitar UI de `2-Step Verification` del modal de Profile (`company-shell.tsx`).
- **Razón de aplazamiento:** Configuración sin infraestructura funcional real representaba un bloqueo; se pospuso hasta habilitar proveedor de enrolamiento.

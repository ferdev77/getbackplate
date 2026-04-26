# Estado General y Auditoría del Proyecto: GetBackplate SaaS
**Última Actualización (Auditoría de Seguridad y Calidad):** 28 de Marzo de 2026, 07:20 hs (Hora Local).

Este documento sirve como la **Fuente de Verdad (Single Source of Truth) técnica y de estado** para que cualquier nuevo desarrollador del equipo comprenda la arquitectura actual, la madurez del proyecto, y los estándares estrictos implementados tras nuestra Fase de Auditoría y Refactorización Ultra-Profunda.

---

## 1. 📍 Estado Actual de la Plataforma
**Fase Actual:** `Ready for Production (Hardened Phase)`
El código actual ha superado las pruebas de estrés, seguridad, y compilación estática (`Exit Code 0` en compilador TS / Next.js 16).
No existen bugs "Blockers" ni vulnerabilidades de gravedad CRÍTICA pendientes. La UI y flujos de negocio fueron 100% preservados, y el esfuerzo radicó únicamente en la optimización del Backend, el manejo de sesión, persistencia de Base de Datos y Rate Limiting.

---

## 2. 🛡️ Historial Técnico de Auditoría Finalizada
A continuación se detalla la corrección de fallas críticas halladas y solucionadas. **Bajo ningún concepto se deben revertir estos parches de seguridad.**

### Seguridad y Hardening (Completado)
* **Zero-Knowledge User Metadata:** Se prohibió determinantemente inyectar contraseñas en texto plano dentro de la tabla `auth.users` (`user_metadata`). La creación de instancias de usuario ahora se consolida mediante `src/shared/lib/user-provisioning.service.ts` limitándose a los parámetros autorizados de la empresa.
* **Rate Limiting Global:** Implementado en el borde (Edge) mediante `proxy.ts`. Ningún endpoint (especialmente `/api/company/...`) está libre de límites. Esto previene ataques de fuerza bruta hacia la creación de objetos y perfiles.
* **Protección Anti-XSS:** Todas las plantillas de correo (`modules/emails/...`) y el DOM React están sanitizados. Las sentencias destructivas a DB emplean Strict RLS y sentencias encadenadas (`.eq("organization_id", tenant.organizationId)`), mitigando Insecure Direct Object Reference (IDOR).
* **Auditoría Forense en Autenticaciones:** Ahora se aplican logs de auditoría ante la caducidad (cierre) de las sesiones de impersonación (Superadmin a Tenant), permitiendo un trazado legal auditable.
* **Cabeceras de Seguridad (CSP):** `next.config.ts` ajustado para rechazar enmarcados (clickjacking) y endurecer el Content-Security-Policy.

### Performance y Arquitectura (Completado)
* **Des-monolitización de Creación de Usuarios:** Refactorización pesada aislando la lógica asincrónica de Supabase Auth Admin en servicios reusables.
* **Liquidación del Cuello de Botella (O(n)):** La búsqueda interna de usuarios (`findAuthUserByEmail()`) ya no pagina bases de datos enteras in-memory, previniendo latencia infinita y saturación de RAM a escala (usando directamente llamadas RPC/Query refinadas).
* **Paginación Inteligente UI/DB:** `getEmployeeDirectoryView()` reformateado para aceptar `offset` y `limit` (cursor-based), conectando los selectores de los directorios de `Employees` y `Users` de la UI con solicitudes fraccionadas hacia Supabase.
* **Caching de Archivos:** Las evaluaciones de si existe un 'bucket' público se efectúan en caché para reducir RTT. Eliminación de las bifurcaciones y duplicidad de envíos de email post-onboarding.
* **Compilación y Dependencias:** Escaneo NPM Audit limpio de amenazas críticas. Aplicación compilando correctamente contra el servidor de tipos asíncrono de React 19 / Next.js 16.

---

## 3. 🗺️ Mapa de Supervivencia: Cómo Moverse en el Repo
Esta es la estructura mental que rige el diseño de GetBackplate hoy. Respétala:

* **Regla de Oro:** **Prohibido realizar lógicas de negocio intensivas en componentes de interfaz (UI).** 
* **Servicios Compartidos:** Si escribes lógica repetible de auth, tenant o base de datos, agrégala en `src/shared/` o `src/modules/.../services`.
* **Provisión de Users:** El norte o fuente de verdad para creación de Empleados está centralizado en el Action `src/shared/lib/user-provisioning.service.ts`.
* **Auditoría Interna:** Si creas una funcionalidad sensible para un usuario, manda el log de tu acción llamando a `logAuditEvent` definido en `src/shared/lib/audit.ts`.
* **Impersonation:** Para ver lógica de SuperAdmins visualizando tenants, consulta `src/shared/lib/impersonation.ts`.

---

## 4. 🚀 Deuda Técnica Transitoria y Próximos Pasos (Nice to Have)
Actualmente NO HACE FALTA hacer nada apremiante antes de lanzar. Lo que sigue es simplemente iterar en perfeccionamientos:

1. **Memoria Global Diferida:** 
   * *Actual:* Nuestra caché de correos está montada sobre la memoria local de la instancia actual de Next.js (Edge/Workers locales).
   * *Norte:* Emplear en un futuro `Redis/Upstash` para sincronizar esa caché en un clúster distribuido si los servidores escalan a múliples zonas geográficas.
2. **Homologación de Respuestas UI/API:** 
   * *Actual:* Server Actions y API Routes retornan modelos de JSON distintos para ciertos errores.
   * *Norte:* Crear un interceptor estandarizado en TS para que la app siempre reciba y pinte la interfaz de fallas en formato unificado (e.g. `{ error: true, code: "...", message: "..." }`).
3. **Validación de Plan-Limits API:** Considerar extender las comprobaciones contra el módulo "AI" (`api/company/ai`) para interceptar intentos si el Tenant en cuestión quemó su límite del mes del SaaS.

---

## 5. 💳 Estado Billing/Trial (Actualizado)

Se encuentra implementado y operativo el flujo de prueba para suscripciones Stripe con estas reglas:

* **Trial de 30 días para cualquier plan** en tenant elegible.
* **Un solo trial por tenant** (si ya tuvo historial de suscripción, no reaplica trial).
* **Cambio de plan durante trial no extiende ni reinicia** el período de prueba.
* **Tarjeta obligatoria al suscribirse** vía Checkout.
* **Cobro diferido al finalizar los 30 días** cuando el trial fue aplicado.

### Visibilidad en UI (Panel Empresa)
* Se muestra un **badge de "Periodo de prueba"** en el sidebar izquierdo (al fondo del bloque de navegación), con días restantes o "Finaliza hoy".

### Implementación en código (referencia)
* `web/src/modules/billing/services/trial-policy.service.ts`
* `web/src/app/api/stripe/checkout/route.ts`
* `web/src/modules/organizations/queries.ts`
* `web/src/app/(company)/app/layout.tsx`
* `web/src/shared/ui/company-shell.tsx`

---

*Fin del reporte.*

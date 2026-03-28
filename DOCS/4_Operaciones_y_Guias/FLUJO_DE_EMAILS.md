# Documento Maestro: Flujos de Emails y Envío de Invitaciones

Este documento define la **fuente de verdad** sobre cómo funciona el envío y reenvío de correos dentro de GetBackplate, tanto desde el panel de Superadministración como desde los paneles de Empresa.

## 1. Principio Arquitectónico y de Seguridad

Se ha tomado la decisión estricta de **evitar el uso de "Magic Links" o correos nativos de Supabase Auth** (`inviteUserByEmail`, `signInWithOtp`) para el alta de usuarios e invitaciones en flujo regular. 
Esto soluciona los problemas de ruteo, páginas de 404 y redireccionamientos inesperados, garantizando un flujo fluido, corporativo y 100% predecible, al enviar los correos de manera programática mediante la API de **Brevo**.

**Regla de Oro en la Seguridad (Primer Login):**
Todo administrador o empleado nuevo (y todos los existentes que reciben invitación) son generados o actualizados inyectando el metadato:
```json
{
  "force_password_change": true,
  "temporary_password_set_at": "[timestamp]"
}
```
*   **Comportamiento esperado**: La persona inicia sesión por `/auth/login` con la contraseña explícita enviada en el correo. Inmediatamente el sistema lo detecta en el Middleware/Guards y la redirige forzosamente y sin salida a `/auth/change-password?reason=first_login`.

---

## 2. Definición de las Plantillas de Correo y Botones

Las plantillas HTML procesadas se encuentran alojadas de manera centralizada en `web/src/shared/lib/email-templates/invitation.ts`.

### 2.1 Plantilla de Invitación Inicial (`initialInviteTemplate`)
Se envía **únicamente cuando a la persona se le da alta o permiso** (ya sea generando una contraseña aleatoria o asignando una explícitamente).
*   **Contenido esperado:** Mensaje de bienvenida indicando que se ha creado un usuario temporal. Mostrará en pantalla claramente el *Usuario (correo)* y la *Contraseña Temporal*.
*   **Botones de Acción:**
    1.  **"Ingresá con tus credenciales"**: Un único botón primario que envía al usuario directamente al portal base `[TU_DOMINIO]/auth/login`.

### 2.2 Plantilla de Reenvío o Recordatorio (`resendReminderTemplate`)
Se envía cuando el administrador de empresa o el superadministrador abren las tablas y clickean en la acción **"Reenviar Invitación"**.
*   **Contenido esperado:** Un mensaje de que tiene su cuenta activa pero requiere que el usuario lo recuerde y proceda a acceder. Ya NO se le muestra la contraseña nuevamente (por motivos de seguridad, ya que podría estar cambiada).
*   **Botones de Acción:**
    1.  **"Ingresá con tus credenciales"**: Redirige a `[TU_DOMINIO]/auth/login`.
    2.  **"Olvidé mi contraseña"**: Pensando en que el usuario perdió el correo original con la temporal, este enlace redirige a `[TU_DOMINIO]/auth/forgot-password` para que él mismo genere un blanqueo hacia su email.

---

## 3. Flujos de Backend y Rutas Involucradas

Para futuras implementaciones o debugging, así funciona el ruteamiento y disparo por zonas:

### A. Desde el Panel Superadmin (Creando Organizaciones/Admins)
*   **Ubicación Principal**: `web/src/modules/organizations/services/invitation.service.ts`
*   **Creación/Envío Inicial**: Se crea mediante `createUser` de forma silenciosa, y se invoca directamente `initialInviteTemplate`.
*   **Reenvío**: La ruta `web/src/app/api/superadmin/organizations/invitations/resend/route.ts` recibe la orden. Envía directamente `resendReminderTemplate`.

### B. Desde el Panel de Empresa (Creando Empleados o Admins Extra)
*   **Ubicación Principal (Crear Empleado)**: `web/src/app/api/company/employees/route.ts`
*   **Ubicación Principal (Asignar Usuarios)**: `web/src/app/api/company/users/route.ts`
*   **Creación/Envío Inicial**: Si se provee una contraseña, el backend registra el `createUser` (o le hace update si el usuario ya existe para otra sucursal), le estampa el `force_password_change` y le adjunta el correo con la plantilla `initialInviteTemplate` pasándole la contraseña definida por el dueño de la empresa.
*   **Reenvío**: La ruta `web/src/app/api/company/invitations/resend/route.ts` escucha y dispara la plantilla `resendReminderTemplate`.

---

## 4. Preguntas Frecuentes / Troubleshooting

*   **¿Qué pasa si los enlaces de los correos tiran un error 404?**
    Revisa que la variable `NEXT_PUBLIC_APP_URL` esté cargada correctamente y no termine con un *slash* (/) adicional, ya que el servicio la limpia antes de pegar el path. Ejemplo: `https://www.mi-dominio.com` y NO `https://www.mi-dominio.com/`.

*   **¿El correo llega en Spam?**
    Revisar la configuración DNSDKIM/SPF de tu cuenta en Brevo. Todas las llamadas al backend están usando el endpoint oficial `/v3/smtp/email`. Variables env requeridas: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`.

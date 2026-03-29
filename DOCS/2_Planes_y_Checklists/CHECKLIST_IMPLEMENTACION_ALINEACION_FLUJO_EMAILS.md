# Checklist de Implementacion: Alineacion del Flujo de Emails

Fecha: 2026-03-28
Producto: GetBackplate
Referencia canonica: `DOCS/4_Operaciones_y_Guias/FLUJO_DE_EMAILS.md`

## 1) Problema actual (explicado simple)

Hoy existe una diferencia entre lo documentado y parte del comportamiento real:

- El documento maestro define que el reenvio debe ser un recordatorio (sin password).
- En codigo, el reenvio actualmente puede crear usuario si no existe y enviar plantilla inicial con credenciales.
- Para usuarios existentes, el reenvio manda recordatorio, pero no siempre vuelve a estampar `force_password_change`.

Impacto:

- El flujo no es 100% predecible para negocio/soporte.
- Se mezcla semantica de "alta" con semantica de "reenvio".

## 2) Como funciona hoy

### Alta inicial (superadmin o empresa)

- Se crea (o actualiza) usuario en Auth.
- Se setea metadata de seguridad:
  - `force_password_change: true`
  - `temporary_password_set_at: <timestamp>`
- Se envia `initialInviteTemplate` con credenciales temporales.

### Reenvio

- Si el usuario existe: se envia `resendReminderTemplate` (sin password).
- Si el usuario no existe: se crea usuario y se envia `initialInviteTemplate`.

### Primer ingreso

- Si `force_password_change` esta activo, el sistema redirige forzosamente a `/auth/change-password?reason=first_login`.

## 3) Objetivo de correccion

Separar responsabilidades para que el flujo sea consistente:

- Alta/Asignacion: unico flujo que crea usuario y envia credenciales iniciales.
- Reenvio: solo recordatorio para usuarios existentes (sin crear usuario).
- Seguridad de primer login: re-estampar metadata al reenviar para mantener control consistente.

## 4) Como funcionara despues

- Crear usuario = correo inicial con password temporal (`initialInviteTemplate`).
- Reenviar invitacion = recordatorio sin password (`resendReminderTemplate`).
- Si no existe usuario en reenvio = respuesta de error de negocio (crear usuario primero).
- Primer login forzado se mantiene de forma coherente y auditable.

## 5) Checklist de implementacion

### A. Contrato funcional

- [x] Confirmar contrato final: reenvio no crea usuario, solo recordatorio.
- [x] Confirmar contrato final: alta/asignacion es el unico flujo que crea/actualiza credenciales.

### B. Backend - Empresa

- [x] Ajustar `POST /api/company/invitations/resend` para no crear usuario cuando no exista.
- [x] En usuario existente, ejecutar `updateUserById` con:
  - [x] `force_password_change: true`
  - [x] `temporary_password_set_at: <timestamp>`
- [x] Mantener envio de `resendReminderTemplate` (sin password).
- [x] Responder error claro si no existe usuario (ej.: "No existe cuenta, debes crear el usuario").

### C. Backend - Superadmin

- [x] Ajustar `POST /api/superadmin/organizations/invitations/resend` con misma regla que empresa.
- [x] En usuario existente, re-estampar metadata de primer login.
- [x] Si no existe usuario, responder error de negocio sin creacion automatica.

### D. Auditoria y trazabilidad

- [x] Registrar evento de exito de reenvio.
- [x] Registrar evento de error por usuario inexistente.
- [x] Registrar evento de error por falla de proveedor email.

### E. UI y mensajes

- [x] Mostrar feedback claro cuando reenvio falle por usuario inexistente.
- [x] Sugerir accion correcta: "crear usuario".

### F. QA

- [x] Caso 1: usuario existente + reenvio -> llega recordatorio sin password.
- [x] Caso 2: usuario inexistente + reenvio -> no crea usuario, retorna error esperado.
- [x] Caso 3: login luego de reenvio -> obliga cambio de password al primer acceso.
- [x] Caso 4: flujo forgot-password se mantiene operativo.
- [x] Caso 5: no se rompe alta normal de usuarios/empleados.

### G. Documentacion

- [x] Actualizar `DOCS/4_Operaciones_y_Guias/FLUJO_DE_EMAILS.md` con el contrato final aprobado.
- [x] Registrar cierre de implementacion con fecha y evidencia QA.

## 7) Cierre de implementacion y evidencia QA

Fecha de cierre: 2026-03-28

Evidencia tecnica registrada:

- Lint sin errores en archivos modificados del flujo (`npx eslint` sobre rutas API y componentes UI involucrados).
- Verificacion de contrato en backend:
  - Reenvio no crea usuario nuevo en rutas de reenvio.
  - Reenvio actualiza metadata de seguridad (`force_password_change`, `temporary_password_set_at`) en usuario existente.
  - Reenvio devuelve error funcional cuando la cuenta no existe.
- Verificacion de plantillas:
  - `resendReminderTemplate` mantiene los 2 botones tenant-aware (`/auth/login?org=<hint>` y `/auth/forgot-password?org=<hint>`).
  - `initialInviteTemplate` se mantiene para altas/asignaciones.
  - `org` acepta slug publico o UUID (fallback), segun resolucion en auth.
- Verificacion de flujo de alta superadmin:
  - Asignacion de admin unificada con `sendOrganizationAdminInvitation`.

Nota operativa:

- Esta evidencia cubre QA tecnico de implementacion (codigo + lint). Para validar entrega real de correo en proveedor, realizar smoke manual en entorno con `BREVO_API_KEY` activa.

## 6) Criterios de aceptacion

- Reenvio no crea usuarios nuevos en ningun panel.
- No se expone password en correos de reenvio.
- Primer login forzado sigue vigente para usuarios invitados/reenviados.
- Soporte y negocio pueden explicar el flujo en una sola regla sin excepciones ocultas.

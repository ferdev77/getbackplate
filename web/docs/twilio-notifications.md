# Twilio Notifications (SMS y WhatsApp)

## Fuente de verdad

Este documento es la referencia oficial de funcionamiento para notificaciones de `SMS` y `WhatsApp` en el proyecto.

Si hay contradiccion entre mensajes de chat y documentacion, tomar este archivo como canonico.

## Objetivo

Habilitar envio de notificaciones por `SMS` y `WhatsApp` desde:

- modal de crear aviso (`announcements`)
- modal de crear checklist (`checklists`)

## Estado actual

- Avisos: soporta `email`, `sms`, `whatsapp`.
- Checklists: soporta `email`, `sms`, `whatsapp` en creacion de plantilla.
- Audiencia para telefonos: usa **empleados** y **usuarios no-empleado** con telefono.

## Variables de entorno

### Twilio (obligatorias)

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` (SMS)
- `TWILIO_WHATSAPP_NUMBER` (WhatsApp)

### Twilio Trial Mode (opcional)

- `TWILIO_TRIAL_MODE=true`
- Uso recomendado: `development` / `preview` cuando la cuenta Twilio es Trial.
- Comportamiento:
  - SMS: prioriza formato AR `+54...`
  - WhatsApp: prioriza formato AR `+549...`
  - fallback automatico entre variantes si el primer intento falla.

### Email (Brevo) para canal email

- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL` (o `MAIL_FROM`)

## Matriz por entorno

- `Local/Trial`:
  - `TWILIO_TRIAL_MODE=true`
  - SMS en Trial requiere destinatarios verificados en Twilio.
  - WhatsApp en sandbox requiere opt-in (`join <codigo>`) por numero destino.
- `Produccion`:
  - `TWILIO_TRIAL_MODE=false` (o no definir)
  - usar `TWILIO_WHATSAPP_NUMBER` productivo aprobado (no sandbox).

## Flujo funcional

1. Usuario crea aviso o checklist desde modal.
2. Selecciona canales en `Notificar tambien via`.
3. Backend resuelve audiencia por alcance tenant (`locations`, `departments`, `positions`, `users`).
4. Se recolectan contactos desde:
   - `employees` (empleados)
   - `organization_user_profiles` (usuarios no-empleado con telefono)
5. Para `email` usa Brevo (`sendTransactionalEmail`).
6. Para `sms/whatsapp` usa Twilio (`sendTwilioMessage`).

## Archivos clave

- Twilio client: `web/src/infrastructure/twilio/client.ts`
- Avisos:
  - UI modal: `web/src/shared/ui/announcement-create-modal.tsx`
  - Action: `web/src/modules/announcements/actions.ts`
  - Delivery service: `web/src/modules/announcements/services/deliveries.ts`
- Checklists:
  - UI modal: `web/src/modules/checklists/ui/checklist-upsert-modal.tsx`
  - Action: `web/src/modules/checklists/actions.ts`

## Reglas de audiencia

- Un usuario puede recibir notificacion aunque no sea empleado, si:
  - pertenece al tenant (`memberships.active`) y/o esta seleccionado en scope,
  - tiene telefono en `organization_user_profiles.phone` o en `employees.phone`.
- Scope aplicado por prioridad:
  - `users` explicitos,
  - filtros por `locations`, `department_ids`, `position_ids`,
  - cuando no hay filtros, aplica audiencia general del tenant.

## Errores comunes y diagnostico rapido

- `SMS no enviado` en Trial:
  - verificar destinatario en `Verified Caller IDs`.
  - revisar formato AR (`+54` vs `+549`) y `TWILIO_TRIAL_MODE`.
- `WhatsApp no llega`:
  - sandbox: confirmar opt-in del numero destino (`join <codigo>`).
  - revisar que `TWILIO_WHATSAPP_NUMBER` sea el sender correcto.
- `Email no llega`:
  - revisar `BREVO_API_KEY` y `BREVO_SENDER_EMAIL/MAIL_FROM`.

## Notas operativas

- Si Twilio no esta configurado, el envio Twilio falla de forma controlada sin romper la creacion del aviso/checklist.
- En `announcement_deliveries`, estado `sent` indica aceptacion del intento de envio en backend; el estado final de entrega se valida en Twilio Console.

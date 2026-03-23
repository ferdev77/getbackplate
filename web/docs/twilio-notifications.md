# Twilio Notifications (SMS y WhatsApp)

## Objetivo

Habilitar envio de notificaciones por `SMS` y `WhatsApp` desde:

- modal de crear aviso (`announcements`)
- modal de crear checklist (`checklists`)

## Variables de entorno requeridas

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` (SMS)
- `TWILIO_WHATSAPP_NUMBER` (WhatsApp)

Opcional para pruebas con cuenta Trial:

- `TWILIO_TRIAL_MODE=true`
  - habilita normalizacion automatica AR por canal (`+54` para SMS y `+549` para WhatsApp, con fallback)

## Flujo funcional

1. Usuario crea aviso o checklist desde modal.
2. Selecciona canales en `Notificar tambien via`.
3. Backend resuelve audiencia por alcance tenant (`locations`, `departments`, `positions`, `users`).
4. Para `email` usa Brevo (`sendTransactionalEmail`).
5. Para `sms/whatsapp` usa Twilio (`sendTwilioMessage`).

## Archivos clave

- Twilio client: `web/src/infrastructure/twilio/client.ts`
- Avisos:
  - UI modal: `web/src/shared/ui/announcement-create-modal.tsx`
  - Action: `web/src/modules/announcements/actions.ts`
  - Delivery service: `web/src/modules/announcements/services/deliveries.ts`
- Checklists:
  - UI modal: `web/src/modules/checklists/ui/checklist-upsert-modal.tsx`
  - Action: `web/src/modules/checklists/actions.ts`

## Notas operativas

- Si Twilio no esta configurado, el envio Twilio falla de forma controlada sin romper la creacion del aviso/checklist.
- El envio usa telefonos de `employees.phone` + `employees.phone_country_code` normalizados a formato internacional.

# Notificaciones operativas (email)

## Objetivo

Unificar envios email transaccionales de negocio sin depender de plantillas de autenticacion de Supabase.

## Flujos activos

- Avisos (`announcements`):
  - canal `email` disponible en modal de creacion/edicion
  - se encola en `announcement_deliveries`
  - cron procesa y envia por Brevo
- Checklists enviados (`checklist_submissions`):
  - envio de resumen por email a la audiencia del alcance de la plantilla
  - incluye plantilla, cantidad de items, incidencias y link a reportes
- Documentos compartidos por email:
  - accion manual por documento desde modulo Documentos
  - endpoint dedicado genera link firmado (24h) y envia correo

## Variables de entorno requeridas

- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL` (o `MAIL_FROM`)
- `BREVO_SENDER_NAME` (opcional)
- `NEXT_PUBLIC_APP_URL` (para links de plataforma en templates)

## Componentes tecnicos

- Cliente email:
  - `web/src/infrastructure/email/client.ts`
- Resolucion de emails por `user_id`:
  - `web/src/shared/lib/auth-users.ts`
- Cron de entregas avisos:
  - `web/src/app/api/internal/cron/deliveries/route.ts`
  - `web/src/modules/announcements/services/deliveries.ts`
- Alta/edicion de avisos:
  - `web/src/modules/announcements/actions.ts`
  - `web/src/shared/ui/announcement-create-modal.tsx`
- Envio email al enviar checklist:
  - `web/src/modules/checklists/actions.ts`
- Compartir documento por email:
  - `web/src/app/api/company/documents/share-email/route.ts`
  - `web/src/modules/documents/ui/documents-tree-workspace.tsx`

## Migraciones relacionadas

- `supabase/migrations/202603200003_announcement_deliveries_email_channel.sql`
  - agrega `email` al check constraint de `announcement_deliveries.channel`

## Observaciones

- Invitaciones de cuenta (Auth) siguen por Supabase (`Invite user`/`Magic Link`).
- Notificaciones de negocio (avisos/checklists/documentos) salen por Brevo.
- Si un usuario no tiene email en `auth.users`, no se incluye como destinatario.

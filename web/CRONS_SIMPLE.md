# Tareas Automaticas (Cron) - Explicacion simple

Este proyecto usa **solo Vercel Cron**. Definidos en `web/vercel.json`.

## Que cron jobs estan activos

| Ruta | Schedule | Frecuencia |
|---|---|---|
| `/api/internal/cron/daily` | `0 8 * * *` | Una vez al día (08:00 UTC) |
| `/api/webhooks/cron/process-recurrence` | `0 9 * * *` | Una vez al día (09:00 UTC) |
| `/api/webhooks/cron/qbo-r365-sync` | `0 0,4,10,12,14,16,18,20,21,22 * * *` | 10 veces al día |
| `/api/webhooks/cron/qbo-webhook-process` | `*/5 * * * *` | Cada 5 minutos |
| `/api/internal/cron/qbo-cdc-reconcile` | `30 6 * * *` | Una vez al día (06:30 UTC) |
| `/api/internal/cron/push-scheduled-send` | `0 * * * *` | Cada hora en punto |

## Que hace cada uno

### 1) `/api/internal/cron/daily`
Es el cron maestro de mantenimiento diario.

Hace estas tareas:
- Limpia papelera vieja de documentos.
- Procesa trabajos pendientes de documentos.
- Procesa entregas pendientes de anuncios.
- Limpia eventos viejos de Stripe.
- Corre recordatorios de documentos vencidos o pendientes.

En palabras simples: hace la "limpieza y mantenimiento general" del sistema.

### 2) `/api/webhooks/cron/process-recurrence`
Procesa trabajos programados en calendario (tabla `scheduled_jobs`).

En palabras simples: dispara tareas que estaban agendadas para hoy.

### 3) `/api/webhooks/cron/qbo-r365-sync`
Ejecuta sincronizaciones activas de QuickBooks -> R365.

En palabras simples: trae facturas y corre la integracion automaticamente.

### 4) `/api/webhooks/cron/qbo-webhook-process`
Procesa recibos de webhook firmados que ya fueron guardados de forma durable y reintenta confirmaciones de desconexion pendientes.

En palabras simples: permite responder rapido a Intuit sin perder eventos y recupera trabajo si una funcion serverless se interrumpe.

### 5) `/api/internal/cron/qbo-cdc-reconcile`
Consulta cambios recientes de Invoice y CreditMemo para recuperar notificaciones que Intuit no haya entregado. Solo considera transacciones enviadas por email y respeta la deduplicacion existente.

En palabras simples: es la red de seguridad diaria para webhooks perdidos.

### 6) `/api/internal/cron/push-scheduled-send`
Procesa la cola de notificaciones (push y/o email) que el superadmin programo para una hora especifica desde `/superadmin/notifications` (tabla `notification_broadcasts`, reemplaza desde 2026-06-29 a las viejas `push_send_logs`/`push_scheduled_sends`).

En palabras simples: cada hora en punto, revisa si hay algun envio programado para ese momento y lo manda. Corre cada hora (no una vez al dia) porque la programacion solo admite horas en punto.

## Seguridad

Los cron endpoints no son publicos para cualquiera.
Todos validan un secreto por header:

`Authorization: Bearer <CRON_SECRET>`

Si falta ese header o el secreto es incorrecto, devuelven `401 Unauthorized`.

## Nota sobre frecuencias de sincronizacion QBO

- En UI solo se permite `manual`, `daily` o `weekly`.
- Si existiera alguna config vieja en `hourly`, el sistema la trata como `daily` para mantener compatibilidad.

## Regla operativa

No usar cron-job.org para estos endpoints si ya estan en Vercel, para evitar ejecuciones duplicadas.

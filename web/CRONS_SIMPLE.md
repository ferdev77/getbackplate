# Tareas Automaticas (Cron) - Explicacion simple

Este proyecto usa **solo Vercel Cron** para ejecutar tareas automaticas una vez por dia.

## Que cron jobs estan activos

Definidos en `web/vercel.json`:

1. `/api/internal/cron/daily`
2. `/api/webhooks/cron/process-recurrence`
3. `/api/webhooks/cron/qbo-r365-sync`

Todos corren en frecuencia diaria.

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

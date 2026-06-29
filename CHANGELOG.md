# Changelog

## 2026-06-29 — Centro de notificaciones unificado (email+push), WhatsApp eliminado, backlog de migraciones reconciliado

Guía técnica completa en [`DOCS/4_Operaciones_y_Guias/GUIA_PUSH_NOTIFICATIONS.md`](DOCS/4_Operaciones_y_Guias/GUIA_PUSH_NOTIFICATIONS.md).

- **WhatsApp eliminado** como canal de notificación en toda la plataforma (avisos y checklists). El código de Twilio sigue existiendo, solo se dejó de invocar con ese canal.
- **SMS oculto** de la UI (constante `SHOW_SMS_CHANNEL = false` en los modales de avisos y checklists) sin tocar el backend — reactivarlo es solo volver a mostrar el botón.
- **Tabla `notifications` nueva**: registra automáticamente todo email y todo push que la plataforma envía (no solo avisos — billing, invitaciones, recordatorios de documentos, links de pago, todo). Logging centralizado e instrumentado dentro de `sendTransactionalEmail()` y `sendPushToOrg()`/`sendPushToUsers()`.
- **Campanita (`NotificationBell`)** nueva, visible para los 4 tipos de usuario: superadmin, admin de empresa, empleado, y usuario de organización sin ficha de empleado. Badge de canal (email/push), click navega a `action_url`, tiempo real vía Supabase Realtime.
- **Panel de superadmin migrado**: `/superadmin/push` (solo push) → `/superadmin/notifications` (push y/o email, a un usuario, una organización, o todas). `/superadmin/push` quedó como redirect para no romper bookmarks. Tabla `notification_broadcasts` reemplaza a `push_send_logs`/`push_scheduled_sends`, con backfill del histórico.
- **Bug de fondo corregido de paso**: el CHECK constraint de `announcement_deliveries.channel` permitía `whatsapp` pero nunca incluyó `push`, aunque el código ya permitía elegirlo — cualquier aviso con canal push fallaba el insert.
- **Backlog de 13 migraciones previas (QBO/facturación) reconciliado**: estaban con drift real entre archivo local, tracking (`schema_migrations`) y estado físico en dev/prod desde antes de este trabajo. Se auditó cada una contra el esquema real de ambas bases (no solo contra el tracking) y se aplicaron las que faltaban de verdad. Se encontró y corrigió un caso de tracking falso en DEV: `20260620000001` (restringe `qbo_r365_template`/`template` a `'by_item'`) estaba marcada como aplicada pero el constraint real seguía permitiendo los 4 valores viejos — 2 filas de prueba en `integration_settings` tenían `'by_account'`, lo que hacía fallar el `ALTER` silenciosamente. Se migraron esas 2 filas a `'by_item'` y se aplicó el constraint correctamente.
- **Índice de migraciones (`SUPABASE_MIGRATIONS.md`) reordenado y corregido**: tenía un hueco real de 9 migraciones (`20260620000001/2`, `20260621000001`, `20260623000001/2/3/5`, `20260625000002/3`) nunca documentadas, el encabezado decía 127 migraciones cuando ya había 144/145, y una fila tenía el archivo equivocado (`20260623000004` estaba documentado con el contenido de `push_integration_alerts`, cuando ese archivo real es `20260623000006` — el verdadero `20260623000004` es `invoice_allowance_override.sql`, nunca documentado). Verificado fila por fila contra los archivos reales en disco (`supabase/migrations/` + `web/supabase/migrations/`): ahora son 145 filas, sin huecos, en orden cronológico exacto.

Migraciones nuevas: `20260629000001`, `20260629000002`, `20260629000003`. Aplicadas en DEV y PROD el mismo día, junto con la reconciliación completa del backlog previo (ver `SUPABASE_MIGRATIONS.md` filas 130–144).

**Actualización 09:55 — push pasa a ser siempre automático en avisos y checklists, email queda como la única opción real:**
- **Avisos**: se quitó el botón "Push" del modal de creación (ya no es una elección) — queda fijo siempre activo vía `<input type="hidden" name="notify_channel" value="push" />` más un forzado del lado servidor en `modules/announcements/actions.ts` (no depende solo del cliente). El botón "Email" sigue siendo la única opción real.
- **Checklists**: no existía ninguna llamada de push para este feature — se construyó de cero (`sendChecklistAudiencePush()` en `checklist-audience.service.ts`, usa `sendPushToUsers()` con los `userIds` que ya resolvía `resolveAudienceContacts` para el email, antes sin usar). Se llama siempre, sin condicionarla al botón de email.
- **Documentos** (recordatorios de vencimiento/pendiente): sin cambios — sigue mandando push y email siempre, sin ninguna opción, porque es 100% automático por cron y no se pidió construir un toggle ahí todavía.

---

## 2026-06-23 — Sistema de push notifications: PWA, programación, segmentación y alertas de integración QBO → R365

Guía técnica completa en [`DOCS/4_Operaciones_y_Guias/GUIA_PUSH_NOTIFICATIONS.md`](DOCS/4_Operaciones_y_Guias/GUIA_PUSH_NOTIFICATIONS.md).

- **Instalación de la PWA**: ícono `apple-touch-icon` corregido para iOS (`web/src/app/layout.tsx`). Botón "Instalar app" nuevo (`web/src/shared/lib/use-pwa-install.ts`), visible solo en mobile/tablet, oculto en ambas landings y cuando la app ya corre en modo standalone (`display-mode: standalone` / `navigator.standalone`).
- **Envío programado**: el superadmin puede programar un push para una hora en punto futura (no rango libre) desde `/superadmin/push`, y cancelarlo antes de que se dispare. Cron nuevo `/api/internal/cron/push-scheduled-send` (cada hora, ver `web/CRONS_SIMPLE.md`). Tabla `push_scheduled_sends`.
- **Segmentación por usuario**: además de por organización, el superadmin puede enviar (ahora o programado) a usuarios específicos que ya tengan push activo. `push_send_logs` y `push_scheduled_sends` ganan `target_type`/`user_ids`/`user_count`.
- **Alertas de integración QBO → R365 para superadmin**: el superadmin puede suscribirse (`notify_integration_alerts` en `push_subscriptions`, gateado a superadmin en `/api/push/subscribe`) para recibir un push de cualquier organización cuando un webhook no se puede identificar, cuando una factura se envía con éxito a R365, o cuando falla el envío. Nunca notifica el descarte legítimo de clientes sin sync config.
- **Fix de fondo en el pipeline QBO**: antes de este trabajo, un error de token/conexión/FTP en el envío en vivo a R365 podía perderse sin dejar rastro (solo consola). Ahora siempre queda en `integration_runs.error_summary` o `qbo_webhook_events.last_error`, tanto en el camino en vivo (`web/src/modules/integrations/qbo-r365/service.ts`) como en el cron de recovery `processQboUnifiedQueue()`.

Migraciones: `20260618000001`, `20260618000002`, `20260621000002`, `20260622000001`, `20260623000004` (ver `SUPABASE_MIGRATIONS.md` filas 128–132). Aplicadas en DEV y PROD.

---

## 2026-06-04 — Auditoría y corrección de bugs

Auditoría completa de la app de punta a punta. Se identificaron y corrigieron 6 bugs.

---

### 1. Checklists recurrentes — empleados no podían re-entregar entre períodos

**Archivo:** `web/src/app/api/employee/checklists/submit/route.ts`

La verificación de "ya enviado" bloqueaba al empleado si alguna vez había entregado ese checklist, sin importar en qué período. El cron ya actualizaba `last_run_at` correctamente como marcador de período, pero el endpoint de submit no lo consultaba.

**Fix:** antes de bloquear, se consulta `scheduled_jobs.last_run_at` para ese template. Si la submission existente es anterior al último run del cron, se permite re-entregar. Si no hay `last_run_at` (checklist sin recurrencia), se mantiene el bloqueo original.

---

### 2. Nueva opción "Sin recurrencia" en checklists

**Archivos:** `web/src/shared/ui/recurrence-selector.tsx`, `web/src/modules/checklists/services/checklist-template.service.ts`

El selector de frecuencia no tenía opción para checklists de una sola vez. Toda checklist activa creaba un `scheduled_job`, haciendo que todas se comportaran como recurrentes.

**Fix:** se agregó la opción `"Sin recurrencia (una sola vez)"` al selector. El service no crea `scheduled_job` cuando `recurrenceType === "none"` y elimina el job existente si un template se edita de recurrente a sin recurrencia.

---

### 3. Doble envío de anuncios en ejecuciones concurrentes

**Archivos:** `web/src/modules/announcements/services/deliveries.ts`, `supabase/migrations/20260604000001_announcement_deliveries_processing_status.sql`

`processAnnouncementDeliveries` leía las filas con `status = 'queued'` sin reservarlas. Si dos procesos corrían al mismo tiempo (cron diario + cron de recurrencia, o cron + trigger manual), ambos procesaban las mismas filas y mandaban el mismo anuncio dos veces.

**Fix:** migración que agrega `'processing'` al CHECK constraint de `announcement_deliveries.status` (aplicada en DEV y PROD). El service ahora hace un claim atómico: `UPDATE status='processing' WHERE status='queued'` antes de procesar. Solo trabaja con las filas que realmente reclamó.

---

### 4. Período de facturas QBO incorrecto para planes anuales

**Archivo:** `web/src/app/api/company/integrations/qbo-r365/dashboard/route.ts`

El dashboard calculaba el inicio del período de facturas siempre como `periodEnd - 1 mes`, sin importar si el plan del cliente era mensual o anual. Clientes con plan anual veían conteo de solo el último mes en lugar del año completo.

**Fix:** se agrega `billing_period` al SELECT del plan. Si es `'yearly'` se restan 12 meses; si es `'monthly'` (o default) se resta 1 mes.

---

### 5. Token QBO ausente causaba loop infinito de reintentos de Intuit

**Archivo:** `web/src/app/api/webhooks/qbo/route.ts`

Si `QBO_WEBHOOK_VERIFIER_TOKEN` no estaba configurado, `verifyQboWebhookSignature` lanzaba una excepción sin capturar. El servidor devolvía 500, Intuit interpretaba el error como falla transitoria y reintentaba indefinidamente.

**Fix:** la llamada a `verifyQboWebhookSignature` queda envuelta en `try/catch`. Si falla, `signatureValid = false`, se loguea un warning y el handler retorna 200. Intuit para de reintentar.

---

### 6. Imports sin uso en rutas de Stripe

**Archivos:** `web/src/app/api/stripe/checkout/route.ts`, `checkout-addon/route.ts`, `billing-portal/route.ts`

Los tres archivos importaban `isSuperadminImpersonating` sin usarlo, remanente de cuando el acceso estaba bloqueado durante impersonación. Esa restricción fue removida intencionalmente para permitir soporte real desde superadmin.

**Fix:** imports eliminados.

---

### Migraciones aplicadas

| Migración | DEV | PROD |
|-----------|-----|------|
| `20260604000001_announcement_deliveries_processing_status.sql` | ✅ | ✅ |

### Commit

`e33a83f` — fix: auditoría 2026-06-04 — checklists, deliveries, QBO, Stripe, recurrencia

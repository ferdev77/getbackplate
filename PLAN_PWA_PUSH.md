# Plan de implementación — PWA + Push Notifications

Dos funcionalidades a implementar:
1. **App instalable** en celular, tablet y computadora (PWA)
2. **Notificaciones push** al dispositivo, incluso con la app cerrada

Marcar cada paso con `[x]` al completarlo.

---

## PRE-IMPLEMENTACIÓN — Configuración inicial

- [x] Generar claves VAPID ejecutando `npx web-push generate-vapid-keys` dentro de `web/`
- [x] Agregar las tres variables al `.env.local` del proyecto:
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_EMAIL`
- [x] Agregar esas mismas variables al dashboard de Vercel (Environment Variables)
- [x] Actualizar `web/.env.example` con las tres variables VAPID (sin valores reales)

---

## FASE 1 — App instalable (PWA base)

- [x] Generar íconos PNG desde el logo SVG existente y guardarlos en `web/public/icons/`:
  - `icon-192x192.png`
  - `icon-512x512.png`
  - `icon-maskable-512x512.png`
- [x] Crear `web/public/manifest.webmanifest`
- [x] Crear `web/src/app/pwa-register.tsx` — componente cliente que registra el service worker
- [x] Modificar `web/src/app/layout.tsx`:
  - Agregar `manifest` y `appleWebApp` al objeto `metadata`
  - Agregar `<PwaRegister />` dentro del `<body>`
- [x] Agregar en `web/next.config.ts` los headers de caché para `/sw.js` y `/manifest.webmanifest`

---

## FASE 2 — Service Worker

- [x] Crear `web/public/sw.js` con:
  - Handler del evento `push` (muestra la notificación)
  - Handler del evento `notificationclick` (abre la app en la URL correcta)

---

## FASE 3 — Backend de notificaciones

- [x] Instalar dependencias dentro de `web/`: `web-push` y `@types/web-push`
- [x] Crear y ejecutar la migración SQL en Supabase: tabla `push_subscriptions` con RLS
- [x] Crear `web/src/infrastructure/push/web-push.ts` — wrapper de la librería web-push con las claves VAPID
- [x] Crear `web/src/infrastructure/push/send-to-org.ts` — envío masivo a todos los dispositivos activos de una organización
- [x] Crear `web/src/app/api/push/subscribe/route.ts` — guarda la suscripción de un dispositivo en la BD
- [x] Crear `web/src/app/api/push/unsubscribe/route.ts` — marca una suscripción como inactiva

---

## FASE 4 — Frontend: solicitud de permisos

- [x] Crear `web/src/shared/ui/push-permission.tsx` — solicita permiso al usuario y lo suscribe
- [x] Agregar `<PushPermissionManager>` en `web/src/app/(company)/app/layout.tsx`
- [x] Agregar `<PushPermissionManager>` en `web/src/app/(employee)/portal/layout.tsx`

---

## FASE 5 — Integración con el pipeline de avisos existente

- [x] Modificar `web/src/modules/announcements/services/deliveries.ts` — agregar el canal `push` al pipeline de entregas junto a email y SMS

---

## FASE 6 — Testing en dispositivos reales

- [ ] Probar instalación de la app en **Android** (Chrome mobile) — aparece ícono en pantalla de inicio
- [ ] Probar instalación de la app en **iPhone** (Safari, iOS 16.4+) — aparece ícono en pantalla de inicio
- [ ] Probar instalación de la app en **PC** (Chrome o Edge en Windows) — aparece ícono en escritorio o taskbar
- [ ] Probar push notification completa en **Android**: publicar aviso → dispositivo recibe notificación
- [ ] Probar push notification completa en **iPhone**
- [ ] Probar push notification completa en **PC** (Windows)
- [ ] Verificar que el pipeline de email y SMS existente no se rompió
- [ ] Verificar que la app pasa el deploy en Vercel sin errores

---

## Resumen de archivos

| Archivo | Acción | Estado |
|---|---|---|
| `web/public/manifest.webmanifest` | Crear | ✅ |
| `web/public/icons/icon-*.png` | Crear (3 íconos) | ✅ |
| `web/public/sw.js` | Crear | ✅ |
| `web/src/app/pwa-register.tsx` | Crear | ✅ |
| `web/src/shared/ui/push-permission.tsx` | Crear | ✅ |
| `web/src/infrastructure/push/web-push.ts` | Crear | ✅ |
| `web/src/infrastructure/push/send-to-org.ts` | Crear | ✅ |
| `web/src/app/api/push/subscribe/route.ts` | Crear | ✅ |
| `web/src/app/api/push/unsubscribe/route.ts` | Crear | ✅ |
| `supabase/migrations/20260618000001_push_subscriptions.sql` | Crear | ✅ |
| `web/src/app/layout.tsx` | Modificar | ✅ |
| `web/next.config.ts` | Modificar | ✅ |
| `web/src/app/(company)/app/layout.tsx` | Modificar | ✅ |
| `web/src/app/(employee)/portal/layout.tsx` | Modificar | ✅ |
| `web/src/modules/announcements/services/deliveries.ts` | Modificar | ✅ |
| `web/.env.example` | Modificar | ✅ |

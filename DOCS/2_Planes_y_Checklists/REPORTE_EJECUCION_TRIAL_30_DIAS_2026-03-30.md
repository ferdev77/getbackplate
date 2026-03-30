# Reporte de Ejecucion - Trial 30 Dias

Fecha: 2026-03-30  
Estado: Ejecutado y validado

## 1) Regla de negocio aplicada

- Se habilito periodo de prueba de 30 dias para cualquier plan.
- Aplica una sola vez por tenant.
- Cambiar de plan durante trial no extiende ni reinicia el reloj.

## 2) Comportamiento de cobro (Stripe)

- En flujo de trial, el cliente ingresa tarjeta al suscribirse.
- Stripe no cobra en el momento del alta cuando el trial fue aplicado.
- El primer cobro de suscripcion ocurre al finalizar los 30 dias.

## 3) Regla de elegibilidad implementada

Un tenant es elegible al trial si:

- no tiene suscripcion activa/trialing actual,
- y no tiene historial previo en tabla `subscriptions`.

Si ya tuvo suscripcion antes, no vuelve a recibir trial.

## 4) Donde se ve en la interfaz

- Panel empresa (sidebar izquierdo), al fondo del contenedor de opciones de navegacion.
- Se muestra badge "Periodo de prueba" con dias restantes (o "Finaliza hoy").

## 5) Archivos modificados

- `web/src/modules/billing/services/trial-policy.service.ts`
- `web/src/app/api/stripe/checkout/route.ts`
- `web/src/modules/organizations/queries.ts`
- `web/src/app/(company)/app/layout.tsx`
- `web/src/shared/ui/company-shell.tsx`

## 6) Validaciones ejecutadas

- `npm run lint` -> OK
- `npm run build` -> OK
- `npm run verify:smoke-modules` -> OK

## 7) Notas operativas

- El badge de trial depende del estado sincronizado de suscripcion.
- Puede existir una demora corta entre checkout completado y visualizacion del estado, segun llegada del webhook.

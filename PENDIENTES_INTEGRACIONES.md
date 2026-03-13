# Pendientes de integraciones futuras

## Seguridad / 2FA
- Se removio temporalmente la seccion visual de `2-Step Verification` del modal de Profile en `web/src/shared/ui/company-shell.tsx`.
- Motivo: evitar UI de configuracion sin flujo real de enrolamiento/verificacion.
- Pendiente futuro:
  - Integrar proveedor MFA real (TOTP/SMS/Email) con enrolamiento y challenge.
  - Exponer estado real de 2FA por usuario y metodo confirmado.
  - Rehabilitar UI de 2FA cuando el flujo completo de backend + UX este operativo.

## Billing / Metodo de pago
- Se removio del modal de plan la linea de snapshot `**** last4 · Facturas ON/OFF` en `web/src/shared/ui/company-shell.tsx`.
- Motivo: evitar mostrar datos de pago simulados o no conectados a pasarela real.
- Pendiente futuro:
  - Integrar proveedor de billing/pagos real.
  - Mostrar metodo de pago e indicadores de facturacion solo con datos reales sincronizados.

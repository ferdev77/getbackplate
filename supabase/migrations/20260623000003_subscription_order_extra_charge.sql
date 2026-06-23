-- ============================================================
-- Cargo unico adicional en un link de suscripcion (catch-up).
--
-- Permite sumar, a la misma Stripe Checkout Session en modo subscription,
-- un item de pago unico ademas del precio recurrente -- mismo mecanismo
-- ya usado para el setup fee. Solo informativo/auditoria en esta tabla:
-- no requiere logica de webhook porque Stripe cobra el item unico junto
-- con la primera factura sin que nuestro sistema tenga que reaccionar.
-- ============================================================

alter table public.manual_subscription_orders
  add column if not exists extra_charge_cents integer,
  add column if not exists extra_charge_description text;

alter table public.manual_subscription_orders
  drop constraint if exists mso_extra_charge_nonneg;
alter table public.manual_subscription_orders
  add constraint mso_extra_charge_nonneg
  check (extra_charge_cents is null or extra_charge_cents > 0);

comment on column public.manual_subscription_orders.extra_charge_cents is
  'Monto en centavos de un cargo unico adicional (ej. catch-up de facturas ya enviadas sin facturar) sumado a la misma Checkout Session, cobrado una sola vez junto con el primer pago de la suscripcion.';

-- ============================================================
-- Cantidad de conexiones extra (slots) elegidas al generar un
-- Link de Suscripcion. Hoy ese numero solo iba a la metadata de
-- Stripe (extraSlotCount); se persiste aca para que el email de
-- invitacion pueda mostrar esa linea de pricing.
-- ============================================================

alter table public.manual_subscription_orders
  add column if not exists extra_connection_count integer not null default 0;

comment on column public.manual_subscription_orders.extra_connection_count is
  'Cantidad de conexiones R365 extra recurrentes ($80/mes c/u) incluidas en este link de suscripcion.';

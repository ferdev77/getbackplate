-- ============================================================
-- Estado de "enviado por email" para Links de Pago y Links de Suscripcion.
-- Solo informativo, para que el icono de la UI persista entre recargas
-- quien recibio el link y cuando, sin volver a calcularlo en memoria.
-- ============================================================

alter table public.manual_payment_orders
  add column if not exists email_sent_to text,
  add column if not exists email_sent_at timestamptz;

alter table public.manual_subscription_orders
  add column if not exists email_sent_to text,
  add column if not exists email_sent_at timestamptz;

comment on column public.manual_payment_orders.email_sent_to is
  'Ultima direccion de email a la que se le mando este link desde la UI de superadmin.';
comment on column public.manual_subscription_orders.email_sent_to is
  'Ultima direccion de email a la que se le mando este link desde la UI de superadmin.';

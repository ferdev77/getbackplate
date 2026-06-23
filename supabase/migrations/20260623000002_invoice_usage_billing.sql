-- ============================================================
-- Cobro por factura enviada (uso), sumado a la renovacion de la
-- suscripcion de integracion QBO-R365.
--
-- qbo_unified_invoices.first_sent_at: marcador inmutable de la PRIMERA vez
-- que una factura llego a 'enviada'. A diferencia de sent_at (que se
-- pisa en cada reenvio), este campo nunca se vuelve a tocar una vez
-- seteado -- es la base para contar "facturas enviadas este periodo"
-- sin que un reenvio infle el conteo o lo mueva a otro periodo.
--
-- organization_addons.price_per_invoice_cents: precio por factura para
-- esa organizacion puntual (NULL = sin cobro de uso, comportamiento
-- actual para el resto de las organizaciones). Editable en cualquier
-- momento desde superadmin, independiente de la suscripcion en Stripe.
--
-- organization_addons.last_usage_billed_through: hasta que fin-de-periodo
-- ya se facturo el uso -- evita duplicar el invoice item si el webhook
-- de invoice.upcoming llegara a dispararse mas de una vez para el mismo
-- periodo.
-- ============================================================

alter table public.qbo_unified_invoices
  add column if not exists first_sent_at timestamptz;

update public.qbo_unified_invoices
  set first_sent_at = sent_at
  where pipeline_status = 'enviada' and first_sent_at is null;

alter table public.organization_addons
  add column if not exists price_per_invoice_cents integer,
  add column if not exists last_usage_billed_through timestamptz;

alter table public.organization_addons
  drop constraint if exists oa_price_per_invoice_nonneg;
alter table public.organization_addons
  add constraint oa_price_per_invoice_nonneg
  check (price_per_invoice_cents is null or price_per_invoice_cents >= 0);

comment on column public.qbo_unified_invoices.first_sent_at is
  'Fecha de la PRIMERA vez que esta factura llego a enviada. Inmutable -- un reenvio nunca la toca. Usada para contar facturas de uso sin duplicar por reenvios.';
comment on column public.organization_addons.price_per_invoice_cents is
  'Precio en centavos por cada factura enviada a R365 durante el periodo, sumado como invoice item en la renovacion de Stripe. NULL = sin cobro de uso.';
comment on column public.organization_addons.last_usage_billed_through is
  'Fin del ultimo periodo de facturacion ya cobrado por uso -- evita duplicar el invoice item ante reintentos del webhook de invoice.upcoming.';

-- ============================================================
-- Override de facturas incluidas, por organizacion.
--
-- El cobro por factura enviada (organization_addons.price_per_invoice_cents)
-- debe respetar lo que el plan ya incluye gratis (plans.invoices_included)
-- mas los creditos comprados aparte (organization_addons.invoice_balance) --
-- solo se cobra el EXCEDENTE sobre eso, no el total enviado.
--
-- invoice_allowance_override permite forzar ese "incluido" para una
-- organizacion puntual (caso especial, ej. un cliente sin setup fee pagado
-- al que se le cobra TODO sin descuento): si esta seteado (incluido 0),
-- reemplaza por completo el calculo de plan+balance para esa organizacion.
-- NULL (default) = usar el calculo normal de plan + balance.
-- ============================================================

alter table public.organization_addons
  add column if not exists invoice_allowance_override integer;

alter table public.organization_addons
  drop constraint if exists oa_invoice_allowance_override_nonneg;
alter table public.organization_addons
  add constraint oa_invoice_allowance_override_nonneg
  check (invoice_allowance_override is null or invoice_allowance_override >= 0);

comment on column public.organization_addons.invoice_allowance_override is
  'Si esta seteado (incluido 0), reemplaza el calculo normal de facturas incluidas (plan.invoices_included + invoice_balance) para el cobro por uso de esta organizacion puntual. NULL = usar el calculo normal.';

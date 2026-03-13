-- Agrega precio comercial a planes SaaS

alter table public.plans
  add column if not exists price_amount numeric(10,2),
  add column if not exists currency_code text,
  add column if not exists billing_period text;

update public.plans
set
  currency_code = coalesce(currency_code, 'USD'),
  billing_period = coalesce(billing_period, 'monthly')
where true;

alter table public.plans
  alter column currency_code set default 'USD',
  alter column billing_period set default 'monthly';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plans_price_amount_non_negative'
  ) then
    alter table public.plans
      add constraint plans_price_amount_non_negative
      check (price_amount is null or price_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plans_currency_code_format'
  ) then
    alter table public.plans
      add constraint plans_currency_code_format
      check (currency_code ~ '^[A-Z]{3}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'plans_billing_period_check'
  ) then
    alter table public.plans
      add constraint plans_billing_period_check
      check (billing_period in ('monthly', 'yearly', 'one_time', 'custom'));
  end if;
end $$;

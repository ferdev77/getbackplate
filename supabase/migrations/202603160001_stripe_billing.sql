-- Migración para añadir tablas base para Stripe (Customer Mapping y Subscriptions)

-- 1. Tabla para enlazar organizations con Stripe Customers
create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade unique,
  stripe_customer_id text not null unique,
  created_at timestamp with time zone default now() not null
);

-- 2. Tabla para almacenar el estado de la suscripción de Stripe de forma cacheada
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null references public.stripe_customers(stripe_customer_id) on delete cascade,
  status text not null check (status in ('trialing', 'active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'paused')),
  price_id text not null, -- El ID del "Price" en el dashboard de Stripe
  plan_id uuid references public.plans(id) on delete set null, -- Referencia opcional cruzada a tu tabla de planes (útil si quieres hacer JOIN local)
  quantity integer default 1 not null,
  cancel_at_period_end boolean default false not null,
  current_period_start timestamp with time zone not null,
  current_period_end timestamp with time zone not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Indices para rendimiento
create index if not exists subscriptions_organization_id_idx on public.subscriptions(organization_id);
create index if not exists subscriptions_stripe_subscription_id_idx on public.subscriptions(stripe_subscription_id);

-- Encerramos las operaciones RLS básicas para el "Tenant"
alter table public.stripe_customers enable row level security;
alter table public.subscriptions enable row level security;

-- Policies para stripe_customers
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'stripe_customers_tenant_select') then
    create policy stripe_customers_tenant_select on public.stripe_customers
      for select to authenticated
      using (
        organization_id in (
          select organization_id from memberships where user_id = auth.uid() and status = 'active'
        )
      );
  end if;
end $$;

-- Policies para subscriptions
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'subscriptions_tenant_select') then
    create policy subscriptions_tenant_select on public.subscriptions
      for select to authenticated
      using (
        organization_id in (
          select organization_id from memberships where user_id = auth.uid() and status = 'active'
        )
      );
  end if;
end $$;

-- Triggers de "Updated at"
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.subscriptions'::regclass) then
    create trigger set_updated_at
      before update on public.subscriptions
      for each row
      execute function public.handle_updated_at();
  end if;
end $$;

-- Add stripe_price_id to plans to enable automatic organization plan assignments
alter table public.plans
add column if not exists stripe_price_id text unique;

-- Permite que los broadcasts de push (inmediatos y programados) puedan apuntar a usuarios
-- especificos en vez de organizaciones completas.

alter table push_send_logs
  add column if not exists target_type text not null default 'orgs' check (target_type in ('orgs', 'users')),
  add column if not exists user_ids text[] not null default '{}',
  add column if not exists user_count int not null default 0;

alter table push_scheduled_sends
  add column if not exists target_type text not null default 'orgs' check (target_type in ('orgs', 'users')),
  add column if not exists user_ids text[] not null default '{}';

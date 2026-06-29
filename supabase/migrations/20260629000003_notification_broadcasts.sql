-- Generaliza push_send_logs + push_scheduled_sends en una sola tabla que soporta
-- push y/o email en el mismo broadcast (centro de notificaciones de superadmin).
-- push_send_logs y push_scheduled_sends quedan de solo lectura para historico viejo.

create table public.notification_broadcasts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    text not null,
  channels      text[] not null default '{}',
  title         text not null,
  body          text not null,
  image_url     text,
  action_url    text,
  target_type   text not null check (target_type in ('orgs', 'users')),
  target_all    boolean not null default false,
  org_ids       text[] not null default '{}',
  user_ids      text[] not null default '{}',
  scheduled_at  timestamptz,
  status        text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  sent_at       timestamptz,
  cancelled_at  timestamptz,
  cancelled_by  text,
  push_sent     int not null default 0,
  push_expired  int not null default 0,
  push_failed   int not null default 0,
  email_sent    int not null default 0,
  email_failed  int not null default 0
);

alter table public.notification_broadcasts enable row level security;

create policy "notification_broadcasts_service_all"
  on public.notification_broadcasts
  for all
  to service_role
  using (true)
  with check (true);

create policy "notification_broadcasts_superadmin_select"
  on public.notification_broadcasts
  for select
  to authenticated
  using (public.is_superadmin());

create index idx_notification_broadcasts_pending on public.notification_broadcasts (scheduled_at) where status = 'pending';
create index idx_notification_broadcasts_created_at on public.notification_broadcasts (created_at desc);

-- Backfill de historial ya enviado (push_send_logs) para no perder el historico en el panel nuevo.
insert into public.notification_broadcasts (
  created_at, created_by, channels, title, body, image_url,
  target_type, target_all, org_ids, user_ids,
  status, sent_at, push_sent, push_expired, push_failed
)
select
  created_at, sent_by, array['push'], title, body, image_url,
  target_type, false, org_ids, user_ids,
  'sent', created_at, sent, expired, failed
from public.push_send_logs;

-- Backfill de programados aun pendientes (push_scheduled_sends) para no perderlos en la transicion.
insert into public.notification_broadcasts (
  created_at, created_by, channels, title, body, image_url,
  target_type, target_all, org_ids, user_ids, scheduled_at,
  status, sent_at, cancelled_at, cancelled_by, push_sent, push_expired, push_failed
)
select
  created_at, created_by, array['push'], title, body, image_url,
  target_type, target_all, org_ids, user_ids, scheduled_at,
  status, sent_at, cancelled_at, cancelled_by, sent, expired, failed
from public.push_scheduled_sends
where status in ('pending', 'sent', 'cancelled', 'failed');

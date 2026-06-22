-- Push scheduled sends: permite al superadmin programar un broadcast push para una hora futura (en punto).
create table if not exists push_scheduled_sends (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    text not null,
  title         text not null,
  body          text not null,
  image_url     text,
  target_all    boolean     not null default false,
  org_ids       text[] not null default '{}',
  scheduled_at  timestamptz not null,
  status        text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  sent_at       timestamptz,
  cancelled_at  timestamptz,
  cancelled_by  text,
  sent          int not null default 0,
  expired       int not null default 0,
  failed        int not null default 0
);

alter table push_scheduled_sends enable row level security;

create policy "service_role full access push_scheduled_sends"
  on push_scheduled_sends
  for all
  to service_role
  using (true)
  with check (true);

create index idx_push_scheduled_sends_pending on push_scheduled_sends (scheduled_at) where status = 'pending';
create index idx_push_scheduled_sends_created_at on push_scheduled_sends (created_at desc);

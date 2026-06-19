create table if not exists push_send_logs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  sent_by     text not null,
  title       text not null,
  body        text not null,
  image_url   text,
  org_ids     text[] not null default '{}',
  orgs_count  int not null default 0,
  sent        int not null default 0,
  expired     int not null default 0,
  failed      int not null default 0
);

alter table push_send_logs enable row level security;

-- Solo service_role puede leer/escribir
create policy "service_role full access push_send_logs"
  on push_send_logs
  for all
  to service_role
  using (true)
  with check (true);

create index idx_push_send_logs_created_at on push_send_logs (created_at desc);

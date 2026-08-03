-- Expired deliveries are terminal work that was intentionally not sent.
alter table public.announcement_deliveries
  drop constraint if exists announcement_deliveries_status_check;

alter table public.announcement_deliveries
  add constraint announcement_deliveries_status_check
  check (status in ('queued', 'processing', 'sent', 'failed', 'expired'));

-- Do not admit new work for announcements that are not currently visible.
create or replace function public.guard_announcement_delivery_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  announcement_publish_at timestamptz;
  announcement_expires_at timestamptz;
begin
  select publish_at, expires_at
    into announcement_publish_at, announcement_expires_at
  from public.announcements
  where id = new.announcement_id
    and organization_id = new.organization_id;

  if not found
    or (announcement_publish_at is not null and announcement_publish_at > statement_timestamp())
    or (announcement_expires_at is not null and announcement_expires_at <= statement_timestamp()) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_announcement_delivery_lifecycle
  on public.announcement_deliveries;
create trigger trg_guard_announcement_delivery_lifecycle
  before insert on public.announcement_deliveries
  for each row execute function public.guard_announcement_delivery_lifecycle();

-- Clear old queued work immediately. Claimed rows are rechecked by the worker.
update public.announcement_deliveries as delivery
set status = 'expired'
from public.announcements as announcement
where delivery.announcement_id = announcement.id
  and delivery.organization_id = announcement.organization_id
  and delivery.status = 'queued'
  and (
    (announcement.publish_at is not null and announcement.publish_at > statement_timestamp())
    or (announcement.expires_at is not null and announcement.expires_at <= statement_timestamp())
  );

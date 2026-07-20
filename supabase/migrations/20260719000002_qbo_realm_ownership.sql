alter table public.integration_connections
  add column if not exists realm_id_hash text;

do $$
begin
  alter table public.integration_connections
    add constraint integration_connections_qbo_realm_hash_check
    check (
      realm_id_hash is null
      or (
        provider = 'quickbooks_online'
        and realm_id_hash ~ '^[0-9a-f]{64}$'
      )
    );
exception
  when duplicate_object then null;
end $$;

create unique index if not exists uq_integration_connections_qbo_realm
  on public.integration_connections (realm_id_hash)
  where provider = 'quickbooks_online'
    and realm_id_hash is not null;

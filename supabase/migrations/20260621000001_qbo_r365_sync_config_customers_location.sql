-- El "Account Number" (codigo de ubicacion R365) de cada cliente QBO se resuelve
-- una sola vez al agregar la sucursal al grupo, y se cachea aca — el envio a R365
-- ya no necesita volver a preguntarle a QuickBooks en cada corrida.
alter table public.qbo_r365_sync_config_customers
  add column if not exists r365_location text;

-- Backfill: los grupos de 1 solo cliente (ej. Kumori) ya tenian su location
-- cacheado en el padre desde antes de esta tabla existir — lo heredamos.
update public.qbo_r365_sync_config_customers c
set r365_location = p.r365_location
from public.qbo_r365_sync_configs p
where c.sync_config_id = p.id
  and c.r365_location is null
  and p.r365_location is not null;

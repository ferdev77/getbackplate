-- Permite que un superadmin se suscriba a alertas push de eventos de integraciones
-- (QBO -> R365): identificacion fallida de un webhook, envio exitoso, o error de envio.
alter table push_subscriptions
  add column if not exists notify_integration_alerts boolean not null default false;

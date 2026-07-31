-- notify_integration_alerts (agregada en 20260623000006_push_integration_alerts.sql)
-- nunca llego a leerse desde ningun lado: notifyIntegrationEvent() manda las
-- alertas de QBO -> R365 a todo superadmin con push activo, sin filtrar por
-- esta columna. La UI que deberia haberla seteado (IntegrationAlertsCard)
-- tampoco la escribe: llama a subscribeToPush() sin ese flag. Se elimina como
-- codigo/columna muerta -- el comportamiento real (push automatico a todo
-- superadmin con push activo) queda sin cambios.
alter table public.push_subscriptions
  drop column if exists notify_integration_alerts;

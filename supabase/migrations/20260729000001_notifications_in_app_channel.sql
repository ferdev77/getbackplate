-- Permite un tercer canal "in_app": una notificacion garantizada en la campanita
-- que no depende de que el push o el email se hayan podido entregar. Antes,
-- una fila en `notifications` solo se creaba como efecto secundario de un envio
-- de push/email exitoso; si el usuario nunca acepto el permiso de push del
-- navegador, no quedaba ningun registro aunque el sistema lo hubiera
-- identificado correctamente como destinatario por alcance.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_channel_check
  CHECK (channel IN ('email', 'push', 'in_app'));

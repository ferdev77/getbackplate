-- Elimina announcement_audiences.
--
-- Era un segundo sistema de audiencia en paralelo a announcements.target_scope.
-- Nunca restringio nada: buildAnnouncementAudienceRows siempre insertaba una
-- fila comodin (user_id y branch_id en null) que la condicion del filtro daba
-- por cumplida para cualquier lector. Verificado sobre datos reales antes de
-- quitarlo: todos los avisos de produccion y desarrollo tenian exactamente una
-- fila comodin.
--
-- 20260729000003 ya saco el filtro de can_read_announcement, y el mismo cambio
-- de aplicacion elimino la escritura de la tabla. A esta altura no queda nada
-- que la lea ni que la escriba, asi que solo restan filas huerfanas.
--
-- La unica fuente de verdad del alcance de un aviso es target_scope.

drop table if exists public.announcement_audiences;

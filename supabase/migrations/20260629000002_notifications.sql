-- Centro de notificaciones: registra cada email y cada push que la plataforma envia,
-- para mostrarlos en la "campanita" de cada usuario (superadmin, admin de empresa, empleado,
-- y usuario de organizacion sin ficha de empleado).

CREATE TABLE public.notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel         TEXT        NOT NULL CHECK (channel IN ('email', 'push')),
  title           TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  action_url      TEXT,
  source          TEXT        NOT NULL,
  source_id       TEXT,
  recipient_email TEXT,
  status          TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  read_at         TIMESTAMPTZ,
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by      TEXT
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- El usuario ve solo sus propias notificaciones
CREATE POLICY "notifications_own_select"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- El usuario solo puede marcar como leidas las suyas
CREATE POLICY "notifications_own_update"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Superadmin ve todas (panel de historial del centro de notificaciones)
CREATE POLICY "notifications_superadmin_select"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

-- Solo el backend (service_role) inserta/borra
CREATE POLICY "notifications_service_all"
  ON public.notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_org ON public.notifications (organization_id);
CREATE INDEX idx_notifications_source ON public.notifications (source, source_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END
$$;

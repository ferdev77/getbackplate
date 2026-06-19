-- Push subscriptions: guarda el endpoint de cada dispositivo suscrito a push notifications.
-- Un usuario puede tener múltiples suscripciones (celular + PC + tablet).

CREATE TABLE public.push_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- El usuario solo puede ver y modificar sus propias suscripciones
CREATE POLICY "push_subscriptions_own"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role puede leer todas para enviar desde el backend
CREATE POLICY "push_subscriptions_service_read"
  ON public.push_subscriptions
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "push_subscriptions_service_write"
  ON public.push_subscriptions
  FOR UPDATE
  TO service_role
  USING (true);

CREATE INDEX idx_push_subscriptions_user    ON public.push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_org     ON public.push_subscriptions(org_id);
CREATE INDEX idx_push_subscriptions_active  ON public.push_subscriptions(org_id) WHERE is_active = true;

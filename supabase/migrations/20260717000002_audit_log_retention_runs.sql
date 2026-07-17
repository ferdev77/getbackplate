-- Durable history for audit-log retention. This lives outside audit_logs so
-- the cleanup job cannot delete its own execution record.
CREATE TABLE IF NOT EXISTS public.system_maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  records_affected integer NOT NULL DEFAULT 0 CHECK (records_affected >= 0),
  cutoff_at timestamptz,
  error_message text,
  ran_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_maintenance_logs_task_ran_at_idx
  ON public.system_maintenance_logs (task, ran_at DESC);

ALTER TABLE public.system_maintenance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_maintenance_logs_superadmin_select ON public.system_maintenance_logs;
CREATE POLICY system_maintenance_logs_superadmin_select
  ON public.system_maintenance_logs
  FOR SELECT
  TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS system_maintenance_logs_service_all ON public.system_maintenance_logs;
CREATE POLICY system_maintenance_logs_service_all
  ON public.system_maintenance_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.purge_expired_audit_logs(p_cutoff timestamptz)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.audit_logs
    WHERE created_at < p_cutoff
    RETURNING 1
  )
  SELECT count(*)::integer INTO deleted_count FROM deleted;

  INSERT INTO public.system_maintenance_logs (
    task,
    status,
    records_affected,
    cutoff_at
  ) VALUES (
    'audit_logs_retention',
    'success',
    deleted_count,
    p_cutoff
  );

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_audit_logs(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_audit_logs(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.purge_expired_audit_logs(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_audit_logs(timestamptz) TO service_role;

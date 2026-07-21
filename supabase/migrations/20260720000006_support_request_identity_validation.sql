-- Validate authenticated support identity against a current Company Admin
-- membership or an active superadmin impersonation at write time.

CREATE OR REPLACE FUNCTION public.validate_support_request_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.identity_source = 'public' THEN
    IF NEW.requester_user_id IS NOT NULL OR NEW.authenticated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Public support requests cannot contain authenticated identity evidence';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.requester_user_id IS NULL OR NEW.authenticated_at IS NULL THEN
    RAISE EXCEPTION 'Authenticated support identity evidence is incomplete';
  END IF;

  -- Tenant deletion intentionally clears organization_id while retaining the
  -- historical authenticated account identifier and timestamp.
  IF TG_OP = 'UPDATE'
     AND OLD.identity_source = 'authenticated'
     AND OLD.organization_id IS NOT NULL
     AND NEW.organization_id IS NULL
     AND NEW.requester_user_id = OLD.requester_user_id
     AND NEW.authenticated_at = OLD.authenticated_at THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated support requests require an organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships membership
    JOIN public.roles role ON role.id = membership.role_id
    WHERE membership.user_id = NEW.requester_user_id
      AND membership.organization_id = NEW.organization_id
      AND membership.status = 'active'
      AND role.code = 'company_admin'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.superadmin_impersonation_sessions session
    WHERE session.superadmin_user_id = NEW.requester_user_id
      AND session.organization_id = NEW.organization_id
      AND session.revoked_at IS NULL
      AND session.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Authenticated support requester is not authorized for this organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_support_request_identity ON public.support_requests;
CREATE TRIGGER trg_validate_support_request_identity
  BEFORE INSERT OR UPDATE OF identity_source, requester_user_id, authenticated_at, organization_id
  ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_support_request_identity();

NOTIFY pgrst, 'reload schema';

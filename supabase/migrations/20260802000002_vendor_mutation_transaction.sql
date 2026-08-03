-- Atomic, tenant-safe vendor create/update with canonical location semantics.
-- A global vendor has exactly one vendor_locations row with branch_id = NULL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.vendors vendor
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.vendor_locations location
      WHERE location.vendor_id = vendor.id
    )
  ) THEN
    RAISE EXCEPTION 'vendor_location_integrity: vendors without locations require manual classification'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendor_locations location
    JOIN public.vendors vendor ON vendor.id = location.vendor_id
    WHERE location.organization_id <> vendor.organization_id
  ) THEN
    RAISE EXCEPTION 'vendor_location_integrity: vendor organization mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendor_locations location
    JOIN public.branches branch ON branch.id = location.branch_id
    WHERE location.branch_id IS NOT NULL
      AND location.organization_id <> branch.organization_id
  ) THEN
    RAISE EXCEPTION 'vendor_location_integrity: branch organization mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vendor_locations
    GROUP BY vendor_id
    HAVING count(*) FILTER (WHERE branch_id IS NULL) > 1
       OR (
         count(*) FILTER (WHERE branch_id IS NULL) > 0
         AND count(*) FILTER (WHERE branch_id IS NOT NULL) > 0
       )
  ) THEN
    RAISE EXCEPTION 'vendor_location_integrity: ambiguous global location rows require manual classification'
      USING ERRCODE = '23514';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS vendors_id_organization_uk
  ON public.vendors (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS branches_id_organization_uk
  ON public.branches (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_locations_one_global_uk
  ON public.vendor_locations (vendor_id)
  WHERE branch_id IS NULL;

ALTER TABLE public.vendor_locations
  DROP CONSTRAINT IF EXISTS vendor_locations_vendor_id_fkey;

DO $$ BEGIN
  ALTER TABLE public.vendor_locations
    ADD CONSTRAINT vendor_locations_vendor_tenant_fkey
    FOREIGN KEY (vendor_id, organization_id)
    REFERENCES public.vendors (id, organization_id)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.vendor_locations
  DROP CONSTRAINT IF EXISTS vendor_locations_branch_id_fkey;

DO $$ BEGIN
  ALTER TABLE public.vendor_locations
    ADD CONSTRAINT vendor_locations_branch_tenant_fkey
    FOREIGN KEY (branch_id, organization_id)
    REFERENCES public.branches (id, organization_id)
    ON DELETE NO ACTION
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.save_vendor_transaction(
  p_organization_id uuid,
  p_vendor_id uuid,
  p_actor_id uuid,
  p_patch jsonb,
  p_replace_locations boolean,
  p_branch_ids uuid[],
  p_employee_scope_ids uuid[]
)
RETURNS TABLE (
  vendor_id uuid,
  vendor_name text,
  branch_ids uuid[],
  is_global boolean,
  created boolean,
  branches_changed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_existing_branch_ids uuid[] := '{}'::uuid[];
  v_existing_is_global boolean := false;
  v_final_branch_ids uuid[] := '{}'::uuid[];
  v_final_is_global boolean := false;
  v_location_count integer := 0;
  v_created boolean := false;
  v_branches_changed boolean := false;
  v_allowed_keys constant text[] := ARRAY[
    'name', 'category', 'contact_name', 'contact_email', 'contact_phone',
    'contact_whatsapp', 'website_url', 'address', 'notes', 'is_active'
  ];
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'invalid_vendor_payload' USING ERRCODE = '22023';
  END IF;

  IF p_patch - v_allowed_keys <> '{}'::jsonb THEN
    RAISE EXCEPTION 'invalid_vendor_payload' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'name' AND (
    jsonb_typeof(p_patch -> 'name') <> 'string'
    OR btrim(p_patch ->> 'name') = ''
    OR length(p_patch ->> 'name') > 200
  ) THEN
    RAISE EXCEPTION 'invalid_vendor_payload' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'category' AND (
    jsonb_typeof(p_patch -> 'category') <> 'string'
    OR btrim(p_patch ->> 'category') = ''
    OR length(p_patch ->> 'category') > 80
  ) THEN
    RAISE EXCEPTION 'invalid_vendor_payload' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'is_active' AND jsonb_typeof(p_patch -> 'is_active') <> 'boolean' THEN
    RAISE EXCEPTION 'invalid_vendor_payload' USING ERRCODE = '22023';
  END IF;

  IF (p_patch ? 'contact_name' AND length(p_patch ->> 'contact_name') > 200)
     OR (p_patch ? 'contact_email' AND length(p_patch ->> 'contact_email') > 300)
     OR (p_patch ? 'contact_phone' AND length(p_patch ->> 'contact_phone') > 50)
     OR (p_patch ? 'contact_whatsapp' AND length(p_patch ->> 'contact_whatsapp') > 50)
     OR (p_patch ? 'website_url' AND length(p_patch ->> 'website_url') > 500)
     OR (p_patch ? 'address' AND length(p_patch ->> 'address') > 500)
     OR (p_patch ? 'notes' AND length(p_patch ->> 'notes') > 2000) THEN
    RAISE EXCEPTION 'invalid_vendor_payload' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'category' THEN
    PERFORM 1
    FROM public.vendor_categories category
    WHERE category.organization_id = p_organization_id
      AND category.code = p_patch ->> 'category'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_vendor_category' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_employee_scope_ids IS NOT NULL THEN
    IF cardinality(p_employee_scope_ids) = 0 THEN
      RAISE EXCEPTION 'vendor_employee_scope_empty' USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public.branches branch
    WHERE branch.id = ANY(p_employee_scope_ids)
    ORDER BY branch.id
    FOR SHARE;

    IF EXISTS (SELECT 1 FROM unnest(p_employee_scope_ids) scope_id WHERE scope_id IS NULL)
       OR cardinality(p_employee_scope_ids) <> (
         SELECT count(DISTINCT scope_id)::integer FROM unnest(p_employee_scope_ids) scope_id
       )
       OR (
         SELECT count(*)
         FROM public.branches branch
         WHERE branch.organization_id = p_organization_id
           AND branch.is_active = true
           AND branch.id = ANY(p_employee_scope_ids)
       ) <> cardinality(p_employee_scope_ids) THEN
      RAISE EXCEPTION 'vendor_location_out_of_scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_vendor_id IS NULL OR p_replace_locations THEN
    IF p_branch_ids IS NULL
       OR EXISTS (SELECT 1 FROM unnest(p_branch_ids) branch_id WHERE branch_id IS NULL)
       OR cardinality(p_branch_ids) <> (
         SELECT count(DISTINCT branch_id)::integer FROM unnest(p_branch_ids) branch_id
       ) THEN
      RAISE EXCEPTION 'invalid_vendor_location' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.branches branch
    WHERE branch.id = ANY(p_branch_ids)
    ORDER BY branch.id
    FOR SHARE;

    IF (
      SELECT count(*)
      FROM public.branches branch
      WHERE branch.organization_id = p_organization_id
        AND branch.is_active = true
        AND branch.id = ANY(p_branch_ids)
    ) <> cardinality(p_branch_ids) THEN
      RAISE EXCEPTION 'invalid_vendor_location' USING ERRCODE = '22023';
    END IF;

    IF p_employee_scope_ids IS NOT NULL THEN
      IF cardinality(p_branch_ids) = 0 THEN
        RAISE EXCEPTION 'vendor_employee_scope_empty' USING ERRCODE = '42501';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM unnest(p_branch_ids) requested_id
        WHERE NOT (requested_id = ANY(p_employee_scope_ids))
      ) THEN
        RAISE EXCEPTION 'vendor_location_out_of_scope' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF p_vendor_id IS NULL THEN
    IF NOT p_replace_locations OR NOT (p_patch ? 'name') OR NOT (p_patch ? 'category') THEN
      RAISE EXCEPTION 'invalid_vendor_payload' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.vendors (
      organization_id,
      name,
      category,
      contact_name,
      contact_email,
      contact_phone,
      contact_whatsapp,
      website_url,
      address,
      notes,
      is_active,
      created_by
    ) VALUES (
      p_organization_id,
      p_patch ->> 'name',
      p_patch ->> 'category',
      p_patch ->> 'contact_name',
      p_patch ->> 'contact_email',
      p_patch ->> 'contact_phone',
      p_patch ->> 'contact_whatsapp',
      p_patch ->> 'website_url',
      p_patch ->> 'address',
      p_patch ->> 'notes',
      COALESCE((p_patch ->> 'is_active')::boolean, true),
      p_actor_id
    )
    RETURNING * INTO v_vendor;

    v_created := true;
    v_branches_changed := true;
  ELSE
    SELECT * INTO v_vendor
    FROM public.vendors vendor
    WHERE vendor.id = p_vendor_id
      AND vendor.organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'vendor_not_found' USING ERRCODE = 'P0002';
    END IF;

    SELECT
      COALESCE(array_agg(location.branch_id ORDER BY location.branch_id)
        FILTER (WHERE location.branch_id IS NOT NULL), '{}'::uuid[]),
      COALESCE(bool_or(location.branch_id IS NULL), false),
      count(*)::integer
    INTO v_existing_branch_ids, v_existing_is_global, v_location_count
    FROM public.vendor_locations location
    WHERE location.vendor_id = v_vendor.id
      AND location.organization_id = p_organization_id;

    IF v_location_count = 0
       OR (v_existing_is_global AND cardinality(v_existing_branch_ids) > 0) THEN
      RAISE EXCEPTION 'vendor_location_integrity' USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public.branches branch
    WHERE branch.id = ANY(v_existing_branch_ids)
    ORDER BY branch.id
    FOR SHARE;

    IF (
      SELECT count(*)
      FROM public.branches branch
      WHERE branch.organization_id = p_organization_id
        AND branch.is_active = true
        AND branch.id = ANY(v_existing_branch_ids)
    ) <> cardinality(v_existing_branch_ids) THEN
      RAISE EXCEPTION 'invalid_vendor_location' USING ERRCODE = '22023';
    END IF;

    IF p_employee_scope_ids IS NOT NULL
       AND NOT v_existing_is_global
       AND NOT EXISTS (
         SELECT 1
         FROM unnest(v_existing_branch_ids) existing_id
         WHERE existing_id = ANY(p_employee_scope_ids)
       ) THEN
      RAISE EXCEPTION 'vendor_out_of_scope' USING ERRCODE = '42501';
    END IF;

    IF p_patch <> '{}'::jsonb THEN
      UPDATE public.vendors vendor
      SET
        name = CASE WHEN p_patch ? 'name' THEN p_patch ->> 'name' ELSE vendor.name END,
        category = CASE WHEN p_patch ? 'category' THEN p_patch ->> 'category' ELSE vendor.category END,
        contact_name = CASE WHEN p_patch ? 'contact_name' THEN p_patch ->> 'contact_name' ELSE vendor.contact_name END,
        contact_email = CASE WHEN p_patch ? 'contact_email' THEN p_patch ->> 'contact_email' ELSE vendor.contact_email END,
        contact_phone = CASE WHEN p_patch ? 'contact_phone' THEN p_patch ->> 'contact_phone' ELSE vendor.contact_phone END,
        contact_whatsapp = CASE WHEN p_patch ? 'contact_whatsapp' THEN p_patch ->> 'contact_whatsapp' ELSE vendor.contact_whatsapp END,
        website_url = CASE WHEN p_patch ? 'website_url' THEN p_patch ->> 'website_url' ELSE vendor.website_url END,
        address = CASE WHEN p_patch ? 'address' THEN p_patch ->> 'address' ELSE vendor.address END,
        notes = CASE WHEN p_patch ? 'notes' THEN p_patch ->> 'notes' ELSE vendor.notes END,
        is_active = CASE WHEN p_patch ? 'is_active' THEN (p_patch ->> 'is_active')::boolean ELSE vendor.is_active END
      WHERE vendor.id = v_vendor.id
      RETURNING * INTO v_vendor;
    END IF;
  END IF;

  IF v_created OR p_replace_locations THEN
    IF NOT v_created THEN
      DELETE FROM public.vendor_locations location
      WHERE location.vendor_id = v_vendor.id
        AND location.organization_id = p_organization_id;
    END IF;

    IF cardinality(p_branch_ids) = 0 THEN
      INSERT INTO public.vendor_locations (vendor_id, organization_id, branch_id)
      VALUES (v_vendor.id, p_organization_id, NULL);
    ELSE
      INSERT INTO public.vendor_locations (vendor_id, organization_id, branch_id)
      SELECT v_vendor.id, p_organization_id, requested_id
      FROM unnest(p_branch_ids) requested_id;
    END IF;
  END IF;

  SELECT
    COALESCE(array_agg(location.branch_id ORDER BY location.branch_id)
      FILTER (WHERE location.branch_id IS NOT NULL), '{}'::uuid[]),
    COALESCE(bool_or(location.branch_id IS NULL), false),
    count(*)::integer
  INTO v_final_branch_ids, v_final_is_global, v_location_count
  FROM public.vendor_locations location
  WHERE location.vendor_id = v_vendor.id
    AND location.organization_id = p_organization_id;

  IF v_location_count = 0
     OR (v_final_is_global AND cardinality(v_final_branch_ids) > 0) THEN
    RAISE EXCEPTION 'vendor_location_integrity' USING ERRCODE = '23514';
  END IF;

  IF NOT v_created THEN
    v_branches_changed := v_existing_is_global IS DISTINCT FROM v_final_is_global
      OR v_existing_branch_ids IS DISTINCT FROM v_final_branch_ids;
  END IF;

  vendor_id := v_vendor.id;
  vendor_name := v_vendor.name;
  branch_ids := v_final_branch_ids;
  is_global := v_final_is_global;
  created := v_created;
  branches_changed := v_branches_changed;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.save_vendor_transaction(uuid, uuid, uuid, jsonb, boolean, uuid[], uuid[])
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_vendor_transaction(uuid, uuid, uuid, jsonb, boolean, uuid[], uuid[])
  FROM anon;
REVOKE ALL ON FUNCTION public.save_vendor_transaction(uuid, uuid, uuid, jsonb, boolean, uuid[], uuid[])
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_vendor_transaction(uuid, uuid, uuid, jsonb, boolean, uuid[], uuid[])
  TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.vendors FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.vendor_locations FROM anon, authenticated;

DROP POLICY IF EXISTS "vendors_employee_select" ON public.vendors;
CREATE POLICY "vendors_employee_select"
  ON public.vendors
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.memberships membership
      JOIN public.roles role ON role.id = membership.role_id
      JOIN public.employee_module_permissions permission
        ON permission.membership_id = membership.id
       AND permission.organization_id = membership.organization_id
       AND permission.module_code = 'vendors'
       AND permission.can_view = true
      WHERE membership.organization_id = vendors.organization_id
        AND membership.user_id = auth.uid()
        AND membership.status = 'active'
        AND role.code = 'employee'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.vendor_locations location
        WHERE location.vendor_id = vendors.id
          AND location.organization_id = vendors.organization_id
          AND location.branch_id IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.memberships membership
        LEFT JOIN public.employees employee
          ON employee.organization_id = membership.organization_id
         AND employee.user_id = membership.user_id
        WHERE membership.organization_id = vendors.organization_id
          AND membership.user_id = auth.uid()
          AND membership.status = 'active'
          AND (
            membership.all_locations = true
            OR employee.all_locations = true
            OR EXISTS (
              SELECT 1
              FROM public.vendor_locations location
              WHERE location.vendor_id = vendors.id
                AND location.organization_id = vendors.organization_id
                AND location.branch_id IS NOT NULL
                AND (
                  location.branch_id = membership.branch_id
                  OR location.branch_id = ANY(COALESCE(membership.location_scope_ids, '{}'::uuid[]))
                  OR location.branch_id = employee.branch_id
                  OR location.branch_id = ANY(COALESCE(employee.location_scope_ids, '{}'::uuid[]))
                )
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS "vendor_locations_employee_select" ON public.vendor_locations;
CREATE POLICY "vendor_locations_employee_select"
  ON public.vendor_locations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships membership
      JOIN public.roles role
        ON role.id = membership.role_id
       AND role.code = 'employee'
      JOIN public.employee_module_permissions permission
        ON permission.membership_id = membership.id
       AND permission.organization_id = membership.organization_id
       AND permission.module_code = 'vendors'
       AND permission.can_view = true
      LEFT JOIN public.employees employee
        ON employee.organization_id = membership.organization_id
       AND employee.user_id = membership.user_id
      WHERE membership.organization_id = vendor_locations.organization_id
        AND membership.user_id = auth.uid()
        AND membership.status = 'active'
        AND (
          vendor_locations.branch_id IS NULL
          OR membership.all_locations = true
          OR employee.all_locations = true
          OR vendor_locations.branch_id = membership.branch_id
          OR vendor_locations.branch_id = ANY(COALESCE(membership.location_scope_ids, '{}'::uuid[]))
          OR vendor_locations.branch_id = employee.branch_id
          OR vendor_locations.branch_id = ANY(COALESCE(employee.location_scope_ids, '{}'::uuid[]))
        )
    )
  );

NOTIFY pgrst, 'reload schema';

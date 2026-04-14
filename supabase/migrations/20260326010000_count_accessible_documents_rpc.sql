-- Migration: count_accessible_documents RPC
-- Replaces the Node.js while-loop that iterates ALL documents in memory
-- to count how many an employee can see. Moves logic to SQL for O(1) performance.

CREATE OR REPLACE FUNCTION count_accessible_documents(
  p_organization_id UUID,
  p_user_id UUID,
  p_role_code TEXT,
  p_branch_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_position_ids UUID[] DEFAULT '{}'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
  v_employee_id UUID;
BEGIN
  -- Company admins can see ALL documents
  IF p_role_code IN ('company_admin') THEN
    SELECT COUNT(*)::INT INTO v_count
    FROM documents
    WHERE organization_id = p_organization_id;
    RETURN v_count;
  END IF;

  -- Get employee id for direct assignment check
  SELECT id INTO v_employee_id
  FROM employees
  WHERE organization_id = p_organization_id
    AND user_id = p_user_id
  LIMIT 1;

  -- Count documents accessible to this employee
  SELECT COUNT(*)::INT INTO v_count
  FROM documents d
  WHERE d.organization_id = p_organization_id
    AND (
      -- 1. Directly assigned
      (v_employee_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM employee_documents ed
        WHERE ed.organization_id = p_organization_id
          AND ed.employee_id = v_employee_id
          AND ed.document_id = d.id
      ))
      OR
      -- 2. No scope at all (null, empty object, or no arrays) → visible to everyone
      (
        d.access_scope IS NULL
        OR d.access_scope = '{}'::jsonb
        OR (
          NOT (d.access_scope ? 'users' AND jsonb_array_length(COALESCE(d.access_scope->'users', '[]'::jsonb)) > 0)
          AND NOT (d.access_scope ? 'locations' AND jsonb_array_length(COALESCE(d.access_scope->'locations', '[]'::jsonb)) > 0)
          AND NOT (d.access_scope ? 'department_ids' AND jsonb_array_length(COALESCE(d.access_scope->'department_ids', '[]'::jsonb)) > 0)
          AND NOT (d.access_scope ? 'position_ids' AND jsonb_array_length(COALESCE(d.access_scope->'position_ids', '[]'::jsonb)) > 0)
        )
      )
      OR
      -- 3. Scoped by user
      (d.access_scope->'users' @> to_jsonb(p_user_id::TEXT))
      OR
      -- 4. Scoped by branch/location
      (p_branch_id IS NOT NULL AND d.access_scope->'locations' @> to_jsonb(p_branch_id::TEXT))
      OR
      -- 5. Scoped by department
      (p_department_id IS NOT NULL AND d.access_scope->'department_ids' @> to_jsonb(p_department_id::TEXT))
      OR
      -- 6. Scoped by position
      (array_length(p_position_ids, 1) > 0 AND EXISTS (
        SELECT 1
        FROM unnest(p_position_ids) AS pid(val)
        WHERE d.access_scope->'position_ids' @> to_jsonb(pid.val::TEXT)
      ))
    );

  RETURN v_count;
END;
$$;

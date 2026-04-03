-- Fix: Re-create submit_checklist_transaction with correct column names
-- and correct JSONB record access (v_item.value instead of v_item)

DROP FUNCTION IF EXISTS submit_checklist_transaction(uuid, uuid, uuid, uuid, uuid, jsonb, timestamp with time zone);
DROP FUNCTION IF EXISTS submit_checklist_transaction(uuid, uuid, uuid, bigint, uuid, jsonb, timestamp with time zone);

CREATE OR REPLACE FUNCTION submit_checklist_transaction(
  p_submission_id uuid,
  p_organization_id uuid,
  p_branch_id uuid,
  p_template_id uuid,
  p_submitted_by uuid,
  p_items jsonb, 
  p_submitted_at timestamp with time zone
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item jsonb;
  v_att jsonb;
BEGIN
  -- Insert Root Submission
  INSERT INTO checklist_submissions (
    id, organization_id, branch_id, template_id, submitted_by, status, submitted_at
  ) VALUES (
    p_submission_id, p_organization_id, p_branch_id, p_template_id, p_submitted_by, 'submitted', p_submitted_at
  );

  -- Loop through all items
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO checklist_submission_items (
      id, organization_id, submission_id, template_item_id, is_checked, is_flagged
    ) VALUES (
      (v_item->>'id')::uuid, p_organization_id, p_submission_id, (v_item->>'template_item_id')::uuid, (v_item->>'checked')::boolean, (v_item->>'flagged')::boolean
    );

    IF v_item->>'comment' IS NOT NULL AND v_item->>'comment' != '' THEN
      INSERT INTO checklist_item_comments (organization_id, submission_item_id, author_id, comment)
      VALUES (p_organization_id, (v_item->>'id')::uuid, p_submitted_by, v_item->>'comment');
    END IF;

    IF (v_item->>'flagged')::boolean THEN
      INSERT INTO checklist_flags (organization_id, submission_item_id, reported_by, reason, status)
      VALUES (p_organization_id, (v_item->>'id')::uuid, p_submitted_by, COALESCE(v_item->>'comment', 'Marcado para atencion'), 'open');
    END IF;

    IF v_item->'attachments' IS NOT NULL AND jsonb_array_length(v_item->'attachments') > 0 THEN
      FOR v_att IN SELECT value FROM jsonb_array_elements(v_item->'attachments') LOOP
        INSERT INTO checklist_item_attachments (organization_id, submission_item_id, uploaded_by, file_path, mime_type, file_size_bytes)
        VALUES (p_organization_id, (v_item->>'id')::uuid, p_submitted_by, v_att->>'file_path', v_att->>'mime_type', (v_att->>'file_size_bytes')::bigint);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

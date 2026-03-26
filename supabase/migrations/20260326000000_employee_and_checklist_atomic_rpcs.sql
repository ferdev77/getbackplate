-- Atomic RPCs for Employee Creation and Checklist Submissions
-- This migration hardens complex business logic by wrapping multiple table insertions into single transactions

-- RPC: create_employee_transaction
CREATE OR REPLACE FUNCTION create_employee_transaction(
  p_organization_id uuid,
  p_linked_user_id uuid,
  p_branch_id uuid,
  p_department_id uuid,
  p_position_id uuid,
  p_position text,
  p_department text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_status text,
  p_hired_at timestamp with time zone,
  p_birth_date date,
  p_sex text,
  p_nationality text,
  p_phone_country_code text,
  p_address_line1 text,
  p_address_city text,
  p_address_state text,
  p_address_postal_code text,
  p_address_country text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_emergency_contact_email text,
  p_create_membership boolean,
  p_role_id uuid,
  p_profile_source text,
  p_contract_type text,
  p_contract_status text,
  p_contract_start_date date,
  p_contract_end_date date,
  p_salary_amount numeric,
  p_salary_currency text,
  p_payment_frequency text,
  p_contract_notes text,
  p_contract_signer_name text,
  p_contract_signed_at timestamp with time zone,
  p_documents jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_employee_id uuid;
  v_profile_id uuid;
  v_doc record;
  v_doc_id uuid;
BEGIN
  -- Insert employee first to get employee ID
  INSERT INTO employees (
    organization_id, user_id, branch_id, department_id, position, department,
    first_name, last_name, email, phone, status, hired_at, birth_date, sex, nationality,
    phone_country_code, address_line1, address_city, address_state, address_postal_code, address_country,
    emergency_contact_name, emergency_contact_phone, emergency_contact_email
  )
  VALUES (
    p_organization_id, p_linked_user_id, p_branch_id, p_department_id, p_position, p_department,
    p_first_name, p_last_name, p_email, p_phone, COALESCE(p_status, 'active'), p_hired_at, p_birth_date, p_sex, p_nationality,
    p_phone_country_code, p_address_line1, p_address_city, p_address_state, p_address_postal_code, p_address_country,
    p_emergency_contact_name, p_emergency_contact_phone, p_emergency_contact_email
  )
  RETURNING id INTO v_employee_id;

  -- Insert profile linking to the employee
  INSERT INTO organization_user_profiles (
    organization_id, user_id, employee_id, branch_id, department_id, position_id,
    first_name, last_name, email, phone, is_employee, status, source
  )
  VALUES (
    p_organization_id, p_linked_user_id, v_employee_id, p_branch_id, p_department_id, p_position_id,
    p_first_name, p_last_name, p_email, p_phone, true, 
    CASE WHEN p_linked_user_id IS NOT NULL THEN 'active' ELSE 'inactive' END,
    p_profile_source
  )
  RETURNING id INTO v_profile_id;

  -- Insert membership if linking to a dashboard account
  IF p_create_membership AND p_linked_user_id IS NOT NULL THEN
    INSERT INTO memberships (organization_id, user_id, role_id, branch_id, status)
    VALUES (p_organization_id, p_linked_user_id, p_role_id, p_branch_id, 'active')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  -- Check if contract data is present and insert
  IF p_contract_type IS NOT NULL OR p_salary_amount IS NOT NULL OR p_contract_start_date IS NOT NULL THEN
    INSERT INTO employee_contracts (
      organization_id, employee_id, contract_type, status, start_date, end_date,
      salary_amount, salary_currency, payment_frequency, notes,
      signer_name_snapshot, signed_at
    )
    VALUES (
      p_organization_id, v_employee_id, COALESCE(p_contract_type, 'full_time'), COALESCE(p_contract_status, 'draft'), p_contract_start_date, p_contract_end_date,
      p_salary_amount, p_salary_currency, p_payment_frequency, p_contract_notes,
      p_contract_signer_name, p_contract_signed_at
    );
  END IF;

  -- Create and link documents in the transaction
  IF p_documents IS NOT NULL AND jsonb_array_length(p_documents) > 0 THEN
    FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documents) LOOP
      IF v_doc->>'id' IS NOT NULL THEN
        -- Link existing previously uploaded document
        INSERT INTO employee_documents (organization_id, employee_id, document_id)
        VALUES (p_organization_id, v_employee_id, (v_doc->>'id')::uuid);
      ELSE
        -- Insert new document record
        INSERT INTO documents (
          organization_id, branch_id, owner_user_id, title, file_path, mime_type, original_file_name, checksum_sha256, file_size_bytes, access_scope
        ) VALUES (
          p_organization_id, 
          CASE WHEN v_doc->>'branch_id' IS NOT NULL THEN (v_doc->>'branch_id')::uuid ELSE NULL END,
          (v_doc->>'owner_user_id')::uuid,
          v_doc->>'title',
          v_doc->>'file_path',
          v_doc->>'mime_type',
          v_doc->>'original_file_name',
          v_doc->>'checksum_sha256',
          (v_doc->>'file_size_bytes')::bigint,
          v_doc->'access_scope'
        ) RETURNING id INTO v_doc_id;

        -- Link the newly created document
        INSERT INTO employee_documents (organization_id, employee_id, document_id)
        VALUES (p_organization_id, v_employee_id, v_doc_id);
        
        -- Enqueue post processing job if size >= threshold
        IF (v_doc->>'file_size_bytes')::bigint >= 2000000 AND v_doc->'processing_payload' IS NOT NULL THEN
           INSERT INTO document_processing_jobs (organization_id, document_id, job_type, status, payload)
           VALUES (p_organization_id, v_doc_id, 'post_upload', 'pending', v_doc->'processing_payload');
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('employee_id', v_employee_id, 'profile_id', v_profile_id);
END;
$$;


-- RPC: submit_checklist_transaction
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
  v_item record;
  v_att record;
BEGIN
  -- Insert Root Submission
  INSERT INTO checklist_submissions (
    id, organization_id, branch_id, template_id, submitted_by, status, submitted_at
  ) VALUES (
    p_submission_id, p_organization_id, p_branch_id, p_template_id, p_submitted_by, 'submitted', p_submitted_at
  );

  -- Loop through all items and batch insert attached data safely
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
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
      FOR v_att IN SELECT * FROM jsonb_array_elements(v_item->'attachments') LOOP
        INSERT INTO checklist_item_attachments (organization_id, submission_item_id, uploaded_by, file_path, mime_type, file_size_bytes)
        VALUES (p_organization_id, (v_item->>'id')::uuid, p_submitted_by, v_att->>'file_path', v_att->>'mime_type', (v_att->>'file_size_bytes')::bigint);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.SUPABASE_DB_POOLER_URL
});

// Payload structure from route.ts:
// {
//   id: <submission_item_uuid>,       <- use as primary key
//   template_item_id: <template_item_uuid>, <- FK to checklist_template_items
//   checked: boolean,
//   flagged: boolean,
//   comment: string,
//   attachments: []
// }
const fixSQL = `
CREATE OR REPLACE FUNCTION public.submit_checklist_transaction(
  p_submission_id uuid,
  p_organization_id uuid,
  p_branch_id uuid,
  p_template_id bigint,
  p_submitted_by uuid,
  p_items jsonb,
  p_submitted_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item         jsonb;
  v_item_row_id  uuid;
BEGIN
  -- Insert Root Submission
  INSERT INTO checklist_submissions (
    id, organization_id, branch_id, template_id, submitted_by, submitted_at, status
  ) VALUES (
    p_submission_id,
    p_organization_id,
    p_branch_id,
    p_template_id::uuid,
    p_submitted_by,
    p_submitted_at,
    'submitted'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Loop over items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- 'id' in payload = submission item UUID, 'template_item_id' = FK
    v_item_row_id := (v_item->>'id')::uuid;

    INSERT INTO checklist_submission_items (
      id,
      organization_id,
      submission_id,
      template_item_id,
      is_checked,
      is_flagged
    ) VALUES (
      v_item_row_id,
      p_organization_id,
      p_submission_id,
      (v_item->>'template_item_id')::uuid,
      (v_item->>'checked')::boolean,
      (v_item->>'flagged')::boolean
    )
    ON CONFLICT (id) DO NOTHING;

    -- Handle flags for flagged items
    IF (v_item->>'flagged')::boolean = true THEN
      INSERT INTO checklist_flags (
        organization_id,
        submission_item_id,
        reported_by,
        reason,
        status
      ) VALUES (
        p_organization_id,
        v_item_row_id,
        p_submitted_by,
        COALESCE(NULLIF(v_item->>'comment', ''), 'Sin comentario'),
        'open'
      )
      ON CONFLICT DO NOTHING;
    END IF;

  END LOOP;

END;
$$;
`;

async function main() {
  await client.connect();
  
  try {
    await client.query(fixSQL);
    console.log("✅ Function submit_checklist_transaction — version final correcta aplicada!");
    
    // Confirm it compiled OK by describing it
    const res = await client.query(`
      SELECT proname, pronargs 
      FROM pg_proc 
      WHERE proname = 'submit_checklist_transaction'
    `);
    console.log("Confirmed function exists:", res.rows);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }

  await client.end();
}

main().catch(console.error);

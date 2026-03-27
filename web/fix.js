const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.mfhyemwypuzsqjqxtbjf:dy.7nci4Mfbfv%2Bv@aws-0-us-west-2.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();

  console.log("Dropping overloaded functions...");
  
  // Drop the bigint one
  try {
    await client.query(`DROP FUNCTION IF EXISTS public.submit_checklist_transaction(uuid, uuid, uuid, bigint, uuid, jsonb, timestamp with time zone);`);
    console.log("Dropped bigint version.");
  } catch (e) {
    console.error("Error dropping bigint:", e.message);
  }

  // Also recreate the proper one just to be safe
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION public.submit_checklist_transaction(
        p_submission_id uuid,
        p_organization_id uuid,
        p_branch_id uuid,
        p_template_id uuid,
        p_submitted_by uuid,
        p_items jsonb,
        p_submitted_at timestamp with time zone
      )
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
        v_item jsonb;
        v_attachment jsonb;
        v_submission_item_id uuid;
      BEGIN
        -- Insert submission
        INSERT INTO public.checklist_submissions (
          id,
          organization_id,
          branch_id,
          template_id,
          submitted_by,
          status,
          submitted_at
        )
        VALUES (
          p_submission_id,
          p_organization_id,
          p_branch_id,
          p_template_id,
          p_submitted_by,
          'submitted',
          p_submitted_at
        );

        -- Loop items
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
          v_submission_item_id := (v_item->>'id')::uuid;
          
          INSERT INTO public.checklist_submission_items (
            id,
            submission_id,
            template_item_id,
            checked,
            flagged,
            comment
          ) VALUES (
            v_submission_item_id,
            p_submission_id,
            (v_item->>'template_item_id')::uuid,
            COALESCE((v_item->>'checked')::boolean, false),
            COALESCE((v_item->>'flagged')::boolean, false),
            v_item->>'comment'
          );

          -- Loop attachments
          IF v_item ? 'attachments' AND jsonb_typeof(v_item->'attachments') = 'array' THEN
            FOR v_attachment IN SELECT * FROM jsonb_array_elements(v_item->'attachments')
            LOOP
              INSERT INTO public.checklist_submission_attachments (
                submission_id,
                submission_item_id,
                file_path,
                mime_type,
                file_size_bytes
              ) VALUES (
                p_submission_id,
                v_submission_item_id,
                v_attachment->>'file_path',
                v_attachment->>'mime_type',
                (v_attachment->>'file_size_bytes')::bigint
              );
            END LOOP;
          END IF;
        END LOOP;

      END;
      $$;
    `);
    console.log("Recreated uuid version successfully.");
  } catch (e) {
    console.error("Error creating function:", e.message);
  }

  await client.end();
}

run().catch(console.error);

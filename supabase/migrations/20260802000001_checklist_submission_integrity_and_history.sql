-- Enforce exact checklist submissions and make report history independent from
-- template, section, item, and creator rows that may later be edited or deleted.

alter table public.checklist_submissions
  add column if not exists template_id_snapshot uuid,
  add column if not exists template_created_by uuid;

alter table public.checklist_submission_items
  add column if not exists section_id_snapshot uuid,
  add column if not exists section_name text,
  add column if not exists section_sort_order integer,
  add column if not exists item_sort_order integer;

comment on column public.checklist_submissions.template_id_snapshot is
  'Immutable template identifier captured when the checklist is submitted. It intentionally has no FK so deletion does not erase history.';
comment on column public.checklist_submissions.template_created_by is
  'Immutable template creator captured when the checklist is submitted. It intentionally has no FK so template or user cleanup does not erase attribution.';
comment on column public.checklist_submission_items.section_id_snapshot is
  'Immutable section identifier captured when the checklist is submitted.';
comment on column public.checklist_submission_items.section_name is
  'Immutable section name captured when the checklist is submitted.';
comment on column public.checklist_submission_items.section_sort_order is
  'Immutable section order captured when the checklist is submitted.';
comment on column public.checklist_submission_items.item_sort_order is
  'Immutable item order captured when the checklist is submitted.';

-- Best-effort backfill for rows whose source template structure still exists.
update public.checklist_submissions submission
set
  template_id_snapshot = coalesce(submission.template_id_snapshot, template.id),
  template_created_by = coalesce(submission.template_created_by, template.created_by)
from public.checklist_templates template
where submission.template_id = template.id
  and (
    submission.template_id_snapshot is null
    or submission.template_created_by is null
  );

update public.checklist_submission_items submission_item
set
  section_id_snapshot = coalesce(submission_item.section_id_snapshot, section.id),
  section_name = coalesce(submission_item.section_name, section.name),
  section_sort_order = coalesce(submission_item.section_sort_order, section.sort_order),
  item_sort_order = coalesce(submission_item.item_sort_order, template_item.sort_order)
from public.checklist_template_items template_item
join public.checklist_template_sections section on section.id = template_item.section_id
where submission_item.template_item_id = template_item.id
  and (
    submission_item.section_id_snapshot is null
    or submission_item.section_name is null
    or submission_item.section_sort_order is null
    or submission_item.item_sort_order is null
  );

-- Canonicalize recoverable legacy recurrence channels. Email choices made by
-- versions that never persisted email cannot be reconstructed.
update public.checklist_templates template
set target_scope = jsonb_set(
  coalesce(template.target_scope, '{}'::jsonb),
  '{notify_channels}',
  case jsonb_typeof(template.target_scope->'notify_via')
    when 'array' then (
      select coalesce(jsonb_agg(channel order by channel), '[]'::jsonb)
      from (
        select distinct legacy.channel
        from jsonb_array_elements_text(template.target_scope->'notify_via') legacy(channel)
        where legacy.channel in ('email', 'sms')
        union
        select expanded.channel
        from unnest(array['email', 'sms']) expanded(channel)
        where template.target_scope->'notify_via' ? 'all'
      ) channels
    )
    when 'string' then case template.target_scope->>'notify_via'
      when 'email' then jsonb_build_array('email')
      when 'sms' then jsonb_build_array('sms')
      when 'all' then jsonb_build_array('email', 'sms')
      else '[]'::jsonb
    end
    else '[]'::jsonb
  end,
  true
)
where template.target_scope ? 'notify_via'
  and not template.target_scope ? 'notify_channels';

-- A checklist schedule is valid only while its target template exists and is
-- active. scheduled_jobs.target_id is polymorphic, so this cannot be an FK.
delete from public.scheduled_jobs job
where job.job_type = 'checklist_generator'
  and not exists (
    select 1
    from public.checklist_templates template
    where template.id = job.target_id
      and template.organization_id = job.organization_id
      and template.is_active = true
  );

create or replace function public.submit_checklist_transaction(
  p_submission_id uuid,
  p_organization_id uuid,
  p_branch_id uuid,
  p_template_id uuid,
  p_submitted_by uuid,
  p_items jsonb,
  p_submitted_at timestamp with time zone
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_item jsonb;
  v_att jsonb;
  v_template_name text;
  v_template_created_by uuid;
  v_template_branch_id uuid;
  v_label text;
  v_item_sort_order integer;
  v_section_id uuid;
  v_section_name text;
  v_section_sort_order integer;
  v_expected_count integer;
  v_submitted_count integer;
  v_distinct_item_count integer;
  v_distinct_row_count integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Checklist items must be an array' using errcode = '22023';
  end if;

  select template.name, template.created_by, template.branch_id
  into v_template_name, v_template_created_by, v_template_branch_id
  from public.checklist_templates template
  where template.id = p_template_id
    and template.organization_id = p_organization_id
    and template.is_active = true
  for share;

  if not found then
    raise exception 'Checklist template is not active in this organization' using errcode = '22023';
  end if;

  if v_template_branch_id is not null and p_branch_id is distinct from v_template_branch_id then
    raise exception 'Checklist submission branch does not match template branch' using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches branch
    where branch.id = p_branch_id and branch.organization_id = p_organization_id
  ) then
    raise exception 'Checklist submission branch is not in this organization' using errcode = '22023';
  end if;

  -- Lock the expected rows so a concurrent structural edit cannot replace them
  -- between exact-set validation and snapshot insertion.
  perform 1
  from public.checklist_template_items template_item
  join public.checklist_template_sections section on section.id = template_item.section_id
  where section.template_id = p_template_id
    and section.organization_id = p_organization_id
    and template_item.organization_id = p_organization_id
  for share of template_item, section;

  select count(*)::integer
  into v_expected_count
  from public.checklist_template_items template_item
  join public.checklist_template_sections section on section.id = template_item.section_id
  where section.template_id = p_template_id
    and section.organization_id = p_organization_id
    and template_item.organization_id = p_organization_id;

  select
    count(*)::integer,
    count(distinct item->>'template_item_id')::integer,
    count(distinct item->>'id')::integer
  into v_submitted_count, v_distinct_item_count, v_distinct_row_count
  from jsonb_array_elements(p_items) item;

  if v_expected_count = 0
    or v_submitted_count <> v_expected_count
    or v_distinct_item_count <> v_submitted_count
    or v_distinct_row_count <> v_submitted_count then
    raise exception 'Checklist submission must contain every template item exactly once' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) submitted(item)
    where not exists (
      select 1
      from public.checklist_template_items template_item
      join public.checklist_template_sections section on section.id = template_item.section_id
      where template_item.id = (submitted.item->>'template_item_id')::uuid
        and template_item.organization_id = p_organization_id
        and section.organization_id = p_organization_id
        and section.template_id = p_template_id
    )
  ) then
    raise exception 'Checklist submission contains an item from another template' using errcode = '22023';
  end if;

  insert into public.checklist_submissions (
    id,
    organization_id,
    branch_id,
    template_id,
    template_id_snapshot,
    template_name,
    template_created_by,
    submitted_by,
    status,
    submitted_at
  ) values (
    p_submission_id,
    p_organization_id,
    p_branch_id,
    p_template_id,
    p_template_id,
    v_template_name,
    v_template_created_by,
    p_submitted_by,
    'submitted',
    p_submitted_at
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    select
      template_item.label,
      template_item.sort_order,
      section.id,
      section.name,
      section.sort_order
    into
      v_label,
      v_item_sort_order,
      v_section_id,
      v_section_name,
      v_section_sort_order
    from public.checklist_template_items template_item
    join public.checklist_template_sections section on section.id = template_item.section_id
    where template_item.id = (v_item->>'template_item_id')::uuid
      and template_item.organization_id = p_organization_id
      and section.organization_id = p_organization_id
      and section.template_id = p_template_id;

    if not found then
      raise exception 'Checklist item changed while the submission was being saved' using errcode = '40001';
    end if;

    insert into public.checklist_submission_items (
      id,
      organization_id,
      submission_id,
      template_item_id,
      item_label,
      section_id_snapshot,
      section_name,
      section_sort_order,
      item_sort_order,
      is_checked,
      is_flagged
    ) values (
      (v_item->>'id')::uuid,
      p_organization_id,
      p_submission_id,
      (v_item->>'template_item_id')::uuid,
      v_label,
      v_section_id,
      v_section_name,
      v_section_sort_order,
      v_item_sort_order,
      (v_item->>'checked')::boolean,
      (v_item->>'flagged')::boolean
    );

    if coalesce(v_item->>'comment', '') <> '' then
      insert into public.checklist_item_comments (
        organization_id, submission_item_id, author_id, comment
      ) values (
        p_organization_id, (v_item->>'id')::uuid, p_submitted_by, v_item->>'comment'
      );
    end if;

    if (v_item->>'flagged')::boolean then
      insert into public.checklist_flags (
        organization_id, submission_item_id, reported_by, reason, status
      ) values (
        p_organization_id,
        (v_item->>'id')::uuid,
        p_submitted_by,
        coalesce(nullif(v_item->>'comment', ''), 'Marcado para atencion'),
        'open'
      );
    end if;

    if jsonb_typeof(v_item->'attachments') = 'array'
      and jsonb_array_length(v_item->'attachments') > 0 then
      for v_att in select value from jsonb_array_elements(v_item->'attachments') loop
        insert into public.checklist_item_attachments (
          organization_id,
          submission_item_id,
          uploaded_by,
          file_path,
          mime_type,
          file_size_bytes
        ) values (
          p_organization_id,
          (v_item->>'id')::uuid,
          p_submitted_by,
          v_att->>'file_path',
          v_att->>'mime_type',
          (v_att->>'file_size_bytes')::bigint
        );
      end loop;
    end if;
  end loop;
end;
$function$;

revoke all on function public.submit_checklist_transaction(
  uuid, uuid, uuid, uuid, uuid, jsonb, timestamp with time zone
) from public, anon, authenticated;
grant execute on function public.submit_checklist_transaction(
  uuid, uuid, uuid, uuid, uuid, jsonb, timestamp with time zone
) to service_role;

notify pgrst, 'reload schema';

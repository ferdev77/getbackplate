create or replace function public.checklist_scope_match(
  scope jsonb,
  member_user_id uuid,
  member_branch_id uuid,
  employee_department_id uuid
)
returns boolean
language sql
stable
as $$
  with prepared as (
    select coalesce(scope, '{}'::jsonb) as value
  ), lengths as (
    select
      jsonb_array_length(coalesce(value->'users', '[]'::jsonb)) as users_len,
      jsonb_array_length(coalesce(value->'locations', '[]'::jsonb)) as locations_len,
      jsonb_array_length(coalesce(value->'department_ids', '[]'::jsonb)) as departments_len,
      value
    from prepared
  )
  select case
    when (users_len + locations_len + departments_len) = 0 then true
    else
      exists (
        select 1
        from jsonb_array_elements_text(coalesce(value->'users', '[]'::jsonb)) as scoped_user(item)
        where scoped_user.item = member_user_id::text
      )
      or (
        member_branch_id is not null
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'locations', '[]'::jsonb)) as scoped_location(item)
          where scoped_location.item = member_branch_id::text
        )
      )
      or (
        employee_department_id is not null
        and exists (
          select 1
          from jsonb_array_elements_text(coalesce(value->'department_ids', '[]'::jsonb)) as scoped_department(item)
          where scoped_department.item = employee_department_id::text
        )
      )
  end
  from lengths;
$$;

create or replace function public.can_read_checklist_template(
  template_org_id uuid,
  template_branch_id uuid,
  template_department_id uuid,
  template_scope jsonb
)
returns boolean
language plpgsql
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership_branch_id uuid;
  v_employee_department_id uuid;
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(template_org_id) then
    return true;
  end if;

  if not public.has_org_membership(template_org_id) then
    return false;
  end if;

  select m.branch_id
    into v_membership_branch_id
  from public.memberships m
  where m.organization_id = template_org_id
    and m.user_id = v_user_id
    and m.status = 'active'
  limit 1;

  select e.department_id
    into v_employee_department_id
  from public.employees e
  where e.organization_id = template_org_id
    and e.user_id = v_user_id
  limit 1;

  if template_branch_id is not null and (v_membership_branch_id is null or template_branch_id <> v_membership_branch_id) then
    return false;
  end if;

  if template_department_id is not null and (v_employee_department_id is null or template_department_id <> v_employee_department_id) then
    return false;
  end if;

  return public.checklist_scope_match(template_scope, v_user_id, v_membership_branch_id, v_employee_department_id);
end;
$$;

create or replace function public.can_read_checklist_submission(
  submission_org_id uuid,
  submission_id uuid
)
returns boolean
language plpgsql
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_submitted_by uuid;
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(submission_org_id) then
    return true;
  end if;

  if not public.has_org_membership(submission_org_id) then
    return false;
  end if;

  select s.submitted_by
    into v_submitted_by
  from public.checklist_submissions s
  where s.id = submission_id
    and s.organization_id = submission_org_id
  limit 1;

  return v_submitted_by = v_user_id;
end;
$$;

create or replace function public.can_submit_checklist(
  submission_org_id uuid,
  template_id uuid,
  submitted_by uuid
)
returns boolean
language plpgsql
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_template_branch_id uuid;
  v_template_department_id uuid;
  v_template_scope jsonb;
begin
  if v_user_id is null then
    return false;
  end if;

  if public.is_superadmin() or public.can_manage_org(submission_org_id) then
    return true;
  end if;

  if submitted_by is distinct from v_user_id then
    return false;
  end if;

  if not public.has_org_membership(submission_org_id) then
    return false;
  end if;

  select t.branch_id, t.department_id, t.target_scope
    into v_template_branch_id, v_template_department_id, v_template_scope
  from public.checklist_templates t
  where t.id = template_id
    and t.organization_id = submission_org_id
  limit 1;

  if not found then
    return false;
  end if;

  return public.can_read_checklist_template(
    submission_org_id,
    v_template_branch_id,
    v_template_department_id,
    v_template_scope
  );
end;
$$;

drop policy if exists checklist_templates_tenant_select on public.checklist_templates;

create policy checklist_templates_tenant_select
  on public.checklist_templates for select
  using (
    public.can_read_checklist_template(
      organization_id,
      branch_id,
      department_id,
      target_scope
    )
  );

drop policy if exists checklist_template_sections_tenant_select on public.checklist_template_sections;

create policy checklist_template_sections_tenant_select
  on public.checklist_template_sections for select
  using (
    exists (
      select 1
      from public.checklist_templates t
      where t.id = checklist_template_sections.template_id
        and t.organization_id = checklist_template_sections.organization_id
        and public.can_read_checklist_template(
          t.organization_id,
          t.branch_id,
          t.department_id,
          t.target_scope
        )
    )
  );

drop policy if exists checklist_template_items_tenant_select on public.checklist_template_items;

create policy checklist_template_items_tenant_select
  on public.checklist_template_items for select
  using (
    exists (
      select 1
      from public.checklist_template_sections s
      join public.checklist_templates t on t.id = s.template_id
      where s.id = checklist_template_items.section_id
        and s.organization_id = checklist_template_items.organization_id
        and t.organization_id = checklist_template_items.organization_id
        and public.can_read_checklist_template(
          t.organization_id,
          t.branch_id,
          t.department_id,
          t.target_scope
        )
    )
  );

drop policy if exists checklist_submissions_tenant_select on public.checklist_submissions;

create policy checklist_submissions_tenant_select
  on public.checklist_submissions for select
  using (public.can_read_checklist_submission(organization_id, id));

drop policy if exists checklist_submissions_tenant_insert on public.checklist_submissions;

create policy checklist_submissions_tenant_insert
  on public.checklist_submissions for insert
  with check (public.can_submit_checklist(organization_id, template_id, submitted_by));

drop policy if exists checklist_submissions_tenant_update on public.checklist_submissions;

create policy checklist_submissions_tenant_update
  on public.checklist_submissions for update
  using (
    public.can_manage_org(organization_id)
    or (submitted_by = auth.uid() and public.has_org_membership(organization_id))
  )
  with check (
    public.can_manage_org(organization_id)
    or (submitted_by = auth.uid() and public.has_org_membership(organization_id))
  );

drop policy if exists checklist_submission_items_tenant_select on public.checklist_submission_items;

create policy checklist_submission_items_tenant_select
  on public.checklist_submission_items for select
  using (public.can_read_checklist_submission(organization_id, submission_id));

drop policy if exists checklist_submission_items_tenant_write on public.checklist_submission_items;

create policy checklist_submission_items_tenant_write
  on public.checklist_submission_items for all
  using (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submissions s
      where s.id = checklist_submission_items.submission_id
        and s.organization_id = checklist_submission_items.organization_id
        and s.submitted_by = auth.uid()
    )
  )
  with check (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submissions s
      where s.id = checklist_submission_items.submission_id
        and s.organization_id = checklist_submission_items.organization_id
        and s.submitted_by = auth.uid()
    )
  );

drop policy if exists checklist_item_comments_tenant_select on public.checklist_item_comments;

create policy checklist_item_comments_tenant_select
  on public.checklist_item_comments for select
  using (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submission_items si
      join public.checklist_submissions s on s.id = si.submission_id
      where si.id = checklist_item_comments.submission_item_id
        and si.organization_id = checklist_item_comments.organization_id
        and s.organization_id = checklist_item_comments.organization_id
        and s.submitted_by = auth.uid()
    )
  );

drop policy if exists checklist_item_comments_tenant_write on public.checklist_item_comments;

create policy checklist_item_comments_tenant_write
  on public.checklist_item_comments for all
  using (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submission_items si
      join public.checklist_submissions s on s.id = si.submission_id
      where si.id = checklist_item_comments.submission_item_id
        and si.organization_id = checklist_item_comments.organization_id
        and s.organization_id = checklist_item_comments.organization_id
        and s.submitted_by = auth.uid()
    )
  )
  with check (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submission_items si
      join public.checklist_submissions s on s.id = si.submission_id
      where si.id = checklist_item_comments.submission_item_id
        and si.organization_id = checklist_item_comments.organization_id
        and s.organization_id = checklist_item_comments.organization_id
        and s.submitted_by = auth.uid()
    )
  );

drop policy if exists checklist_item_attachments_tenant_select on public.checklist_item_attachments;

create policy checklist_item_attachments_tenant_select
  on public.checklist_item_attachments for select
  using (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submission_items si
      join public.checklist_submissions s on s.id = si.submission_id
      where si.id = checklist_item_attachments.submission_item_id
        and si.organization_id = checklist_item_attachments.organization_id
        and s.organization_id = checklist_item_attachments.organization_id
        and s.submitted_by = auth.uid()
    )
  );

drop policy if exists checklist_item_attachments_tenant_write on public.checklist_item_attachments;

create policy checklist_item_attachments_tenant_write
  on public.checklist_item_attachments for all
  using (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submission_items si
      join public.checklist_submissions s on s.id = si.submission_id
      where si.id = checklist_item_attachments.submission_item_id
        and si.organization_id = checklist_item_attachments.organization_id
        and s.organization_id = checklist_item_attachments.organization_id
        and s.submitted_by = auth.uid()
    )
  )
  with check (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submission_items si
      join public.checklist_submissions s on s.id = si.submission_id
      where si.id = checklist_item_attachments.submission_item_id
        and si.organization_id = checklist_item_attachments.organization_id
        and s.organization_id = checklist_item_attachments.organization_id
        and s.submitted_by = auth.uid()
    )
  );

drop policy if exists checklist_flags_tenant_select on public.checklist_flags;

create policy checklist_flags_tenant_select
  on public.checklist_flags for select
  using (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submission_items si
      join public.checklist_submissions s on s.id = si.submission_id
      where si.id = checklist_flags.submission_item_id
        and si.organization_id = checklist_flags.organization_id
        and s.organization_id = checklist_flags.organization_id
        and s.submitted_by = auth.uid()
    )
  );

drop policy if exists checklist_flags_tenant_write on public.checklist_flags;

create policy checklist_flags_tenant_write
  on public.checklist_flags for all
  using (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submission_items si
      join public.checklist_submissions s on s.id = si.submission_id
      where si.id = checklist_flags.submission_item_id
        and si.organization_id = checklist_flags.organization_id
        and s.organization_id = checklist_flags.organization_id
        and s.submitted_by = auth.uid()
    )
  )
  with check (
    public.can_manage_org(organization_id)
    or exists (
      select 1
      from public.checklist_submission_items si
      join public.checklist_submissions s on s.id = si.submission_id
      where si.id = checklist_flags.submission_item_id
        and si.organization_id = checklist_flags.organization_id
        and s.organization_id = checklist_flags.organization_id
        and s.submitted_by = auth.uid()
    )
  );

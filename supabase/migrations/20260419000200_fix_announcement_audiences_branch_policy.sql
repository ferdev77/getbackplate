drop policy if exists announcement_audiences_tenant_select on public.announcement_audiences;

create policy announcement_audiences_tenant_select
  on public.announcement_audiences for select
  using (
    public.can_manage_org(organization_id)
    or user_id = auth.uid()
    or (
      user_id is null
      and branch_id is null
      and public.has_org_membership(organization_id)
    )
    or (
      user_id is null
      and branch_id is not null
      and (
        exists (
          select 1
          from public.memberships m
          where m.organization_id = announcement_audiences.organization_id
            and m.user_id = auth.uid()
            and m.status = 'active'
            and m.branch_id = announcement_audiences.branch_id
        )
        or exists (
          select 1
          from public.employees e
          where e.organization_id = announcement_audiences.organization_id
            and e.user_id = auth.uid()
            and e.branch_id = announcement_audiences.branch_id
        )
      )
    )
  );

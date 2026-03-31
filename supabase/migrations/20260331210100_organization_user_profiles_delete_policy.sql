drop policy if exists organization_user_profiles_delete on public.organization_user_profiles;
create policy organization_user_profiles_delete
  on public.organization_user_profiles for delete
  using (
    public.is_superadmin()
    or public.can_manage_org(organization_id)
    or user_id = auth.uid()
  );

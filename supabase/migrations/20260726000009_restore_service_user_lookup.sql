-- Reconcile environments where the historical migration is tracked but the
-- helper was removed physically. Notification logging uses it through the
-- service-role client only.
create or replace function public.get_user_id_by_email(lookup_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth_user.id
  from auth.users auth_user
  where lower(auth_user.email) = lower(lookup_email)
  limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

notify pgrst, 'reload schema';

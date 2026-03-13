alter table public.user_preferences
drop constraint if exists user_preferences_pkey;

alter table public.user_preferences
add constraint user_preferences_pkey primary key (organization_id, user_id);

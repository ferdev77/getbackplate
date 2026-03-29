insert into public.module_catalog (code, name, description, is_core)
values (
  'custom_branding',
  'Custom Branding',
  'Permite logo y marca personalizada en sidebar y footer del panel empresa.',
  false
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_core = false,
  updated_at = timezone('utc', now());

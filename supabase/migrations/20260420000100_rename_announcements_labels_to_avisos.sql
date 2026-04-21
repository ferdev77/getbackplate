-- Normaliza etiquetas visibles del modulo announcements a "Avisos"
update public.module_catalog
set
  name = 'Avisos',
  updated_at = timezone('utc', now())
where code = 'announcements';

update public.permissions
set description = 'Leer avisos'
where code = 'announcements.read';

update public.permissions
set description = 'Publicar avisos'
where code = 'announcements.write';

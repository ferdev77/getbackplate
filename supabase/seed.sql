-- Seed base para entorno local/dev

-- Planes
insert into public.plans (code, name, description)
values
  ('starter', 'Starter', 'Plan base para empresas pequenas'),
  ('growth', 'Growth', 'Plan intermedio para multiples sucursales'),
  ('enterprise', 'Enterprise', 'Plan avanzado con limites altos')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = timezone('utc', now());

update public.plans
set
  price_amount = case code
    when 'starter' then 49.00
    when 'growth' then 129.00
    when 'enterprise' then 399.00
    else price_amount
  end,
  currency_code = coalesce(currency_code, 'USD'),
  billing_period = coalesce(billing_period, 'monthly'),
  updated_at = timezone('utc', now())
where code in ('starter', 'growth', 'enterprise');

-- Roles base
insert into public.roles (code, name, level, is_system)
values
  ('superadmin', 'Superadmin Global', 1, true),
  ('company_admin', 'Admin de Empresa', 10, true),
  ('employee', 'Empleado', 50, true)
on conflict (code) do update
set
  name = excluded.name,
  level = excluded.level,
  updated_at = timezone('utc', now());

-- Modulos catalogo
insert into public.module_catalog (code, name, description, is_core)
values
  ('dashboard', 'Dashboard', 'Resumen principal por rol', true),
  ('employees', 'Empleados', 'Gestion de personal', true),
  ('onboarding', 'Onboarding', 'Ingreso y lectura guiada de documentos', false),
  ('documents', 'Documentos', 'Repositorio documental con permisos', true),
  ('announcements', 'Anuncios', 'Comunicacion interna segmentada', true),
  ('checklists', 'Checklist Operativo', 'Ejecucion operativa por turno', true),
  ('reports', 'Reportes', 'Seguimiento y supervision operativa', true),
  ('settings', 'Configuracion', 'Ajustes internos por tenant', true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  is_core = excluded.is_core,
  updated_at = timezone('utc', now());

-- Permisos base (minimos para arrancar)
insert into public.permissions (code, module_code, description)
values
  ('employees.read', 'employees', 'Leer empleados'),
  ('employees.write', 'employees', 'Crear/editar empleados'),
  ('documents.read', 'documents', 'Leer documentos'),
  ('documents.write', 'documents', 'Subir/editar documentos'),
  ('announcements.read', 'announcements', 'Leer anuncios'),
  ('announcements.write', 'announcements', 'Publicar anuncios'),
  ('checklists.read', 'checklists', 'Leer checklists'),
  ('checklists.write', 'checklists', 'Crear/editar plantillas de checklist'),
  ('reports.read', 'reports', 'Leer reportes'),
  ('settings.write', 'settings', 'Editar configuracion tenant')
on conflict (code) do update
set
  module_code = excluded.module_code,
  description = excluded.description;

-- Mapeo role -> permisos
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on true
where r.code in ('superadmin', 'company_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'documents.read',
  'announcements.read',
  'checklists.read'
)
where r.code = 'employee'
on conflict do nothing;

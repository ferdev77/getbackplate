alter table public.checklist_templates
  add column if not exists shift text,
  add column if not exists department text,
  add column if not exists repeat_every text default 'daily';

update public.checklist_templates
set repeat_every = 'daily'
where repeat_every is null;

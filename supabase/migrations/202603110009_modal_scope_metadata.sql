alter table public.document_folders
  add column if not exists access_scope jsonb not null default '{}'::jsonb;

alter table public.documents
  add column if not exists access_scope jsonb not null default '{}'::jsonb;

alter table public.announcements
  add column if not exists target_scope jsonb not null default '{}'::jsonb;

alter table public.checklist_templates
  add column if not exists target_scope jsonb not null default '{}'::jsonb;

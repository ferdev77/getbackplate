alter table public.employee_documents
  add column if not exists review_comment text;

-- Mejoras a la implementación de firma digital DocuSeal
-- Aplica a: DB dev y DB prod por igual

-- 1. Campo para idempotencia del webhook
--    DocuSeal puede reenviar el mismo evento; guardamos el último event_id procesado
alter table public.employee_documents
  add column if not exists signature_last_webhook_event_id text;

-- 2. Índice en signature_submission_id
--    El webhook busca por este campo en cada evento; sin índice es un seq scan
create index if not exists employee_documents_sig_submission_id_idx
  on public.employee_documents (signature_submission_id)
  where signature_submission_id is not null;

-- 3. Unique parcial: evita que dos requests simultáneas creen dos submissions en DocuSeal
--    Solo puede haber una solicitud activa ("requested") por documento/empleado
create unique index if not exists employee_documents_one_active_sig_idx
  on public.employee_documents (organization_id, employee_id, document_id)
  where signature_status = 'requested';

-- 4. CHECK constraint en signature_status (valores válidos)
alter table public.employee_documents
  drop constraint if exists employee_documents_signature_status_check;

alter table public.employee_documents
  add constraint employee_documents_signature_status_check
  check (
    signature_status is null or
    signature_status in ('requested', 'viewed', 'completed', 'declined', 'expired', 'failed')
  );

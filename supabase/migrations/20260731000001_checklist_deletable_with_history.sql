-- Permite eliminar de verdad un checklist que ya tiene respuestas, sin perder el
-- historial.
--
-- Hasta ahora la plantilla no se podia borrar: checklist_submissions.template_id
-- era NOT NULL con la FK en NO ACTION, asi que Postgres rechazaba el DELETE y el
-- codigo la archivaba (is_active = false). Una plantilla con historial quedaba
-- para siempre en la lista como inactiva.
--
-- El historial ya no depende de la plantilla: desde 20260730000001 cada respuesta
-- guarda el texto de sus items (item_label). Lo unico que seguia viniendo de la
-- plantilla era el nombre del checklist, que el reporte resolvia por join y, sin
-- plantilla, mostraba como "Checklist". Con el nombre copiado en la respuesta, la
-- plantilla se puede borrar y el reporte sigue diciendo lo mismo.

-- 1. Copia inmutable del nombre del checklist en cada respuesta.
alter table public.checklist_submissions
  add column if not exists template_name text;

update public.checklist_submissions s
set template_name = t.name
from public.checklist_templates t
where t.id = s.template_id
  and s.template_name is null;

comment on column public.checklist_submissions.template_name is
  'Nombre del checklist al momento de responder. Copia inmutable: el reporte lo usa para no depender de la plantilla, que puede haber sido eliminada o renombrada.';

-- 2. La respuesta sobrevive a la plantilla.
alter table public.checklist_submissions
  alter column template_id drop not null;

alter table public.checklist_submissions
  drop constraint if exists checklist_submissions_template_id_fkey;

alter table public.checklist_submissions
  add constraint checklist_submissions_template_id_fkey
  foreign key (template_id) references public.checklist_templates (id)
  on delete set null;

-- 3. Al responder se guarda tambien el nombre.
create or replace function public.submit_checklist_transaction(
  p_submission_id uuid,
  p_organization_id uuid,
  p_branch_id uuid,
  p_template_id uuid,
  p_submitted_by uuid,
  p_items jsonb,
  p_submitted_at timestamp with time zone
)
returns void
language plpgsql
security definer
as $function$
declare
  v_item jsonb;
  v_att jsonb;
  v_label text;
  v_template_name text;
begin
  -- Copia inmutable del nombre: el historial no debe depender de la plantilla.
  select t.name into v_template_name
  from public.checklist_templates t
  where t.id = p_template_id
  limit 1;

  insert into checklist_submissions (
    id, organization_id, branch_id, template_id, template_name, submitted_by, status, submitted_at
  ) values (
    p_submission_id, p_organization_id, p_branch_id, p_template_id, v_template_name, p_submitted_by, 'submitted', p_submitted_at
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    -- Copia inmutable del texto: el historial no debe depender de la plantilla.
    select i.label into v_label
    from public.checklist_template_items i
    where i.id = (v_item->>'template_item_id')::uuid
    limit 1;

    insert into checklist_submission_items (
      id, organization_id, submission_id, template_item_id, item_label, is_checked, is_flagged
    ) values (
      (v_item->>'id')::uuid,
      p_organization_id,
      p_submission_id,
      (v_item->>'template_item_id')::uuid,
      v_label,
      (v_item->>'checked')::boolean,
      (v_item->>'flagged')::boolean
    );

    if v_item->>'comment' is not null and v_item->>'comment' != '' then
      insert into checklist_item_comments (organization_id, submission_item_id, author_id, comment)
      values (p_organization_id, (v_item->>'id')::uuid, p_submitted_by, v_item->>'comment');
    end if;

    if (v_item->>'flagged')::boolean then
      insert into checklist_flags (organization_id, submission_item_id, reported_by, reason, status)
      values (p_organization_id, (v_item->>'id')::uuid, p_submitted_by, coalesce(v_item->>'comment', 'Marcado para atencion'), 'open');
    end if;

    if v_item->'attachments' is not null and jsonb_array_length(v_item->'attachments') > 0 then
      for v_att in select value from jsonb_array_elements(v_item->'attachments') loop
        insert into checklist_item_attachments (organization_id, submission_item_id, uploaded_by, file_path, mime_type, file_size_bytes)
        values (p_organization_id, (v_item->>'id')::uuid, p_submitted_by, v_att->>'file_path', v_att->>'mime_type', (v_att->>'file_size_bytes')::bigint);
      end loop;
    end if;
  end loop;
end;
$function$;

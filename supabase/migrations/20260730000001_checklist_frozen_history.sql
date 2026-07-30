-- Historial de checklists inmutable, y cambios pendientes hasta el proximo reparto.
--
-- PROBLEMA 1 — el pasado se reescribe.
--   checklist_submission_items solo guardaba una referencia al item de la
--   plantilla (template_item_id) y si estaba tildado. El texto NO se guardaba:
--   el reporte lo lee de la plantilla actual (checklist-reports-snapshot.ts).
--   Consecuencia: renombrar un item cambia lo que parecen decir las respuestas
--   ya enviadas. El reporte de un dia anterior muta.
--
-- PROBLEMA 2 — editar duplica los items, en silencio.
--   upsertChecklistTemplate borra todas las secciones e items y los reinserta.
--   La FK desde checklist_submission_items bloquea ese borrado, pero el codigo
--   no chequea el error y sigue de largo: inserta los nuevos y quedan los dos
--   juegos. Reproducido en dev: una plantilla de 2 items con 1 respuesta paso a
--   tener 5 items y 2 secciones duplicadas. Cada edicion vuelve a duplicar.
--
-- SOLUCION
--   1. Congelar el texto del item en la respuesta (item_label). El historial
--      pasa a ser autosuficiente: no depende de la plantilla.
--   2. Con el texto congelado, la referencia ya no es necesaria para mostrar el
--      historial, asi que la FK pasa a ON DELETE SET NULL. Borrar un item deja
--      de estar bloqueado y no hace falta acumular items invisibles.
--   3. Guardar los cambios de la plantilla como PENDIENTES cuando la vuelta
--      actual ya tiene respuestas, para no partir un ciclo al medio. El cron de
--      recurrencia los aplica al iniciar la vuelta siguiente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Texto congelado en la respuesta
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.checklist_submission_items
  add column if not exists item_label text;

comment on column public.checklist_submission_items.item_label is
  'Texto del item al momento de responder. Copia inmutable: el historial no debe cambiar si despues se renombra o se borra el item de la plantilla.';

-- Backfill con el texto actual. Es lo mejor disponible para lo ya enviado:
-- si algun item fue renombrado antes de esta migracion, ese cambio ya se
-- perdio y no hay forma de recuperar el texto original.
update public.checklist_submission_items si
set item_label = i.label
from public.checklist_template_items i
where si.item_label is null
  and si.template_item_id = i.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La referencia deja de bloquear el borrado
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.checklist_submission_items
  drop constraint if exists checklist_submission_items_template_item_id_fkey;

alter table public.checklist_submission_items
  alter column template_item_id drop not null;

alter table public.checklist_submission_items
  add constraint checklist_submission_items_template_item_id_fkey
  foreign key (template_item_id)
  references public.checklist_template_items(id)
  on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cambios pendientes de la plantilla
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.checklist_templates
  add column if not exists pending_sections jsonb,
  add column if not exists pending_since timestamp with time zone;

comment on column public.checklist_templates.pending_sections is
  'Secciones e items editados que todavia no se aplicaron, con la forma [{name, items:[label]}]. Se aplican al iniciar la proxima vuelta para no partir un ciclo que ya tiene respuestas.';
comment on column public.checklist_templates.pending_since is
  'Cuando quedaron pendientes esos cambios.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ¿La vuelta actual ya tiene respuestas?
--
--    Reusa el mismo criterio que ya aplica submit/route.ts para impedir dos
--    envios de la misma persona en la misma vuelta: se cuenta como "vuelta
--    actual" todo lo enviado despues del ultimo run del cron. Sin recurrencia
--    no hay vuelta, y cualquier respuesta cuenta.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.checklist_current_cycle_submissions(
  p_organization_id uuid,
  p_template_id uuid
)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from public.checklist_submissions s
  where s.organization_id = p_organization_id
    and s.template_id = p_template_id
    and s.status in ('submitted', 'reviewed')
    and (
      -- Sin trabajo programado o sin corridas todavia: cuenta todo.
      not exists (
        select 1
        from public.scheduled_jobs j
        where j.organization_id = p_organization_id
          and j.job_type = 'checklist_generator'
          and j.target_id = p_template_id
          and j.last_run_at is not null
      )
      or coalesce(s.submitted_at, s.created_at) >= (
        select j.last_run_at
        from public.scheduled_jobs j
        where j.organization_id = p_organization_id
          and j.job_type = 'checklist_generator'
          and j.target_id = p_template_id
        order by j.last_run_at desc nulls last
        limit 1
      )
    );
$$;

revoke all on function public.checklist_current_cycle_submissions(uuid, uuid) from public, anon;
grant execute on function public.checklist_current_cycle_submissions(uuid, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. El envio guarda el texto del item
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.submit_checklist_transaction(
  p_submission_id uuid,
  p_organization_id uuid,
  p_branch_id uuid,
  p_template_id uuid,
  p_submitted_by uuid,
  p_items jsonb,
  p_submitted_at timestamp with time zone
) returns void language plpgsql security definer as $$
declare
  v_item jsonb;
  v_att jsonb;
  v_label text;
begin
  insert into checklist_submissions (
    id, organization_id, branch_id, template_id, submitted_by, status, submitted_at
  ) values (
    p_submission_id, p_organization_id, p_branch_id, p_template_id, p_submitted_by, 'submitted', p_submitted_at
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
$$;

revoke all on function public.submit_checklist_transaction(uuid, uuid, uuid, uuid, uuid, jsonb, timestamp with time zone) from public, anon;
grant execute on function public.submit_checklist_transaction(uuid, uuid, uuid, uuid, uuid, jsonb, timestamp with time zone) to service_role;

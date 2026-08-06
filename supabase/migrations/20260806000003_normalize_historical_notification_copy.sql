UPDATE public.notifications
SET
  title = replace(replace(title, 'Usá', 'Usa'), 'usá', 'usa'),
  body = replace(replace(body, 'Usá', 'Usa'), 'usá', 'usa')
WHERE source = 'auth.mfa_challenge'
  AND concat_ws(' ', title, body) ~* '\musá\M';

UPDATE public.notifications
SET
  title = regexp_replace(title, '\mvos\M', 'tú', 'gi'),
  body = regexp_replace(body, '\mvos\M', 'tú', 'gi')
WHERE source = 'auth.mfa_challenge'
  AND concat_ws(' ', title, body) ~* '\mvos\M';

UPDATE public.notifications
SET
  title = replace(replace(title, 'Tenés', 'Tienes'), 'tenés', 'tienes'),
  body = replace(replace(body, 'Tenés', 'Tienes'), 'tenés', 'tienes')
WHERE source = 'documents_access_granted'
  AND concat_ws(' ', title, body) ~* '\mtenés\M';

UPDATE public.notifications
SET
  title = replace(replace(title, 'Legajo', 'Expediente'), 'legajo', 'expediente'),
  body = replace(replace(body, 'Legajo', 'Expediente'), 'legajo', 'expediente')
WHERE source = 'employee_document_added'
  AND concat_ws(' ', title, body) ~* '\mlegajo\M';

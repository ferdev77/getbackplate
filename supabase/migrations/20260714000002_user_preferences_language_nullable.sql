-- ============================================================
-- Permite distinguir "el usuario nunca eligio idioma" de "eligio
-- espanol a proposito". Antes, cualquier upsert parcial de
-- user_preferences (ej. el toggle de MFA, que no toca language)
-- terminaba fijando 'es' por el default de la columna, pisando el
-- default automatico por plan que se resuelve en la app
-- (ingles para cuentas con integracion QBO activa, salvo eleccion
-- explicita del usuario).
-- ============================================================

alter table public.user_preferences
  alter column language drop default,
  alter column language drop not null;

# GUIA OPERATIVA - CLI OBLIGATORIA

## Objetivo

Definir una regla unica y obligatoria para ejecucion tecnica en GetBackplate.

Regla base:

- Toda operacion tecnica se ejecuta por CLI y se deja trazabilidad.
- Las herramientas oficiales son: `Supabase CLI`, `Vercel CLI`, `GitHub CLI (gh)`.
- No se considera cerrado un trabajo si no hay validacion por CLI cuando aplica.

## Politica obligatoria

1. Base de datos y migraciones: siempre por `Supabase CLI`.
2. Deploy, variables y entorno productivo: siempre por `Vercel CLI`.
3. GitHub (PRs, checks, comments, estado de ramas): siempre por `GitHub CLI`.
4. Nunca delegar al usuario final la ejecucion de estos pasos si el agente/operador puede hacerlo.
5. Si una CLI no esta disponible, se documenta bloqueo y se instala/configura en el momento.

## Flujo minimo obligatorio por tipo de tarea

### A) Cambios de DB (Supabase)

Checklist:

- crear migracion: `supabase migration new <nombre>`
- validar estado: `supabase migration list`
- aplicar en entorno objetivo: `supabase db push`
- verificar tabla/politicas/funciones afectadas en DB remota

Si se usa `npx supabase`, tambien es valido, pero la regla sigue siendo uso de CLI.

### B) Deploy y entorno (Vercel)

Checklist:

- validar proyecto/link: `vercel project ls` o `vercel link`
- validar variables: `vercel env ls`
- desplegar: `vercel deploy` (o flujo definido por rama)
- inspeccionar estado: `vercel inspect <url-o-deployment-id>`

### C) Flujo repositorio (GitHub)

Checklist:

- validar rama/estado: `gh repo view` y `git status`
- crear o actualizar PR: `gh pr create` / `gh pr edit`
- revisar checks: `gh pr checks <numero|url>`
- revisar comentarios: `gh pr view --comments`

## Regla de comunicacion operativa

- No pedir al usuario que ejecute comandos de `supabase`, `vercel` o `gh` cuando el agente puede ejecutarlos.
- Responder siempre con:
  - que comando se corrio,
  - que resultado dio,
  - que decision tecnica se tomo.

## Atajo de verificacion rapida

- Supabase CLI: `supabase --version` o `npx supabase --version`
- Vercel CLI: `vercel --version`
- GitHub CLI: `gh --version`

## Resultado esperado

Con esta guia, cualquier persona del equipo encuentra rapido:

- que CLI usar en cada contexto,
- que secuencia minima seguir,
- como operar sin depender de pasos manuales del usuario.

# GUIA OPERATIVA - CUSTOM DOMAINS

Fecha: 2026-04-09  
Estado: Implementado y desplegado (DEV + PROD)

## 1) Objetivo

Dejar documentado, de punta a punta, el comportamiento real de Custom Domains:

- Que se implemento.
- Que no se implemento.
- Como funciona hoy en runtime.
- Checklist operativo para soporte, QA y despliegues.

## 2) Resumen ejecutivo

Hoy el modulo funciona asi:

- Cada empresa puede tener **1 solo dominio personalizado**.
- El dominio debe cargarse con formato `app.tudominio.com`.
- La resolucion por host esta centralizada en `proxy.ts` y tambien soporta estado `verifying_ssl`.
- El login y recuperacion de password en custom domain ya usan metadata tenant-aware (titulo de pestana + favicon de empresa).
- La UI bloquea crear mas de 1 dominio y oculta datos DNS cuando el dominio ya esta en `active`.

## 3) Cambios implementados (confirmados)

### 3.1 Resolucion tenant por host en proxy

Archivo: `web/src/proxy.ts`

- Se resuelve `organization_id` por `host` para dominios no reservados.
- Prioridad de cookie activa:
  1. Host custom domain (si matchea).
  2. `?org=`.
- Se ignoran hosts reservados (`localhost`, `*.vercel.app`, host canonico de app).

### 3.2 Resolver tenant durante SSL verification

Archivos:

- `web/src/proxy.ts`
- `web/src/shared/lib/custom-domains.ts`

Cambio aplicado:

- Antes se resolvia solo con `status = active`.
- Ahora se resuelve con `status in (active, verifying_ssl)`.

Impacto:

- Evita fallback a landing cuando el dominio ya esta conectado pero todavia en verificacion SSL.

### 3.3 Limite de 1 dominio por empresa (backend + DB)

Archivos:

- `web/src/app/api/company/custom-domains/route.ts`
- `supabase/migrations/20260409000100_limit_one_custom_domain_per_org.sql`

Backend:

- `POST /api/company/custom-domains` rechaza creacion si ya existe un dominio para la organizacion (`409`).
- Los nuevos dominios se crean con `is_primary = true`.

Base de datos:

- Migracion que elimina duplicados historicos por `organization_id` y deja solo 1 registro.
- `unique index` en `organization_domains(organization_id)`.

### 3.4 Fix de `verified_at` (primera verificacion inmutable)

Archivo: `web/src/app/api/company/custom-domains/recheck/route.ts`

- Se preserva `verified_at` ya existente.
- Solo se setea si no existia y el estado pasa a `active`.
- Ya no se sobreescribe por rechecks posteriores.

### 3.5 UI: 1 dominio, menos ruido y mejor UX

Archivo: `web/src/modules/settings/ui/custom-domain-settings-card.tsx`

Implementado:

- Modal de confirmacion para eliminar.
- Auto-dismiss de notices (5s).
- Enter en input para guardar.
- Throttle de 10s por dominio en Revalidar.
- Si ya existe un dominio, no se muestra formulario de alta.
- Si hay dominio `active`, se oculta bloque de configuracion DNS (CNAME/host/destino).

### 3.6 Metadata tenant-aware en auth

Archivos:

- `web/src/app/auth/login/page.tsx`
- `web/src/app/auth/forgot-password/page.tsx`
- `web/src/app/auth/recovery-link/page.tsx`
- `web/src/app/auth/change-password/page.tsx`
- `web/src/shared/lib/tenant-auth-branding.ts`

Implementado:

- `generateMetadata(...)` por pagina de auth tenantizada.
- Titulo dinamico por empresa (`Login | Nombre Empresa`, etc.).
- Favicon dinamico por empresa (`company_favicon_url`).

## 4) Que NO se implemento (a proposito)

- No hay soporte multi-dominio por empresa (el producto ahora es 1:1).
- No hay auto-promote real de dominio principal al eliminar (no aplica con limite 1 dominio).
- No se tenantizo metadata de `register` ni `select-organization`.
- No hay sincronizacion automatica DNS via APIs de registradores (Cloudflare/GoDaddy).

## 5) Como funciona hoy (flujo real)

### 5.1 Alta de dominio

1. Admin empresa entra a Settings > Custom URL.
2. Carga `app.tuempresa.com`.
3. API crea fila en `organization_domains` con `pending_dns`.
4. Se registra dominio en Vercel y se actualiza estado.

### 5.2 Configuracion DNS en proveedor del cliente

Registro esperado:

- Tipo: `CNAME`
- Host: `app`
- Destino: `cname.vercel-dns.com` (o target devuelto por Vercel)

### 5.3 Revalidacion

1. Admin toca `Revalidar`.
2. API consulta Vercel.
3. Se actualiza `status`, `verification_error`, `dns_target`, `last_checked_at`.

### 5.4 Resolucion runtime

1. Request llega por custom host.
2. Proxy busca `organization_id` en `organization_domains`.
3. Si hay match en `active` o `verifying_ssl`, setea cookie tenant activa.
4. Auth pages y accesos resuelven branding y contexto de esa empresa.

## 6) Estados operativos

Estados vigentes:

- `pending_dns`
- `verifying_ssl`
- `active`
- `error`
- `disabled`

Lectura recomendada:

- `pending_dns`: aun no detecta CNAME correcto.
- `verifying_ssl`: DNS ok, certificado en progreso.
- `active`: dominio operativo completo.
- `error`: fallo tecnico o de validacion.
- `disabled`: desactivado por operacion manual.

## 7) Checklist de operacion (DEV / PROD)

### 7.1 Checklist de despliegue

- [ ] `npx tsc --noEmit` en `web/` sin errores.
- [ ] Deploy a preview (`vercel --yes`) listo.
- [ ] Deploy a production (`vercel --prod --yes`) listo.
- [ ] Verificar alias del deployment (`vercel inspect <url> --wait`).

### 7.2 Checklist DB

- [ ] Migracion `20260409000100_limit_one_custom_domain_per_org.sql` aplicada en DEV.
- [ ] Migracion `20260409000100_limit_one_custom_domain_per_org.sql` aplicada en PROD.
- [ ] `organization_domains_one_per_org_idx` presente en ambos entornos.

### 7.3 Checklist funcional

- [ ] Crear dominio desde Settings con formato `app.*`.
- [ ] Ver en UI estado inicial + instrucciones DNS.
- [ ] Configurar CNAME real en proveedor DNS.
- [ ] Revalidar hasta `active`.
- [ ] Confirmar acceso por custom host a `/auth/login` tenantizado.
- [ ] Confirmar title + favicon en:
  - [ ] `/auth/login`
  - [ ] `/auth/forgot-password`
  - [ ] `/auth/recovery-link`
  - [ ] `/auth/change-password`
- [ ] Confirmar que no se ve formulario de alta si ya existe dominio.
- [ ] Confirmar que no se ve bloque DNS cuando estado es `active`.

## 8) Runbook de soporte rapido

### Caso A: custom host abre landing en vez de login tenant

Revisar:

1. Existe fila en `organization_domains` para ese host.
2. Estado en `active` o `verifying_ssl`.
3. Domain exacto coincide con `host` (sin typo, sin puerto).

### Caso B: no aparece favicon/titulo de empresa

Revisar:

1. Modulo `custom_branding` activo en tenant.
2. `organization_settings.company_favicon_url` cargado.
3. Probar hard refresh/incognito por cache de favicon.

### Caso C: no deja crear dominio

Esperado cuando ya existe 1 dominio para la empresa.

Resolucion:

- Eliminar dominio actual y luego crear nuevo.

## 9) Notas de seguridad y gobierno

- No usar `?org` para forzar tenant cuando hay host custom valido; manda el host.
- Mantener trazabilidad en `audit_logs` para create/verify/disable.
- Mantener credenciales Vercel y Supabase solo en entornos seguros.

## 10) Estado final de esta tanda

Resultado: modulo Custom Domains funcional para operacion real en DEV y PROD, con:

- Resolucion por host robusta.
- Auth tenantizado (UI + metadata).
- Limite de 1 dominio por empresa en API + DB.
- UX de Settings simplificada para evitar errores de operacion.
